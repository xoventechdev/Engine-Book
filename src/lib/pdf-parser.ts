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
  const { PDFParse, VerbosityLevel } = await import('pdf-parse');

  const parser = new PDFParse({
    data: new Uint8Array(fileBuffer),
    verbosity: VerbosityLevel.ERRORS,
  });

  const result = await parser.getText();

  return {
    fullText: result.text,
    pages: result.pages.map((p: { text: string; num: number }) => ({
      text: p.text,
      pageNumber: p.num,
    })),
    totalPages: result.total,
  };
}