import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { parseAISettings, AIConfigError } from '@/lib/ai';
import { getOwnerId, getOwnedProject, notOwnedResponse, unauthenticatedResponse } from '@/lib/owner';
import { runAgent } from '@/lib/agent/loop';

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

// POST: Send a chat message (single agentic workflow)
export async function POST(request: NextRequest) {
  try {
    const { projectId, message, settings: bodySettings } = await request.json();

    if (!projectId || !message) {
      return NextResponse.json({ error: 'projectId and message are required' }, { status: 400 });
    }

    const ownerId = await getOwnerId();
    if (!ownerId) return unauthenticatedResponse();
    const project = await getOwnedProject(projectId, ownerId);
    if (!project) return notOwnedResponse();

    // Resolve AI settings (client-supplied browser localStorage, or server default)
    const settings = parseAISettings(bodySettings) ?? (await import('@/lib/ai')).getAISettings();

    // Get conversation history (last 10 messages) for the agent context
    const historyRows = await db.chatMessage.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { role: true, content: true },
    });
    const history = historyRows.reverse().map((msg) => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    }));

    // Run the single agentic loop: the LLM plans → calls tools (list/search/read
    // documents) → observes results → produces a final cited answer.
    const { response: aiResponse, toolCallLog } = await runAgent(
      message,
      history,
      { projectId, ownerId, settings: await settings },
    );

    // Extract citations from the response (same format: [[Doc Name, Page X]])
    const docNames = await db.document.findMany({
      where: { projectId },
      select: { filename: true },
    });
    const docNameSet = new Set<string>(docNames.map((d) => d.filename));
    const citations = extractCitations(aiResponse, docNameSet);

    // Save messages to database
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
      hasContext: toolCallLog.length > 0,
      toolCalls: toolCallLog,
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

function extractCitations(response: string, docNames: Set<string>) {
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
