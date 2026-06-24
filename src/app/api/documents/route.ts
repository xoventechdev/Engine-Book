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

    console.log(`\n[UPLOAD-DEBUG] ========== NEW UPLOAD REQUEST ==========`);
    console.log(`[UPLOAD-DEBUG] File: ${file?.name}, Size: ${file?.size}, Type: ${file?.type}`);
    console.log(`[UPLOAD-DEBUG] ProjectId: ${projectId}, Discipline: ${discipline}`);

    if (!file || !projectId) {
      console.log('[UPLOAD-DEBUG] ❌ Missing file or projectId');
      return NextResponse.json({ error: 'File and projectId are required' }, { status: 400 });
    }

    const fileType = getFileType(file.name);
    console.log(`[UPLOAD-DEBUG] Detected fileType: ${fileType}`);

    if (fileType === 'unknown') {
      console.log('[UPLOAD-DEBUG] ❌ Unknown file type');
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

    // Parse and chunk the document — await so chunks are guaranteed before response
    console.log(`[UPLOAD-DEBUG] Starting parseAndChunk for doc ${document.id}, type=${fileType}...`);
    let chunkCount = 0;
    try {
      chunkCount = await parseAndChunk(document.id, absoluteFilePath, fileType);
      console.log(`[UPLOAD-DEBUG] ✅ parseAndChunk returned ${chunkCount} chunks`);
    } catch (err) {
      console.error(`[UPLOAD-DEBUG] ❌ parseAndChunk THREW ERROR:`, err);
    }

    // Verify chunks were actually created
    const verifyChunks = await db.documentChunk.count({ where: { documentId: document.id } });
    console.log(`[UPLOAD-DEBUG] Verification: ${verifyChunks} chunks in DB for doc ${document.id}`);

    console.log(`[UPLOAD-DEBUG] ========== UPLOAD COMPLETE (${chunkCount} chunks) ==========\n`);

    return NextResponse.json({ ...document, chunkCount }, { status: 201 });
  } catch (error) {
    console.error('[UPLOAD-DEBUG] ❌ FATAL UPLOAD ERROR:', error);
    return NextResponse.json({ error: 'Failed to upload document' }, { status: 500 });
  }
}

async function parseAndChunk(documentId: string, absFilePath: string, fileType: string): Promise<number> {
  let fileBuffer: Buffer;
  try {
    fileBuffer = fs.readFileSync(absFilePath);
    console.log(`[CHUNK-DEBUG]   Read file: ${fileBuffer.length} bytes`);
  } catch (err) {
    console.error(`[CHUNK-DEBUG]   ❌ Cannot read file ${absFilePath}:`, err);
    return 0;
  }

  let pages: { text: string; pageNumber: number }[] = [];

  try {
    if (fileType === 'pdf') {
      console.log(`[CHUNK-DEBUG]   Parsing as PDF...`);
      const pdfResult = await extractPdfText(fileBuffer);
      pages = pdfResult.pages.filter(p => p.text.trim().length > 0);
      console.log(`[CHUNK-DEBUG]   PDF extracted: ${pdfResult.totalPages} total pages, ${pages.length} non-empty`);
    } else if (fileType === 'docx') {
      console.log(`[CHUNK-DEBUG]   Parsing as DOCX...`);
      const mammoth = await import('mammoth');
      const result = await mammoth.extractRawText({ buffer: fileBuffer });
      console.log(`[CHUNK-DEBUG]   DOCX extracted: ${result.value.length} chars`);
      const pageChunks = splitTextIntoPages(result.value, 3000);
      pages = pageChunks.map((text, i) => ({ text, pageNumber: i + 1 }));
    } else if (fileType === 'txt') {
      console.log(`[CHUNK-DEBUG]   Parsing as TXT...`);
      const text = fileBuffer.toString('utf-8');
      console.log(`[CHUNK-DEBUG]   TXT extracted: ${text.length} chars`);
      const pageChunks = splitTextIntoPages(text, 3000);
      pages = pageChunks.map((text, i) => ({ text, pageNumber: i + 1 }));
    } else if (fileType === 'xlsx' || fileType === 'csv') {
      console.log(`[CHUNK-DEBUG]   Parsing as ${fileType.toUpperCase()}...`);
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
      const text = jsonData.map((row) => row.filter(Boolean).join(' | ')).join('\n');
      console.log(`[CHUNK-DEBUG]   ${fileType.toUpperCase()} extracted: ${text.length} chars, ${jsonData.length} rows`);
      const pageChunks = splitTextIntoPages(text, 3000);
      pages = pageChunks.map((text, i) => ({ text, pageNumber: i + 1 }));
    }

    console.log(`[CHUNK-DEBUG]   Total pages for chunking: ${pages.length}`);

    // Generate chunks
    const chunks = fileType === 'pdf'
      ? chunkByPages(pages)
      : pages.flatMap((p) =>
          chunkText(p.text, 500, 50).map((c) => ({ ...c, pageNumber: p.pageNumber }))
        );

    console.log(`[CHUNK-DEBUG]   Generated ${chunks.length} chunks`);
    for (let i = 0; i < Math.min(chunks.length, 3); i++) {
      console.log(`[CHUNK-DEBUG]     Chunk ${i}: page=${chunks[i].pageNumber}, len=${chunks[i].text.length}, preview="${chunks[i].text.slice(0, 80).replace(/\n/g, '\\n')}"`);
    }
    if (chunks.length > 3) {
      console.log(`[CHUNK-DEBUG]     ... and ${chunks.length - 3} more chunks`);
    }

    // Store chunks in database
    if (chunks.length > 0) {
      const result = await db.documentChunk.createMany({
        data: chunks.map((chunk) => ({
          documentId,
          chunkIndex: chunk.index,
          pageNumber: chunk.pageNumber,
          text: chunk.text,
        })),
      });
      console.log(`[CHUNK-DEBUG]   ✅ DB createMany returned count: ${result.count}`);
    } else {
      console.warn(`[CHUNK-DEBUG]   ⚠️  No chunks generated! Document text may be empty.`);
    }

    return chunks.length;
  } catch (error) {
    console.error(`[CHUNK-DEBUG]   ❌ Error during parsing:`, error);
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