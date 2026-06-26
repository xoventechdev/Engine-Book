import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getFileType } from '@/lib/helpers';
import { chunkText } from '@/lib/chunker';
import { getOwnerId, getOwnedProject, notOwnedResponse, unauthenticatedResponse } from '@/lib/owner';
import path from 'path';
import fs from 'fs';

export async function GET(request: NextRequest) {
  try {
    const projectId = request.nextUrl.searchParams.get('projectId');
    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
    }

    const ownerId = await getOwnerId();
    if (!ownerId) return unauthenticatedResponse();
    const project = await getOwnedProject(projectId, ownerId);
    if (!project) return notOwnedResponse();

    const documents = await db.document.findMany({
      where: { projectId },
      orderBy: { uploadedAt: 'desc' },
    });

    return NextResponse.json(documents);
  } catch (error) {
    console.error('Failed to fetch documents:', error);
    return NextResponse.json({ error: 'Failed to fetch documents' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const projectId = formData.get('projectId') as string | null;
    const discipline = (formData.get('discipline') as string) || 'General';

    if (!file || !projectId) {
      return NextResponse.json({ error: 'File and projectId are required' }, { status: 400 });
    }

    // Reject files larger than 25 MB
    const MAX_FILE_SIZE = 25 * 1024 * 1024;
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File too large. Maximum size is 25 MB. (${file.name} is ${(file.size / 1024 / 1024).toFixed(1)} MB)` },
        { status: 413 }
      );
    }

    const ownerId = await getOwnerId();
    if (!ownerId) return unauthenticatedResponse();
    const project = await getOwnedProject(projectId, ownerId);
    if (!project) return notOwnedResponse();

    const fileType = getFileType(file.name);

    if (fileType === 'unknown') {
      return NextResponse.json(
        { error: 'Unsupported file type. Supported: PDF, DOCX, TXT, XLSX, CSV' },
        { status: 400 }
      );
    }

    // Save file to disk
    const fileBuffer = Buffer.from(await file.arrayBuffer());

    const uploadDir = path.join(process.cwd(), 'db', 'uploads', projectId);
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    const absoluteFilePath = path.join(uploadDir, file.name);
    fs.writeFileSync(absoluteFilePath, fileBuffer);
    const relativeFilePath = path.join('db', 'uploads', projectId, file.name);

    // Create document record
    const document = await db.document.create({
      data: {
        projectId,
        filename: file.name,
        fileType,
        fileSize: file.size,
        filePath: relativeFilePath,
        discipline,
      },
    });
    console.log(`[UPLOAD-DEBUG] Document record created: ${document.id}`);

    // For PDFs: skip text extraction entirely — Gemini will read the raw PDF directly
    // For non-PDFs: parse and chunk now so they're searchable
    let chunkCount = 0;
    if (fileType !== 'pdf') {
      chunkCount = await parseAndChunkNonPdf(document.id, absoluteFilePath, fileType);
    }

    return NextResponse.json({
      ...document,
      chunkCount,
      debug: {
        fileType,
        fileSize: fileBuffer.length,
        chunkCount,
        isPdfDirectMode: fileType === 'pdf',
      }
    }, { status: 201 });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json({ error: 'Failed to upload document' }, { status: 500 });
  }
}

/**
 * Parse and chunk non-PDF files (DOCX, TXT, XLSX, CSV).
 * PDFs are NOT chunked — they are sent as raw base64 to Gemini at chat time.
 */
async function parseAndChunkNonPdf(documentId: string, absFilePath: string, fileType: string): Promise<number> {
  let fileBuffer: Buffer;
  try {
    fileBuffer = fs.readFileSync(absFilePath);
  } catch (err) {
    console.error(`[CHUNK-DEBUG] Cannot read file ${absFilePath}:`, err);
    return 0;
  }

  let fullText = '';

  try {
    if (fileType === 'docx') {
      const mammoth = await import('mammoth');
      const result = await mammoth.extractRawText({ buffer: fileBuffer });
      fullText = result.value;
    } else if (fileType === 'txt') {
      fullText = fileBuffer.toString('utf-8');
    } else if (fileType === 'xlsx' || fileType === 'csv') {
      const XLSX = await import('xlsx');
      let jsonData: string[][] = [];
      if (fileType === 'xlsx') {
        const workbook = XLSX.read(fileBuffer);
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as string[][];
      } else {
        const csvText = fileBuffer.toString('utf-8');
        jsonData = XLSX.utils.sheet_to_json(
          XLSX.utils.aoa_to_sheet(
            csvText.split('\n').map((row) => row.split(','))
          ),
          { header: 1 }
        ) as string[][];
      }
      fullText = jsonData.map((row) => row.filter(Boolean).join(' | ')).join('\n');
    }

    if (!fullText.trim()) return 0;

    // Split into page-sized chunks and store
    const pages = splitTextIntoPages(fullText, 3000);
    const chunks = pages.flatMap((p, pageIdx) =>
      chunkText(p, 500, 50).map((c) => ({
        ...c,
        pageNumber: pageIdx + 1,
      }))
    );

    if (chunks.length > 0) {
      await db.documentChunk.createMany({
        data: chunks.map((chunk) => ({
          documentId,
          chunkIndex: chunk.index,
          pageNumber: chunk.pageNumber,
          text: chunk.text,
        })),
      });
    }

    return chunks.length;
  } catch (error) {
    console.error(`[CHUNK-DEBUG] Error parsing ${fileType}:`, error);
    return 0;
  }
}

function splitTextIntoPages(text: string, charsPerPage: number): string[] {
  if (!text || text.trim().length === 0) return [];
  const pages: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + charsPerPage, text.length);
    if (end < text.length) {
      const lastBreak = Math.max(
        text.lastIndexOf('\n', end),
        text.lastIndexOf('. ', end)
      );
      if (lastBreak > start + 500) {
        end = lastBreak + 1;
      }
    }
    pages.push(text.slice(start, end).trim());
    start = end;
  }
  return pages.filter((p) => p.length > 0);
}