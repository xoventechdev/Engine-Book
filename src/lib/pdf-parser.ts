/**
 * PDF text extraction via LLM.
 *
 * Sends the raw PDF file to the configured AI provider (Gemini / Anthropic)
 * which can read PDFs natively, and asks it to extract all text. This avoids
 * the need for native canvas/Cairo bindings (which fail to compile on Windows)
 * that the previous pdfjs-dist → PNG → VLM OCR approach required.
 *
 * For OpenAI-compatible providers that don't support file attachments, this
 * returns an empty result — the chat route already handles PDFs for those
 * providers by sending raw base64 in the prompt.
 */

import { generateChatWithFiles, type AISettings, type AIFile } from '@/lib/ai';

export interface PDFTextResult {
  fullText: string;
  pages: { text: string; pageNumber: number }[];
  totalPages: number;
}

const EXTRACT_PROMPT =
  'Extract ALL text from this PDF document. Return ONLY the extracted text content as plain text. ' +
  'Preserve headings, tables, lists, and structure. Do NOT add any commentary, explanations, or summaries. ' +
  'Do NOT wrap the output in markdown code blocks. Return raw text only.';

export async function extractPdfText(fileBuffer: Buffer, settings?: AISettings): Promise<PDFTextResult> {
  // Build the AIFile for the LLM call
  const aiFile: AIFile = {
    filename: 'document.pdf',
    mimeType: 'application/pdf',
    data: fileBuffer,
  };

  const messages = [
    { role: 'user' as const, content: EXTRACT_PROMPT },
  ];

  const fullText = await generateChatWithFiles(messages, [aiFile], undefined, settings);

  if (!fullText || !fullText.trim()) {
    return { fullText: '', pages: [], totalPages: 0 };
  }

  return {
    fullText: fullText.trim(),
    pages: [{ text: fullText.trim(), pageNumber: 1 }],
    totalPages: 1,
  };
}
