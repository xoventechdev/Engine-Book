import { NextRequest, NextResponse } from 'next/server';
import { generateChat, parseAISettings, AIConfigError } from '@/lib/ai';
import { getOwnerId, getOwnedProject, notOwnedResponse, unauthenticatedResponse } from '@/lib/owner';
import { collectProjectText } from '@/lib/document-text';

const AUDIO_SYSTEM_PROMPT = `You are a podcast script writer. Create an engaging, conversational podcast-style audio overview of the provided engineering documents.

The script should feature TWO hosts:
- Host A (Alex): The main presenter who introduces topics, explains concepts, and asks questions.
- Host B (Jordan): The co-host who asks clarifying questions, adds context, and highlights key engineering details.

Rules:
1. Write a NATURAL, engaging conversation — not a dry summary. Use conversational language, mild humor, and enthusiasm.
2. Cover the KEY information from the documents: main topics, important specifications, equipment details, standards referenced, and any notable findings.
3. Keep it concise but informative — aim for 8-15 dialogue turns total (about 2-3 minutes when read aloud).
4. Reference specific document names when discussing details (e.g., "According to the HVAC spec sheet...").
5. Include a brief intro ("Welcome to the Engineering Overview podcast...") and outro ("Thanks for listening!").
6. Make it accessible — explain technical terms briefly for listeners who may not be experts.
7. Each dialogue turn should be 1-3 sentences — short enough to be spoken naturally.

Return ONLY a JSON array with this exact structure (no markdown, no code blocks, no preamble):
[
  { "speaker": "Alex", "text": "Welcome to the Engineering Overview..." },
  { "speaker": "Jordan", "text": "Today we're looking at..." },
  { "speaker": "Alex", "text": "..." }
]`;

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
      projectId, 12000, settings,
    );

    if (docCount === 0) {
      return NextResponse.json({ error: 'No documents in this project' }, { status: 400 });
    }

    if (!combinedText.trim()) {
      return NextResponse.json(
        { error: 'No text content found in documents' },
        { status: 400 }
      );
    }

    // Generate the podcast script
    const completionText = await generateChat([
      { role: 'system', content: AUDIO_SYSTEM_PROMPT },
      { role: 'user', content: `Create an audio overview podcast script based on these documents:\n\n${combinedText}` },
    ], { temperature: 0.7 }, settings);

    // Parse the JSON array from the response
    let script: { speaker: string; text: string }[] = [];
    try {
      const jsonMatch = completionText?.match(/\[[\s\S]*\]/);
      script = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
    } catch {
      // If JSON parsing fails, try to split by common patterns
      script = [];
    }

    if (script.length === 0) {
      return NextResponse.json(
        { error: 'Failed to generate audio overview script. Please try again.' },
        { status: 500 }
      );
    }

    // Validate and clean the script
    const cleanScript = script
      .filter((line) => line && typeof line.speaker === 'string' && typeof line.text === 'string')
      .map((line) => ({
        speaker: line.speaker === 'Jordan' ? 'Jordan' : 'Alex',
        text: line.text.trim(),
      }))
      .filter((line) => line.text.length > 0);

    if (cleanScript.length === 0) {
      return NextResponse.json(
        { error: 'Generated script was empty. Please try again.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      script: cleanScript,
      projectName: project.name,
    });
  } catch (error) {
    console.error('Audio overview error:', error);
    if (error instanceof AIConfigError) {
      return NextResponse.json({ error: error.message, needsSettings: true }, { status: 400 });
    }
    return NextResponse.json(
      { error: 'Failed to generate audio overview', details: String(error) },
      { status: 500 }
    );
  }
}
