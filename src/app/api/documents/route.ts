import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getFileType } from '@/lib/helpers';
import { chunkText } from '@/lib/chunker';
import path from 'path';
import fs from 'fs';

export async function GET(request: NextRequest) {
  try {
    const projectId = request.nextUrl.searchParams.get('projectId');
    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
    }

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

    console.log(`\n[UPLOAD-DEBUG] ========== NEW UPLOAD REQUEST ==========`);
    console.log(`[UPLOAD-DEBUG] File: ${file?.name}, Size: ${file?.size}, Type: ${file?.type}`);
    console.log(`[UPLOAD-DEBUG] ProjectId: ${projectId}, Discipline: ${discipline}`);

    if (!file || !projectId) {
      console.log('[UPLOAD-DEBUG] Missing file or projectId');
      return NextResponse.json({ error: 'File and projectId are required' }, { status: 400 });
    }

    const fileType = getFileType(file.name);
    console.log(`[UPLOAD-DEBUG] Detected fileType: ${fileType}`);

    if (fileType === 'unknown') {
      console.log('[UPLOAD-DEBUG] Unknown file type');
      return NextResponse.json(
        { error: 'Unsupported file type. Supported: PDF, DOCX, TXT, XLSX, CSV' },
        { status: 400 }
      );
    }

    // Save file to disk
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    console.log(`[UPLOAD-DEBUG] File buffer created, size: ${fileBuffer.length} bytes`);

    const uploadDir = path.join(process.cwd(), 'db', 'uploads', projectId);
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    const absoluteFilePath = path.join(uploadDir, file.name);
    fs.writeFileSync(absoluteFilePath, fileBuffer);
    const relativeFilePath = path.join('db', 'uploads', projectId, file.name);
    console.log(`[UPLOAD-DEBUG] File saved to: ${absoluteFilePath}`);
    console.log(`[UPLOAD-DEBUG] File exists on disk: ${fs.existsSync(absoluteFilePath)}`);

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
      console.log(`[UPLOAD-DEBUG] Starting text extraction for ${fileType}...`);
      chunkCount = await parseAndChunkNonPdf(document.id, absoluteFilePath, fileType);
      console.log(`[UPLOAD-DEBUG] Created ${chunkCount} text chunks`);
    } else {
      console.log(`[UPLOAD-DEBUG] PDF saved — will use Gemini native PDF reading at chat time`);
    }

    console.log(`[UPLOAD-DEBUG] ========== UPLOAD COMPLETE ==========`);

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
    console.error('[UPLOAD-DEBUG] FATAL UPLOAD ERROR:', error);
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