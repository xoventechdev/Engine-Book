import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import ZAI from 'z-ai-web-dev-sdk';

const GRAPH_SYSTEM_PROMPT = `You are an entity extraction specialist for engineering documents.
From the text provided, extract all key entities and their relationships.
Return ONLY a JSON object with this structure:
{
  "nodes": [{"id": "1", "label": "Entity Name", "type": "Equipment|Spec|Standard|Location|Value"}],
  "edges": [{"source": "1", "target": "2", "relation": "has_spec|located_in|references|rated_at"}]
}
No preamble. No explanation. Only valid JSON.`;

export async function POST(request: NextRequest) {
  try {
    const { projectId } = await request.json();

    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
    }

    // Get all document text (sample from each document to avoid token limits)
    const documents = await db.document.findMany({
      where: { projectId },
      select: { id: true, filename: true },
    });

    if (documents.length === 0) {
      return NextResponse.json({ error: 'No documents found in this project' }, { status: 400 });
    }

    // Collect representative chunks from each document
    const allChunks: string[] = [];
    for (const doc of documents) {
      const chunks = await db.documentChunk.findMany({
        where: { documentId: doc.id },
        orderBy: { chunkIndex: 'asc' },
        take: 15, // Sample up to 15 chunks per document
        select: { text: true },
      });
      const docText = chunks.map((c) => c.text).join('\n\n');
      if (docText) {
        allChunks.push(`=== ${doc.filename} ===\n${docText}`);
      }
    }

    const combinedText = allChunks.join('\n\n').slice(0, 15000); // Limit context

    if (!combinedText.trim()) {
      return NextResponse.json(
        { error: 'No text content found in uploaded documents' },
        { status: 400 }
      );
    }

    // Call LLM to extract entities
    const zai = await ZAI.create();
    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'assistant', content: GRAPH_SYSTEM_PROMPT },
        { role: 'user', content: `Extract entities and relationships from:\n\n${combinedText}` },
      ],
      thinking: { type: 'disabled' },
    });

    const rawResponse = completion.choices[0]?.message?.content || '{}';

    // Parse JSON from response (handle possible markdown wrapping)
    let graphData;
    try {
      const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
      graphData = jsonMatch ? JSON.parse(jsonMatch[0]) : { nodes: [], edges: [] };
    } catch {
      graphData = { nodes: [], edges: [] };
    }

    // Ensure valid structure
    const safeData = {
      nodes: (graphData.nodes || []).map((n: { id?: string; label?: string; type?: string }, i: number) => ({
        id: n.id || String(i + 1),
        label: n.label || 'Unknown',
        type: n.type || 'Equipment',
      })),
      edges: (graphData.edges || []).filter(
        (e: { source?: string; target?: string }) => e.source && e.target
      ),
    };

    return NextResponse.json(safeData);
  } catch (error) {
    console.error('Graph generation error:', error);
    return NextResponse.json(
      { error: 'Failed to generate knowledge graph', details: String(error) },
      { status: 500 }
    );
  }
}