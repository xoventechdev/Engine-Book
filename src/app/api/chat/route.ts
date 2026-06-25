import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { searchChunks, chunkText } from '@/lib/chunker';
import ZAI from 'z-ai-web-dev-sdk';
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
    const { projectId, message, disciplineFilter } = await request.json();

    console.log(`\n[CHAT] ========== NEW CHAT REQUEST ==========`);
    console.log(`[CHAT] Project: ${projectId}, Message: "${message?.slice(0, 100)}"`);
    console.log(`[CHAT] Discipline filter: ${disciplineFilter || 'none'}`);

    if (!projectId || !message) {
      return NextResponse.json({ error: 'projectId and message are required' }, { status: 400 });
    }

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

    console.log(`[CHAT] Found ${documents.length} documents`);
    for (const d of documents) {
      console.log(`[CHAT]   - ${d.filename} (type=${d.fileType})`);
    }

    const docNameMap = new Map(documents.map((d) => [d.id, d.filename]));

    // 2. Separate PDFs (sent as raw files to Gemini) from non-PDFs (text chunks)
    const pdfDocs = documents.filter((d) => d.fileType === 'pdf');
    const nonPdfDocs = documents.filter((d) => d.fileType !== 'pdf');

    console.log(`[CHAT] PDFs: ${pdfDocs.length}, Non-PDFs: ${nonPdfDocs.length}`);

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

      console.log(`[CHAT] Non-PDF chunks in DB: ${chunks.length}`);

      // Re-chunk documents that have none (e.g. newly uploaded DOCX/TXT/XLSX/CSV)
      const chunkedDocIds = new Set(chunks.map((c) => c.documentId));
      const unchunkedDocs = nonPdfDocs.filter((d) => !chunkedDocIds.has(d.id));

      if (unchunkedDocs.length > 0) {
        console.log(`[CHAT] Re-chunking ${unchunkedDocs.length} non-PDF documents...`);
        for (const doc of unchunkedDocs) {
          try {
            const absPath = path.join(process.cwd(), doc.filePath);
            if (!fs.existsSync(absPath)) {
              console.log(`[CHAT]   File not found: ${absPath}`);
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

      console.log(`[CHAT] Search returned ${searchResults.length} chunks for non-PDFs`);

      if (searchResults.length > 0) {
        const contextParts = searchResults.map(
          (chunk, i) =>
            `[${i + 1}] (Source: ${docNameMap.get(chunk.documentId) || 'Unknown'}, Page ${chunk.pageNumber || 'N/A'}):\n${chunk.text}`
        );
        textContext = contextParts.join('\n\n---\n\n');
      }
    }

    // 4. For PDFs: read files from disk and prepare as base64 file_url parts
    const pdfFileParts: { type: 'file_url'; file_url: { url: string } }[] = [];
    const pdfNames: string[] = [];

    for (const doc of pdfDocs) {
      try {
        const absPath = path.join(process.cwd(), doc.filePath);
        if (!fs.existsSync(absPath)) {
          console.log(`[CHAT] PDF file not found: ${absPath}`);
          continue;
        }
        const fileBuffer = fs.readFileSync(absPath);
        const base64 = fileBuffer.toString('base64');
        const dataUrl = `data:application/pdf;base64,${base64}`;

        pdfFileParts.push({
          type: 'file_url',
          file_url: { url: dataUrl },
        });
        pdfNames.push(doc.filename);
        console.log(`[CHAT] PDF loaded: ${doc.filename} (${fileBuffer.length} bytes, ${base64.length} chars base64)`);
      } catch (err) {
        console.error(`[CHAT] Failed to read PDF ${doc.filename}:`, err);
      }
    }

    // 5. Build the prompt with text context from non-PDFs
    const hasPdfFiles = pdfFileParts.length > 0;
    const hasTextContext = textContext.length > 0;
    const hasAnyContent = hasPdfFiles || hasTextContext;

    console.log(`[CHAT] Final state: ${pdfFileParts.length} PDFs, text context: ${textContext.length} chars, total docs: ${documents.length}`);

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

    // 7. Call LLM
    const zai = await ZAI.create();
    let aiResponse: string;

    if (hasPdfFiles) {
      // === USE VISION API: send PDFs as file_url parts ===
      console.log(`[CHAT] Using createVision with ${pdfFileParts.length} PDF file(s)`);

      // Build the user message content parts
      const userContentParts: { type: string; text?: string; file_url?: { url: string } }[] = [];

      // Add text prompt with context
      let userText = '';
      if (hasTextContext) {
        userText = `You have been provided with ${pdfFileParts.length} PDF document(s) (${pdfNames.join(', ')}) AND the following extracted text from other files:\n\n${textContext}\n\n---\n\nUser question: ${message}`;
      } else {
        userText = `You have been provided with ${pdfFileParts.length} PDF document(s) (${pdfNames.join(', ')}).\n\nUser question: ${message}`;
      }
      userContentParts.push({ type: 'text', text: userText });

      // Add PDF file parts
      userContentParts.push(...pdfFileParts);

      // Build vision messages
      const visionMessages: { role: string; content: string | any[] }[] = [
        { role: 'assistant', content: CHAT_SYSTEM_PROMPT },
      ];

      for (const msg of conversationHistory) {
        visionMessages.push({ role: msg.role, content: msg.content });
      }

      visionMessages.push({
        role: 'user',
        content: userContentParts,
      });

      console.log(`[CHAT] Sending ${visionMessages.length} messages to createVision (${userText.length} chars text + ${pdfFileParts.length} PDFs)`);

      const completion = await zai.chat.completions.createVision({
        messages: visionMessages as any,
        thinking: { type: 'disabled' },
      });

      aiResponse = completion.choices[0]?.message?.content || 'No response generated.';
    } else {
      // === FALLBACK: text-only LLM call (no PDFs) ===
      console.log(`[CHAT] Using createVision (text only, ${textContext.length} chars context)`);

      const userMessageWithContext = hasTextContext
        ? `Context from uploaded documents:\n\n${textContext}\n\n---\n\nUser question: ${message}`
        : `No document context was found. The user has uploaded ${documents.length} document(s) but no content could be extracted.\n\nUser question: ${message}`;

      const llmMessages: { role: string; content: string }[] = [
        { role: 'assistant', content: CHAT_SYSTEM_PROMPT },
      ];

      for (const msg of conversationHistory) {
        llmMessages.push({ role: msg.role, content: msg.content });
      }

      llmMessages.push({ role: 'user', content: userMessageWithContext });

      const completion = await zai.chat.completions.createVision({
        messages: llmMessages as any,
        thinking: { type: 'disabled' },
      });

      aiResponse = completion.choices[0]?.message?.content || 'No response generated.';
    }

    console.log(`[CHAT] LLM response: ${aiResponse.length} chars`);
    console.log(`[CHAT] AI preview: "${aiResponse.slice(0, 150).replace(/\n/g, '\\n')}"`);

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
    console.log('[CHAT] ========== CHAT RESPONSE ==========', JSON.stringify(debugInfo, null, 2));

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