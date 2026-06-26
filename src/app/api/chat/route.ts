import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { searchChunks, chunkText } from '@/lib/chunker';
import { generateChatWithFiles, getAISettings, parseAISettings, AIConfigError, type AIFile } from '@/lib/ai';
import { getOwnerId, getOwnedProject, notOwnedResponse, unauthenticatedResponse } from '@/lib/owner';
import path from 'path';
import fs from 'fs';

const CHAT_SYSTEM_PROMPT = `You are an expert engineering assistant helping engineers understand technical documents.
You will receive PDF documents and/or extracted text from uploaded files.
Analyze the documents thoroughly and answer the user's question precisely.
For every fact you state from a specific document, include a citation in this format: [[Document Name, Page X]].
If the answer is not in the documents, say "This information was not found in the uploaded documents."
Be precise with numbers, units, and technical values. Do not guess.
Respond in the same language the user asks in (English or Bengali).
Format your response in Markdown for readability.`;

// GET: Fetch chat history
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

    const messages = await db.chatMessage.findMany({
      where: { projectId },
      orderBy: { createdAt: 'asc' },
    });

    const parsed = messages.map((msg) => ({
      ...msg,
      citations: msg.citations ? JSON.parse(msg.citations) : null,
    }));

    return NextResponse.json(parsed);
  } catch (error) {
    console.error('Failed to fetch chat history:', error);
    return NextResponse.json({ error: 'Failed to fetch chat history' }, { status: 500 });
  }
}

