import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getFileType } from '@/lib/helpers';
import { chunkByPages, chunkText } from '@/lib/chunker';
import { extractPdfText } from '@/lib/pdf-parser';
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

    if (!file || !projectId) {
      return NextResponse.json({ error: 'File and projectId are required' }, { status: 400 });
    }

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

    // Parse and chunk the document in the background
    parseAndChunk(document.id, absoluteFilePath, fileType).catch((err) => {
      console.error(`Failed to parse document ${document.id}:`, err);
    });

    return NextResponse.json(document, { status: 201 });
  } catch (error) {
    console.error('Failed to upload document:', error);
    return NextResponse.json({ error: 'Failed to upload document' }, { status: 500 });
  }
}

async function parseAndChunk(documentId: string, absFilePath: string, fileType: string) {
  let fileBuffer: Buffer;
  try {
    fileBuffer = fs.readFileSync(absFilePath);
  } catch (err) {
    console.error(`Cannot read file ${absFilePath}:`, err);
    return;
  }

  let pages: { text: string; pageNumber: number }[] = [];

  try {
    if (fileType === 'pdf') {
      const pdfResult = await extractPdfText(fileBuffer);
      pages = pdfResult.pages.filter(p => p.text.trim().length > 0);
    } else if (fileType === 'docx') {
      const mammoth = await import('mammoth');
      const result = await mammoth.extractRawText({ buffer: fileBuffer });
      const pageChunks = splitTextIntoPages(result.value, 3000);
      pages = pageChunks.map((text, i) => ({ text, pageNumber: i + 1 }));
    } else if (fileType === 'txt') {
      const text = fileBuffer.toString('utf-8');
      const pageChunks = splitTextIntoPages(text, 3000);
      pages = pageChunks.map((text, i) => ({ text, pageNumber: i + 1 }));
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
      // Convert rows to text chunks
      const text = jsonData
        .map((row) => row.filter(Boolean).join(' | '))
        .join('\n');
      const pageChunks = splitTextIntoPages(text, 3000);
      pages = pageChunks.map((text, i) => ({ text, pageNumber: i + 1 }));
    }

    // Generate chunks
    const chunks = fileType === 'pdf'
      ? chunkByPages(pages)
      : pages.flatMap((p) =>
          chunkText(p.text, 500, 50).map((c) => ({ ...c, pageNumber: p.pageNumber }))
        );

    // Store chunks in database
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
  } catch (error) {
    console.error(`Error parsing document ${documentId}:`, error);
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