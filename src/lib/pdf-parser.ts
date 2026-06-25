/**
 * PDF text extraction using pdfjs-dist → PNG → Gemini VLM
 * Renders each PDF page as a PNG image, then uses the vision model to OCR/extract text.
 */

import ZAI from 'z-ai-web-dev-sdk';

export interface PDFTextResult {
  fullText: string;
  pages: { text: string; pageNumber: number }[];
  totalPages: number;
}

export async function extractPdfText(fileBuffer: Buffer): Promise<PDFTextResult> {
  console.log(`[PDF-DEBUG] extractPdfText called, buffer size: ${fileBuffer.length} bytes`);

  // 1. Load PDF with pdfjs-dist
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const path = await import('path');
  (pdfjsLib as any).GlobalWorkerOptions.workerSrc = path.join(process.cwd(), 'node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs');

  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(fileBuffer) }).promise;
  const totalPages = doc.numPages;
  console.log(`[PDF-DEBUG] PDF loaded: ${totalPages} page(s)`);

  // 2. Initialize VLM + canvas
  const zai = await ZAI.create();
  const { createCanvas } = await import('canvas') as any;

  // 3. Render each page to PNG, send to VLM
  const pages: { text: string; pageNumber: number }[] = [];

  for (let i = 1; i <= totalPages; i++) {
    console.log(`[PDF-DEBUG] Processing page ${i}/${totalPages}...`);
    const page = await doc.getPage(i);
    const viewport = page.getViewport({ scale: 2.0 });
    const canvas = createCanvas(viewport.width, viewport.height);
    const ctx = canvas.getContext('2d');

    await page.render({ canvasContext: ctx, viewport }).promise;
    const pngBuffer = canvas.toBuffer('image/png');
    const base64Png = pngBuffer.toString('base64');
    console.log(`[PDF-DEBUG]   Page ${i} rendered: ${pngBuffer.length} bytes PNG`);

    // Send to VLM
    const response = await zai.chat.completions.createVision({
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Extract ALL text from this document page image. Return ONLY the extracted text content as plain text. Preserve headings, tables, and structure. Do NOT add any commentary or explanations.',
            },
            {
              type: 'image_url',
              image_url: { url: `data:image/png;base64,${base64Png}` },
            },
          ],
        },
      ],
      thinking: { type: 'disabled' },
    });

    const pageText = response.choices[0]?.message?.content || '';
    const preview = pageText.slice(0, 100).replace(/\n/g, '\\n');
    console.log(`[PDF-DEBUG]   Page ${i} VLM extracted: ${pageText.length} chars — "${preview}${pageText.length > 100 ? '...' : ''}"`);

    if (pageText.trim()) {
      pages.push({ text: pageText, pageNumber: i });
    }
  }

  const fullText = pages.map(p => p.text).join('\n\n');
  console.log(`[PDF-DEBUG] Done: ${pages.length}/${totalPages} non-empty pages, ${fullText.length} total chars`);

  if (fullText.trim().length === 0) {
    console.warn('[PDF-DEBUG] ⚠️ No text extracted from any page');
  }

  return { fullText, pages, totalPages };
}