// POST: Send a chat message
export async function POST(request: NextRequest) {
  try {
    const { projectId, message, disciplineFilter, settings: bodySettings } = await request.json();


    if (!projectId || !message) {
      return NextResponse.json({ error: 'projectId and message are required' }, { status: 400 });
    }

    const ownerId = await getOwnerId();
    if (!ownerId) return unauthenticatedResponse();
    const project = await getOwnedProject(projectId, ownerId);
    if (!project) return notOwnedResponse();

    // Use client-supplied browser settings (24h localStorage) if present,
    // otherwise fall back to server-side getAISettings().
    const settings = parseAISettings(bodySettings) ?? (await getAISettings());

    // 1. Retrieve documents
    const documents = await db.document.findMany({
      where: {
        projectId,
        ...(disciplineFilter && disciplineFilter !== 'All'
          ? { discipline: disciplineFilter }
          : {}),
      },
      select: { id: true, filename: true, fileType: true, filePath: true },
    });

    for (const d of documents) {
    }

    const docNameMap = new Map<string, string>(documents.map((d) => [d.id, d.filename] as [string, string]));

    // 2. Separate PDFs (sent as raw files to Gemini) from non-PDFs (text chunks)
    const pdfDocs = documents.filter((d) => d.fileType === 'pdf');
    const nonPdfDocs = documents.filter((d) => d.fileType !== 'pdf');


    // 3. For non-PDFs: get or create text chunks, then keyword-search
    let textContext = '';
    const nonPdfDocIds = nonPdfDocs.map((d) => d.id);

    if (nonPdfDocs.length > 0) {
      // Get existing chunks
      let chunks = await db.documentChunk.findMany({
        where: { documentId: { in: nonPdfDocIds } },
        select: {
          id: true,
          documentId: true,
          text: true,
          pageNumber: true,
          chunkIndex: true,
        },
      });


      // Re-chunk documents that have none (e.g. newly uploaded DOCX/TXT/XLSX/CSV)
      const chunkedDocIds = new Set(chunks.map((c) => c.documentId));
      const unchunkedDocs = nonPdfDocs.filter((d) => !chunkedDocIds.has(d.id));

      if (unchunkedDocs.length > 0) {
        for (const doc of unchunkedDocs) {
          try {
            const absPath = path.join(process.cwd(), doc.filePath);
            if (!fs.existsSync(absPath)) {
              continue;
            }
            const fileBuffer = fs.readFileSync(absPath);
            let fullText = '';

            if (doc.fileType === 'docx') {
              const mammoth = await import('mammoth');
              const result = await mammoth.extractRawText({ buffer: fileBuffer });
              fullText = result.value;
            } else if (doc.fileType === 'txt') {
              fullText = fileBuffer.toString('utf-8');
            } else if (doc.fileType === 'xlsx' || doc.fileType === 'csv') {
              const XLSX = await import('xlsx');
              let jsonData: string[][] = [];
              if (doc.fileType === 'xlsx') {
                const workbook = XLSX.read(fileBuffer);
                const sheet = workbook.Sheets[workbook.SheetNames[0]];
                jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as string[][];
              } else {
                const csvText = fileBuffer.toString('utf-8');
                jsonData = XLSX.utils.sheet_to_json(
                  XLSX.utils.aoa_to_sheet(csvText.split('\n').map((r) => r.split(','))),
                  { header: 1 }
                ) as string[][];
              }
              fullText = jsonData.map((row) => row.filter(Boolean).join(' | ')).join('\n');
            }

            if (fullText.trim()) {
              const pages = splitTextIntoPages(fullText, 3000);
              const docChunks = pages.flatMap((p, pageIdx) =>
                chunkText(p, 500, 50).map((c) => ({ ...c, pageNumber: pageIdx + 1 }))
              );
              if (docChunks.length > 0) {
                await db.documentChunk.createMany({
                  data: docChunks.map((chunk) => ({
                    documentId: doc.id,
                    chunkIndex: chunk.index,
                    pageNumber: chunk.pageNumber,
                    text: chunk.text,
                  })),
                });
                chunks.push(
                  ...docChunks.map((chunk) => ({
                    id: `${doc.id}-${chunk.index}`,
                    documentId: doc.id,
                    text: chunk.text,
                    pageNumber: chunk.pageNumber ?? null,
                    chunkIndex: chunk.index,
                  }))
                );
              }
            }
          } catch (err) {
            console.error(`[CHAT] Failed to re-chunk ${doc.filename}:`, err);
          }
        }
      }

      // Keyword search for relevant chunks
      const searchResults = searchChunks(
        chunks.map((c) => ({
          ...c,
          documentName: docNameMap.get(c.documentId) || 'Unknown',
        })),
        message,
        10
      );


      if (searchResults.length > 0) {
        const contextParts = searchResults.map(
          (chunk, i) =>
            `[${i + 1}] (Source: ${docNameMap.get(chunk.documentId) || 'Unknown'}, Page ${chunk.pageNumber || 'N/A'}):\n${chunk.text}`
        );
        textContext = contextParts.join('\n\n---\n\n');
      }
    }

    // 4. For PDFs: scan disk to find which are present (the raw bytes are
//    re-read inside the AI dispatcher below as AIFile[]). We only need
//    the list of names + a presence flag for prompt construction here.
    const pdfNames: string[] = [];
    for (const doc of pdfDocs) {
      const absPath = path.join(process.cwd(), doc.filePath);
      if (fs.existsSync(absPath)) pdfNames.push(doc.filename);
    }
    const presentPdfCount = pdfNames.length;

    // 5. Build the prompt with text context from non-PDFs
    const hasPdfFiles = presentPdfCount > 0;
    const hasTextContext = textContext.length > 0;
    const hasAnyContent = hasPdfFiles || hasTextContext;


    // 6. Get conversation history (last 10 messages)
    const history = await db.chatMessage.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { role: true, content: true },
    });

    const conversationHistory = history.reverse().map((msg) => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    }));

    // 7. Call LLM (provider-agnostic — uses the resolved settings above)
    let aiResponse: string;

    // Build the universal message list. The system prompt goes first, then
    // conversation history, then the user's new turn (with document context).
    let userText = '';
    if (hasPdfFiles && hasTextContext) {
      userText = `You have been provided with ${presentPdfCount} PDF document(s) (${pdfNames.join(', ')}) AND the following extracted text from other files:\n\n${textContext}\n\n---\n\nUser question: ${message}`;
    } else if (hasPdfFiles) {
      userText = `You have been provided with ${presentPdfCount} PDF document(s) (${pdfNames.join(', ')}).\n\nUser question: ${message}`;
    } else if (hasTextContext) {
      userText = `Context from uploaded documents:\n\n${textContext}\n\n---\n\nUser question: ${message}`;
    } else {
      userText = `No document context was found. The user has uploaded ${documents.length} document(s) but no content could be extracted.\n\nUser question: ${message}`;
    }

    const llmMessages = [
      { role: 'system' as const, content: CHAT_SYSTEM_PROMPT },
      ...conversationHistory.map((msg) => ({ role: msg.role, content: msg.content })),
      { role: 'user' as const, content: userText },
    ];

    // Build the AIFile[] for providers that support inline binary blobs
    // (Gemini & Anthropic). For OpenAI-compatible providers, files are
    // gracefully ignored by ai.ts and the user text carries the context.
    const aiFiles: AIFile[] = [];
    for (const doc of pdfDocs) {
      try {
        const absPath = path.join(process.cwd(), doc.filePath);
        if (!fs.existsSync(absPath)) continue;
        aiFiles.push({
          filename: doc.filename,
          mimeType: 'application/pdf',
          data: fs.readFileSync(absPath),
        });
      } catch (err) {
        console.error(`[CHAT] Failed to read PDF ${doc.filename}:`, err);
      }
    }


    try {
      aiResponse = await generateChatWithFiles(llmMessages, aiFiles, undefined, settings);
    } catch (aiErr) {
      const e = aiErr as Error & { status?: number };
      console.error('[CHAT] generateChatWithFiles THREW:', e?.name, e?.message, e?.status);
      console.error(e?.stack);
      throw aiErr;
    }
    if (!aiResponse) aiResponse = 'No response generated.';


    // 8. Extract citations from response
    const citations = extractCitations(aiResponse, docNameMap);

    // 9. Save messages to database
    await db.chatMessage.create({
      data: { projectId, role: 'user', content: message },
    });

    const assistantMessage = await db.chatMessage.create({
      data: {
        projectId,
        role: 'assistant',
        content: aiResponse,
        citations: JSON.stringify(citations),
      },
    });

    // Build debug info
    const debugInfo = {
      documentCount: documents.length,
      pdfCount: pdfDocs.length,
      pdfNames,
      nonPdfCount: nonPdfDocs.length,
      textContextLength: textContext.length,
      hasAnyContent,
      usedPdfDirectMode: hasPdfFiles,
      hasContext: hasAnyContent,
    };

    return NextResponse.json({
      id: assistantMessage.id,
      role: 'assistant',
      content: aiResponse,
      citations,
      createdAt: assistantMessage.createdAt,
      hasContext: hasAnyContent,
      debug: debugInfo,
    });
  } catch (error) {
    console.error('[CHAT] FATAL ERROR:', error);
    if (error instanceof AIConfigError) {
      return NextResponse.json({ error: error.message, needsSettings: true }, { status: 400 });
    }
    return NextResponse.json(
      { error: 'Failed to process chat message', details: String(error) },
      { status: 500 }
    );
  }
}

