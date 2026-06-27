/**
 * Agent tools — the actions the AI agent can invoke during the agentic
 * research loop.
 *
 * Each tool has:
 *   - A `ToolDefinition` (name, description, parameter schema) that is sent
 *     to the LLM so it knows what it can call.
 *   - An executor function that runs server-side with access to the database
 *     and Supabase Storage.
 *
 * The agent loop calls `executeTool()` when the LLM requests a tool call.
 * The result string is fed back to the LLM as a tool response.
 */

import { db } from '@/lib/db';
import { searchChunks } from '@/lib/chunker';
import { extractDocumentText } from '@/lib/document-text';
import type { ToolDefinition, ToolContext } from './types';

// ---------------------------------------------------------------------------
// Tool definitions (sent to the LLM)
// ---------------------------------------------------------------------------

export const AGENT_TOOLS: ToolDefinition[] = [
  {
    name: 'list_documents',
    description:
      'List all documents available in the current project. Returns each document\'s ID, filename, type (pdf/docx/txt/xlsx/csv), size, and discipline. Always call this first to see what documents you have access to before searching or reading.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'search_documents',
    description:
      'Search for keywords across all non-PDF documents in the project. Returns matching text passages with their source document name and page number. Use this to find relevant sections quickly. Note: PDFs are not searched by this tool — use read_document for PDFs.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query — keywords or phrases to look for in the documents.',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'read_document',
    description:
      'Read the full text content of a specific document. For PDFs, this extracts text using AI vision (may take a few seconds on first call, then it is cached). For DOCX/TXT/XLSX/CSV, returns the stored text. Use the documentId from list_documents. You can optionally limit the number of pages returned.',
    parameters: {
      type: 'object',
      properties: {
        documentId: {
          type: 'string',
          description: 'The ID of the document to read (from list_documents).',
        },
        maxPages: {
          type: 'number',
          description: 'Optional: maximum number of pages to return (default: all pages).',
        },
      },
      required: ['documentId'],
    },
  },
];

// ---------------------------------------------------------------------------
// Tool executor — dispatches to the right function
// ---------------------------------------------------------------------------

export async function executeTool(
  toolName: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<string> {
  switch (toolName) {
    case 'list_documents':
      return executeListDocuments(ctx);
    case 'search_documents':
      return executeSearchDocuments(args, ctx);
    case 'read_document':
      return executeReadDocument(args, ctx);
    default:
      return `Error: Unknown tool "${toolName}". Available tools: ${AGENT_TOOLS.map(t => t.name).join(', ')}`;
  }
}

// ---------------------------------------------------------------------------
// Individual tool executors
// ---------------------------------------------------------------------------

async function executeListDocuments(ctx: ToolContext): Promise<string> {
  const documents = await db.document.findMany({
    where: { projectId: ctx.projectId },
    select: {
      id: true,
      filename: true,
      fileType: true,
      fileSize: true,
      discipline: true,
    },
    orderBy: { uploadedAt: 'desc' },
  });

  if (documents.length === 0) {
    return 'No documents found in this project. The user has not uploaded any documents yet.';
  }

  const lines = documents.map((d) =>
    `- documentId: "${d.id}" | filename: "${d.filename}" | type: ${d.fileType} | size: ${(d.fileSize / 1024).toFixed(1)} KB | discipline: ${d.discipline}`
  );
  return `Found ${documents.length} document(s) in this project:\n${lines.join('\n')}`;
}

async function executeSearchDocuments(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<string> {
  const query = String(args.query || '');

  if (!query) return 'Error: the "query" parameter is required.';

  // Get all documents in the project
  const documents = await db.document.findMany({
    where: { projectId: ctx.projectId },
    select: { id: true, filename: true, fileType: true },
  });

  const docNameMap = new Map<string, string>(
    documents.map((d) => [d.id, d.filename] as [string, string])
  );

  // Get chunks for non-PDF documents (PDFs need read_document)
  const nonPdfDocIds = documents
    .filter((d) => d.fileType !== 'pdf')
    .map((d) => d.id);

  if (nonPdfDocIds.length === 0) {
    const pdfNames = documents.filter((d) => d.fileType === 'pdf').map((d) => d.filename);
    return `No searchable text documents found. There ${pdfNames.length === 1 ? 'is 1 PDF' : `are ${pdfNames.length} PDFs`} that require read_document to extract text: ${pdfNames.join(', ')}`;
  }

  const chunks = await db.documentChunk.findMany({
    where: { documentId: { in: nonPdfDocIds } },
    select: {
      id: true,
      documentId: true,
      text: true,
      pageNumber: true,
      chunkIndex: true,
    },
  });

  const searchResults = searchChunks(
    chunks.map((c) => ({
      ...c,
      documentName: docNameMap.get(c.documentId) || 'Unknown',
    })),
    query,
    10
  );

  if (searchResults.length === 0) {
    const pdfDocs = documents.filter((d) => d.fileType === 'pdf');
    const pdfHint = pdfDocs.length > 0
      ? ` There ${pdfDocs.length === 1 ? 'is 1 PDF' : `are ${pdfDocs.length} PDFs`} that were not searched (use read_document for PDFs): ${pdfDocs.map((d) => `"${d.filename}" (id: "${d.id}")`).join(', ')}.`
      : '';
    return `No text matches found for "${query}" in the searchable documents.${pdfHint}`;
  }

  const results = searchResults.map((chunk, i) =>
    `[${i + 1}] (Source: ${docNameMap.get(chunk.documentId) || 'Unknown'}, Page ${chunk.pageNumber || 'N/A'}):\n${chunk.text}`
  );
  return `Found ${searchResults.length} matching passage(s) for "${query}":\n\n${results.join('\n\n---\n\n')}`;
}

async function executeReadDocument(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<string> {
  const documentId = String(args.documentId || '');
  if (!documentId) return 'Error: the "documentId" parameter is required.';

  const doc = await db.document.findUnique({
    where: { id: documentId },
    select: {
      id: true,
      filename: true,
      fileType: true,
      filePath: true,
      projectId: true,
    },
  });

  if (!doc) return `Error: Document with id "${documentId}" not found.`;
  if (doc.projectId !== ctx.projectId) {
    return 'Error: Document not accessible in this project.';
  }

  // Extract text using the shared helper (handles PDF extraction + chunk fallback)
  let text: string;
  try {
    text = await extractDocumentText(doc, ctx.settings);
  } catch (err) {
    return `Error reading document "${doc.filename}": ${err instanceof Error ? err.message : String(err)}`;
  }

  if (!text.trim()) {
    return `Document "${doc.filename}" appears to be empty or could not be parsed.`;
  }

  // Optionally limit pages (approximate: ~3000 chars per page)
  const maxPages = args.maxPages ? Number(args.maxPages) : undefined;
  let result = text;
  if (maxPages && maxPages > 0) {
    result = text.slice(0, maxPages * 3000);
    if (result.length < text.length) {
      result += '\n\n[... document truncated — use a smaller page range or search_documents for specific sections ...]';
    }
  }

  // Truncate to a reasonable length for a tool result
  const MAX_TOOL_RESULT = 12000;
  if (result.length > MAX_TOOL_RESULT) {
    result =
      result.slice(0, MAX_TOOL_RESULT) +
      '\n\n[... document truncated — use search_documents for specific sections ...]';
  }

  return `=== ${doc.filename} (${doc.fileType}) ===\n${result}`;
}
