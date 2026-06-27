import { NextRequest, NextResponse } from 'next/server';
import { generateChat, parseAISettings, AIConfigError } from '@/lib/ai';
import { getOwnerId, getOwnedProject, notOwnedResponse, unauthenticatedResponse } from '@/lib/owner';
import { collectProjectText } from '@/lib/document-text';

const GRAPH_SYSTEM_PROMPT = `You are an expert knowledge graph extractor specializing in engineering documents (BMS, HVAC, Electrical, Fire Alarm, MEP, Structural, Civil).

Extract ALL meaningful entities and their relationships from the provided text. Be thorough — engineering documents contain equipment, specifications, standards, locations, values, parameters, systems, and components.

Return ONLY a valid JSON object with this exact structure (no markdown, no code blocks, no preamble):
{
  "nodes": [
    {
      "id": "n1",
      "label": "Short entity name (2-5 words max)",
      "type": "Equipment|Spec|Standard|Location|Value|System|Component|Parameter",
      "properties": { "key": "value" },
      "document": "filename where this entity appears (if identifiable from the text markers === filename ===)"
    }
  ],
  "edges": [
    {
      "source": "n1",
      "target": "n2",
      "relation": "has_spec|located_in|references|rated_at|part_of|connected_to|controls|monitors|requires|supplies|returns_from|feeds|regulated_by",
      "weight": 1
    }
  ]
}

ENTITY TYPE GUIDELINES:
- Equipment: physical devices (AHU, chiller, pump, panel, sensor)
- System: organized groups (HVAC system, fire alarm system, power distribution)
- Component: parts of equipment (filter, coil, damper, valve)
- Spec: specification values or requirements (temperature range, pressure rating)
- Parameter: measurable operating values (flow rate, voltage, efficiency)
- Standard: codes and standards referenced (ASHRAE, NFPA, BS)
- Location: physical places or zones (floor 3, mechanical room, zone A)
- Value: key numerical values with units (24°C, 350 kW, 1500 L/s)

EDGE RELATION GUIDELINES:
- has_spec: Equipment has a specification (AHU has_spec 24°C setpoint)
- part_of: Component is part of Equipment/System (coil part_of AHU)
- located_in: Equipment/Component is in a Location (AHU located_in mechanical room)
- rated_at: Equipment rated at a Parameter/Value (chiller rated_at 350 kW)
- references: Document/Entity references a Standard (design references ASHRAE 90.1)
- connected_to: Equipment connected to Equipment (chiller connected_to cooling tower)
- controls: Equipment controls Equipment/System (BMS controls AHU)
- monitors: Equipment monitors Parameter (sensor monitors temperature)
- requires: Equipment/System requires a Standard or Spec
- supplies: Equipment supplies something to Equipment/Location
- feeds: Equipment feeds Equipment (power panel feeds lighting circuit)
- regulated_by: Equipment/Process regulated by Standard

RULES:
- Use unique node IDs (n1, n2, n3...).
- Keep labels SHORT (2-5 words). Put details in "properties".
- "properties" should contain key engineering attributes (capacity, model, voltage, manufacturer, etc.) — at most 5 key-value pairs.
- "weight": 1 for normal relationships, 2 for critical/primary relationships, 3 for the most important connections.
- Extract 10-40 nodes for a typical document set. Aim for a rich, connected graph.
- Only create edges where there is a clear relationship in the text. Don't fabricate connections.
- If you can identify which document (from the === filename === markers) an entity came from, set "document" to that filename. Otherwise omit it.
- Return ONLY valid JSON.`;

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

    // Collect text from all documents (handles PDFs via LLM extraction)
    const { text: combinedText, docCount } = await collectProjectText(
      projectId, 20000, settings, 25,
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

    // Call LLM to extract entities and relationships
    const completionText = await generateChat([
      { role: 'system', content: GRAPH_SYSTEM_PROMPT },
      { role: 'user', content: `Extract entities and relationships from these engineering documents:\n\n${combinedText}` },
    ], { temperature: 0.3 }, settings);

    const rawResponse = completionText || '{}';

    // Parse JSON from response (handle possible markdown wrapping)
    let graphData: { nodes?: unknown[]; edges?: unknown[] };
    try {
      const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
      graphData = jsonMatch ? JSON.parse(jsonMatch[0]) : { nodes: [], edges: [] };
    } catch {
      graphData = { nodes: [], edges: [] };
    }

    // Validate and normalize node types
    const VALID_TYPES = new Set([
      'Equipment', 'Spec', 'Standard', 'Location', 'Value',
      'System', 'Component', 'Parameter',
    ]);
    const VALID_RELATIONS = new Set([
      'has_spec', 'located_in', 'references', 'rated_at', 'part_of',
      'connected_to', 'controls', 'monitors', 'requires', 'supplies',
      'returns_from', 'feeds', 'regulated_by',
    ]);

    // Deduplicate nodes by label (case-insensitive) — LLMs sometimes
    // extract the same entity with slightly different IDs.
    const seenLabels = new Map<string, string>(); // lowercase label → canonical id

    const rawNodes = Array.isArray(graphData.nodes) ? graphData.nodes : [];
    const nodeMap = new Map<string, { id: string; label: string; type: string; properties?: Record<string, string>; document?: string }>();

    for (let i = 0; i < rawNodes.length; i++) {
      const n = rawNodes[i] as Record<string, unknown>;
      const id = typeof n.id === 'string' ? n.id : `n${i + 1}`;
      const label = typeof n.label === 'string' ? n.label.trim() : `Entity ${i + 1}`;
      const lowerLabel = label.toLowerCase();

      // Skip duplicates — map them to the first occurrence
      if (seenLabels.has(lowerLabel)) {
        continue;
      }
      seenLabels.set(lowerLabel, id);

      const type = typeof n.type === 'string' && VALID_TYPES.has(n.type)
        ? n.type
        : 'Equipment';

      const properties = n.properties && typeof n.properties === 'object' && !Array.isArray(n.properties)
        ? Object.fromEntries(
            Object.entries(n.properties as Record<string, unknown>)
              .filter(([, v]) => v !== null && v !== undefined)
              .slice(0, 5)
              .map(([k, v]) => [k, String(v)])
          )
        : undefined;

      const document = typeof n.document === 'string' && n.document.trim()
        ? n.document.trim()
        : undefined;

      nodeMap.set(id, { id, label, type, ...(properties ? { properties } : {}), ...(document ? { document } : {}) });
    }

    // Validate edges — ensure source/target exist, normalize relation
    const rawEdges = Array.isArray(graphData.edges) ? graphData.edges : [];
    const edges: { source: string; target: string; relation: string; weight: number }[] = [];
    const edgeKeys = new Set<string>(); // deduplicate edges

    for (const e of rawEdges) {
      const er = e as Record<string, unknown>;
      const source = typeof er.source === 'string' ? er.source : '';
      const target = typeof er.target === 'string' ? er.target : '';
      if (!source || !target || !nodeMap.has(source) || !nodeMap.has(target)) continue;

      const relation = typeof er.relation === 'string' && VALID_RELATIONS.has(er.relation)
        ? er.relation
        : 'connected_to';

      const weight = typeof er.weight === 'number' && er.weight >= 1 && er.weight <= 3
        ? er.weight
        : 1;

      const key = `${source}-${target}-${relation}`;
      if (edgeKeys.has(key)) continue;
      edgeKeys.add(key);

      edges.push({ source, target, relation, weight });
    }

    const safeData = {
      nodes: Array.from(nodeMap.values()),
      edges,
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
