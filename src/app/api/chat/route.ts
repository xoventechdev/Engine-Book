import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { searchChunks } from '@/lib/chunker';
import ZAI from 'z-ai-web-dev-sdk';

const CHAT_SYSTEM_PROMPT = `You are an expert engineering assistant helping engineers understand technical documents.
You are given document chunks retrieved from the user's uploaded files.
Answer the user's question using ONLY the provided context.
For every fact you state, include a citation in this format: [[Document Name, Page X]].
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

// POST: Send a chat message (RAG pipeline)
export async function POST(request: NextRequest) {
  try {
    const { projectId, message, disciplineFilter } = await request.json();

    if (!projectId || !message) {
      return NextResponse.json({ error: 'projectId and message are required' }, { status: 400 });
    }

    // 1. Retrieve relevant chunks
    const documents = await db.document.findMany({
      where: {
        projectId,
        ...(disciplineFilter && disciplineFilter !== 'All'
          ? { discipline: disciplineFilter }
          : {}),
      },
      select: { id: true, filename: true },
    });

    const documentIds = documents.map((d) => d.id);
    const docNameMap = new Map(documents.map((d) => [d.id, d.filename]));

    let chunks = await db.documentChunk.findMany({
      where: { documentId: { in: documentIds } },
      select: {
        id: true,
        documentId: true,
        text: true,
        pageNumber: true,
        chunkIndex: true,
      },
    });

    // 2. Search for relevant chunks
    const searchResults = searchChunks(
      chunks.map((c) => ({
        ...c,
        documentName: docNameMap.get(c.documentId) || 'Unknown',
      })),
      message,
      10
    );

    // 3. Build context from search results
    const contextParts = searchResults.map(
      (chunk, i) =>
        `[${i + 1}] (Source: ${docNameMap.get(chunk.documentId) || 'Unknown'}, Page ${chunk.pageNumber || 'N/A'}):\n${chunk.text}`
    );

    const context = contextParts.join('\n\n---\n\n');

    // 4. Get conversation history (last 10 messages)
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

    // 5. Build messages for LLM
    const llmMessages: { role: string; content: string }[] = [
      { role: 'assistant', content: CHAT_SYSTEM_PROMPT },
    ];

    for (const msg of conversationHistory) {
      llmMessages.push({ role: msg.role, content: msg.content });
    }

    const userMessageWithContext = context
      ? `Context from uploaded documents:\n\n${context}\n\n---\n\nUser question: ${message}`
      : message;

    llmMessages.push({ role: 'user', content: userMessageWithContext });

    // 6. Call LLM
    const zai = await ZAI.create();
    const completion = await zai.chat.completions.create({
      messages: llmMessages as { role: 'user' | 'assistant'; content: string }[],
      thinking: { type: 'disabled' },
    });

    const aiResponse = completion.choices[0]?.message?.content || 'No response generated.';

    // 7. Extract citations from response
    const citations = extractCitations(aiResponse, docNameMap, searchResults);

    // 8. Save messages to database
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

    return NextResponse.json({
      id: assistantMessage.id,
      role: 'assistant',
      content: aiResponse,
      citations,
      createdAt: assistantMessage.createdAt,
    });
  } catch (error) {
    console.error('Chat error:', error);
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
  docNameMap: Map<string, string>,
  searchResults: { documentId: string; pageNumber: number | null; text: string; documentName: string }[]
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

  for (const chunk of searchResults.slice(0, 3)) {
    const docName = docNameMap.get(chunk.documentId) || 'Unknown';
    const key = `${docName}-p${chunk.pageNumber}`;
    if (!seen.has(key)) {
      seen.add(key);
      citations.push({
        documentName: docName,
        page: chunk.pageNumber || undefined,
        text: chunk.text.slice(0, 100) + '...',
      });
    }
  }

  return citations;
}