import { NextRequest, NextResponse } from 'next/server';
import { generateChat, parseAISettings, AIConfigError } from '@/lib/ai';
import { getOwnerId, getOwnedProject, notOwnedResponse, unauthenticatedResponse } from '@/lib/owner';
import { collectProjectText } from '@/lib/document-text';

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
    const { projectId, settings: bodySettings } = await request.json();

    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
    }

    const ownerId = await getOwnerId();
    if (!ownerId) return unauthenticatedResponse();
    const project = await getOwnedProject(projectId, ownerId);
    if (!project) return notOwnedResponse();

    const settings = parseAISettings(bodySettings) ?? undefined;

    // Collect text from all documents (handles PDFs via OCR fallback)
    const { text: combinedText, docCount } = await collectProjectText(
      projectId, 15000, settings, 15,
    );

    if (docCount === 0) {
      return NextResponse.json({ error: 'No documents found in this project' }, { status: 400 });
    }

    if (!combinedText.trim()) {
      return NextResponse.json(
        { error: 'No text content found in uploaded documents' },
        { status: 400 }
      );
    }

    // Call LLM to extract entities
    const completionText = await generateChat([
      { role: 'system', content: GRAPH_SYSTEM_PROMPT },
      { role: 'user', content: `Extract entities and relationships from:\n\n${combinedText}` },
    ], undefined, settings);

    const rawResponse = completionText || '{}';

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
    if (error instanceof AIConfigError) {
      return NextResponse.json({ error: error.message, needsSettings: true }, { status: 400 });
    }
    return NextResponse.json(
      { error: 'Failed to generate knowledge graph', details: String(error) },
      { status: 500 }
    );
  }
}
