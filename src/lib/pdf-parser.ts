/**
 * PDF text extraction utility using pdf-parse v5 API
 * Wraps the new class-based API for consistent usage across the app
 */

interface PDFTextResult {
  fullText: string;
  pages: { text: string; pageNumber: number }[];
  totalPages: number;
}

export async function extractPdfText(fileBuffer: Buffer): Promise<PDFTextResult> {
  console.log(`[PDF-DEBUG] extractPdfText called, buffer size: ${fileBuffer.length} bytes`);

  const { PDFParse, VerbosityLevel } = await import('pdf-parse');
  console.log('[PDF-DEBUG] pdf-parse imported successfully');

  const parser = new PDFParse({
    data: new Uint8Array(fileBuffer),
    verbosity: VerbosityLevel.ERRORS,
  });
  console.log('[PDF-DEBUG] PDFParse instance created');

  const result = await parser.getText();
  console.log(`[PDF-DEBUG] getText() done — total: ${result.total} pages, fullText length: ${result.text?.length || 0}`);

  // Log each page
  for (const p of (result.pages || [])) {
    const preview = (p.text || '').slice(0, 120).replace(/\n/g, '\\n');
    console.log(`[PDF-DEBUG]   Page ${p.num}: ${preview}${(p.text || '').length > 120 ? '...' : ''}`);
  }

  if (!result.text || result.text.trim().length === 0) {
    console.warn('[PDF-DEBUG] ⚠️  Extracted text is EMPTY — PDF may be image-based/scanned');
  }

  return {
    fullText: result.text,
    pages: result.pages.map((p: { text: string; num: number }) => ({
      text: p.text,
      pageNumber: p.num,
    })),
    totalPages: result.total,
  };
}