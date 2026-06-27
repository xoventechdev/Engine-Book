import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getFileType } from '@/lib/helpers';
import { chunkText } from '@/lib/chunker';
import { getOwnerId, getOwnedProject, notOwnedResponse, unauthenticatedResponse } from '@/lib/owner';
import { uploadDocumentFile } from '@/lib/storage';

// MIME types for the storage upload — Supabase stores the content-type
// header with the object and re-serves it on download.
const CONTENT_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt: 'text/plain; charset=utf-8',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv; charset=utf-8',
};

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

    const fileBuffer = Buffer.from(await file.arrayBuffer());

    // Create the document record first so we have a stable id to use in the
    // storage path. The filePath is updated after a successful upload.
    const document = await db.document.create({
      data: {
        projectId,
        filename: file.name,
        fileType,
        fileSize: file.size,
        filePath: '', // filled in after the storage upload succeeds
        discipline,
      },
    });
    console.log(`[UPLOAD-DEBUG] Document record created: ${document.id}`);

    // Upload the raw bytes to Supabase Storage.
    let storagePath = '';
    try {
      storagePath = await uploadDocumentFile(
        projectId,
        document.id,
        file.name,
        fileBuffer,
        CONTENT_TYPES[fileType] || 'application/octet-stream',
      );
    } catch (uploadErr) {
      // Roll back the DB row so we don't keep an orphan document with no file.
      await db.document.delete({ where: { id: document.id } }).catch(() => {});
      console.error('[UPLOAD-DEBUG] Storage upload failed:', uploadErr);
      return NextResponse.json(
        { error: 'Failed to upload file to storage. Please try again.' },
        { status: 500 }
      );
    }

    // Persist the storage path on the document row.
    await db.document.update({ where: { id: document.id }, data: { filePath: storagePath } });

    // For PDFs: skip text extraction entirely — Gemini will read the raw PDF
    // directly at chat time. For non-PDFs: parse and chunk now from the
    // in-memory buffer (no need to re-download from storage).
    let chunkCount = 0;
    if (fileType !== 'pdf') {
      try {
        chunkCount = await parseAndChunkNonPdf(document.id, fileBuffer, fileType);
      } catch (parseErr) {
        console.error(`[UPLOAD-DEBUG] Parsing failed for ${file.name}:`, parseErr);
        // Not fatal — the file is stored; chunks can be regenerated on demand.
      }
    }

    return NextResponse.json({
      ...document,
      filePath: storagePath,
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
 * Parse and chunk non-PDF files (DOCX, TXT, XLSX, CSV) directly from the
 * in-memory upload buffer. PDFs are NOT chunked — they are sent as raw
 * base64 to Gemini at chat time.
 */
async function parseAndChunkNonPdf(documentId: string, fileBuffer: Buffer, fileType: string): Promise<number> {
  let fullText = '';

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
