/**
 * Shared helpers for extracting text from documents.
 *
 * Used by graph, report, and compare routes. Consolidates the duplicated
 * chunk-reading + file-parsing fallback logic that was copy-pasted across
 * multiple API routes.
 *
 * Files are stored in Supabase Storage (see `@/lib/storage`). When a
 * document has no chunks yet, we download its bytes from storage and parse
 * them on demand, then cache the result as chunks for future requests.
 */

import { db } from '@/lib/db';
import { extractPdfText } from '@/lib/pdf-parser';
import { downloadDocumentFile } from '@/lib/storage';
import type { AISettings } from '@/lib/ai';

/**
 * Collect combined text from all documents in a project.
 *
 * For non-PDFs: reads existing DocumentChunk rows.
 * For PDFs (which are never chunked at upload time): falls back to
 *   extractPdfText (sends the raw PDF to the LLM for text extraction) when
 *   there are no chunks.
 *
 * @param projectId  The project to collect text from.
 * @param maxChars   Truncate the combined text to this many characters.
 * @param settings   AI settings (needed for PDF OCR which calls the VLM).
 * @param perDocChunkLimit  Max chunks to sample per document (for graph).
 */
export async function collectProjectText(
  projectId: string,
  maxChars: number,
  settings?: AISettings,
  perDocChunkLimit?: number,
): Promise<{ text: string; docCount: number }> {
  const documents = await db.document.findMany({
    where: { projectId },
    select: { id: true, filename: true, fileType: true, filePath: true },
  });

  if (documents.length === 0) {
    return { text: '', docCount: 0 };
  }

  const parts: string[] = [];

  for (const doc of documents) {
    let chunks = await db.documentChunk.findMany({
      where: { documentId: doc.id },
      orderBy: { chunkIndex: 'asc' },
      ...(perDocChunkLimit ? { take: perDocChunkLimit } : {}),
      select: { text: true },
    });

    // PDF fallback: if no chunks exist and it's a PDF, OCR the file.
    if (chunks.length === 0 && doc.fileType === 'pdf') {
      try {
        if (doc.filePath) {
          const fileBuffer = await downloadDocumentFile(doc.filePath);
          const pdfResult = await extractPdfText(fileBuffer, settings);
          if (pdfResult.fullText.trim()) {
            // Create chunks from the extracted text so future requests
            // don't need to re-OCR the same PDF.
            const { chunkText } = await import('@/lib/chunker');
            const pages = splitTextIntoPages(pdfResult.fullText, 3000);
            const newChunks = pages.flatMap((p, pageIdx) =>
              chunkText(p, 500, 50).map((c) => ({ ...c, pageNumber: pageIdx + 1 }))
            );
            if (newChunks.length > 0) {
              await db.documentChunk.createMany({
                data: newChunks.map((c) => ({
                  documentId: doc.id,
                  chunkIndex: c.index,
                  pageNumber: c.pageNumber,
                  text: c.text,
                })),
              });
            }
            chunks = newChunks.map((c) => ({ text: c.text }));
          }
        }
      } catch (err) {
        console.error(`[collectProjectText] PDF OCR failed for ${doc.filename}:`, err);
      }
    }

    // Non-PDF fallback: if no chunks exist and it's a non-PDF, parse the file.
    if (chunks.length === 0 && doc.fileType !== 'pdf') {
      try {
        if (doc.filePath) {
          const fileBuffer = await downloadDocumentFile(doc.filePath);
          const fullText = await parseNonPdfText(fileBuffer, doc.fileType);
          if (fullText.trim()) {
            const { chunkText } = await import('@/lib/chunker');
            const pages = splitTextIntoPages(fullText, 3000);
            const newChunks = pages.flatMap((p, pageIdx) =>
              chunkText(p, 500, 50).map((c) => ({ ...c, pageNumber: pageIdx + 1 }))
            );
            if (newChunks.length > 0) {
              await db.documentChunk.createMany({
                data: newChunks.map((c) => ({
                  documentId: doc.id,
                  chunkIndex: c.index,
                  pageNumber: c.pageNumber,
                  text: c.text,
                })),
              });
            }
            chunks = newChunks.map((c) => ({ text: c.text }));
          }
        }
      } catch (err) {
        console.error(`[collectProjectText] Parse failed for ${doc.filename}:`, err);
      }
    }

    const docText = chunks.map((c) => c.text).join('\n\n');
    if (docText.trim()) {
      parts.push(`=== ${doc.filename} ===\n${docText}`);
    }
  }

  const combined = parts.join('\n\n').slice(0, maxChars);
  return { text: combined, docCount: documents.length };
}

/**
 * Extract text from a single document (used by compare route).
 * Tries chunks first, then falls back to parsing the stored file.
 */
export async function extractDocumentText(
  doc: { id: string; fileType: string; filePath: string },
  settings?: AISettings,
): Promise<string> {
  const chunks = await db.documentChunk.findMany({
    where: { documentId: doc.id },
    orderBy: { chunkIndex: 'asc' },
    select: { text: true },
  });

  if (chunks.length > 0) {
    return chunks.map((c) => c.text).join('\n\n');
  }

  if (!doc.filePath) return '';

  const fileBuffer = await downloadDocumentFile(doc.filePath);

  if (doc.fileType === 'pdf') {
    const pdfResult = await extractPdfText(fileBuffer, settings);
    return pdfResult.fullText;
  }

  return parseNonPdfText(fileBuffer, doc.fileType);
}

/** Parse text from a non-PDF file buffer (DOCX, TXT, XLSX, CSV). */
async function parseNonPdfText(fileBuffer: Buffer, fileType: string): Promise<string> {
  if (fileType === 'docx') {
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ buffer: fileBuffer });
    return result.value;
  }
  if (fileType === 'txt') {
    return fileBuffer.toString('utf-8');
  }
  if (fileType === 'xlsx' || fileType === 'csv') {
    const XLSX = await import('xlsx');
    const workbook = XLSX.read(fileBuffer);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as string[][];
    return rows.map((r) => r.join(' | ')).join('\n');
  }

  return '';
}

/** Split text into pseudo-pages of approximately `charsPerPage` characters. */
export function splitTextIntoPages(text: string, charsPerPage: number): string[] {
  if (!text || text.trim().length === 0) return [];
  const pages: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + charsPerPage, text.length);
    if (end < text.length) {
      const lastBreak = Math.max(
        text.lastIndexOf('\n', end),
        text.lastIndexOf('. ', end),
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
