// Text chunking utility for RAG pipeline
// Splits documents into overlapping chunks for search and retrieval

const DEFAULT_CHUNK_SIZE = 500;
const DEFAULT_OVERLAP = 50;
const MIN_CHUNK_SIZE = 100;

export interface TextChunk {
  text: string;
  index: number;
  pageNumber?: number;
}

/**
 * Split text into overlapping chunks by character count
 */
export function chunkText(
  text: string,
  chunkSize: number = DEFAULT_CHUNK_SIZE,
  overlap: number = DEFAULT_OVERLAP
): TextChunk[] {
  if (!text || text.trim().length === 0) return [];

  const chunks: TextChunk[] = [];
  let start = 0;

  while (start < text.length) {
    let end = Math.min(start + chunkSize, text.length);

    // Try to break at a sentence boundary
    if (end < text.length) {
      const lastPeriod = text.lastIndexOf('.', end);
      const lastNewline = text.lastIndexOf('\n', end);
      const breakPoint = Math.max(lastPeriod, lastNewline);

      if (breakPoint > start + MIN_CHUNK_SIZE) {
        end = breakPoint + 1;
      }
    }

    const chunkText = text.slice(start, end).trim();
    if (chunkText.length > 0) {
      chunks.push({
        text: chunkText,
        index: chunks.length,
      });
    }

    // Move forward, accounting for overlap
    start = end - overlap;
    if (start >= text.length - MIN_CHUNK_SIZE) break;
    if (chunks.length > 2000) break; // Safety limit
  }

  return chunks;
}

/**
 * Split text by pages (for PDF page-aware chunking)
 */
export function chunkByPages(
  pages: { text: string; pageNumber: number }[],
  chunkSize: number = DEFAULT_CHUNK_SIZE,
  overlap: number = DEFAULT_OVERLAP
): TextChunk[] {
  const allChunks: TextChunk[] = [];
  let globalIndex = 0;

  for (const page of pages) {
    if (!page.text || page.text.trim().length === 0) continue;

    const pageChunks = chunkText(page.text, chunkSize, overlap);
    for (const chunk of pageChunks) {
      allChunks.push({
        ...chunk,
        index: globalIndex++,
        pageNumber: page.pageNumber,
      });
    }
  }

  return allChunks;
}

/**
 * Extract keywords from a query for text search
 */
export function extractKeywords(query: string): string[] {
  // Remove common stop words
  const stopWords = new Set([
    'what', 'is', 'the', 'a', 'an', 'of', 'in', 'to', 'for', 'and',
    'or', 'but', 'with', 'at', 'by', 'from', 'how', 'does', 'do',
    'can', 'could', 'would', 'should', 'are', 'was', 'were', 'been',
    'being', 'have', 'has', 'had', 'this', 'that', 'these', 'those',
    'which', 'who', 'whom', 'where', 'when', 'why', 'tell', 'me',
    'about', 'please', 'give', 'show', 'find', 'list', 'all', 'any',
  ]);

  return query
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 1 && !stopWords.has(word));
}

/**
 * Score a chunk against query keywords
 */
export function scoreChunk(chunk: string, keywords: string[]): number {
  const lowerChunk = chunk.toLowerCase();
  let score = 0;

  for (const keyword of keywords) {
    const regex = new RegExp(keyword.toLowerCase(), 'gi');
    const matches = lowerChunk.split(keyword.toLowerCase()).length - 1;
    score += matches * (keyword.length > 3 ? 2 : 1); // Longer keywords score higher
  }

  return score;
}

/**
 * Search chunks and return top-N most relevant
 */
export function searchChunks(
  chunks: { text: string; id: string; documentId: string; pageNumber: number | null; documentName: string }[],
  query: string,
  topK: number = 8
): typeof chunks {
  const keywords = extractKeywords(query);
  if (keywords.length === 0) return chunks.slice(0, topK);

  const scored = chunks.map(chunk => ({
    ...chunk,
    score: scoreChunk(chunk.text, keywords),
  }));

  scored.sort((a, b) => b.score - a.score);
  return scored.filter(s => s.score > 0).slice(0, topK) as typeof chunks;
}