// DELETE: Clear chat history
export async function DELETE(request: NextRequest) {
  try {
    const projectId = request.nextUrl.searchParams.get('projectId');
    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
    }

    const ownerId = await getOwnerId();
    if (!ownerId) return unauthenticatedResponse();
    const project = await getOwnedProject(projectId, ownerId);
    if (!project) return notOwnedResponse();

    await db.chatMessage.deleteMany({ where: { projectId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to clear chat:', error);
    return NextResponse.json({ error: 'Failed to clear chat' }, { status: 500 });
  }
}

function extractCitations(
  response: string,
  docNameMap: Map<string, string>
) {
  const citations: { documentName: string; page?: number; text?: string }[] = [];
  const seen = new Set<string>();

  const citationRegex = /\[\[([^\]]+),\s*(Page\s*\d+|N\/A)\]\]/g;
  let match;

  while ((match = citationRegex.exec(response)) !== null) {
    const docName = match[1].trim();
    const pageStr = match[2].trim();
    const key = `${docName}-${pageStr}`;

    if (!seen.has(key)) {
      seen.add(key);
      const pageMatch = pageStr.match(/Page\s*(\d+)/);
      citations.push({
        documentName: docName,
        page: pageMatch ? parseInt(pageMatch[1]) : undefined,
      });
    }
  }

  return citations;
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