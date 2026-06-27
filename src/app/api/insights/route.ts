import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { generateChat, parseAISettings, AIConfigError } from '@/lib/ai';
import { getOwnerId, getOwnedProject, notOwnedResponse, unauthenticatedResponse } from '@/lib/owner';
import { collectProjectText } from '@/lib/document-text';

const INSIGHTS_SYSTEM_PROMPT = `You are a proactive engineering research assistant. Your job is to analyze a collection of uploaded engineering documents and generate insights that help the user understand what they have — WITHOUT being asked a specific question.

Analyze the provided document text and return ONLY a JSON object with this exact structure (no markdown, no code blocks, no preamble):
{
  "summary": "A 2-3 sentence overview of what these documents cover collectively",
  "keyTopics": ["topic 1", "topic 2", "topic 3", "topic 4", "topic 5"],
  "documentOverview": [
    { "filename": "doc.pdf", "summary": "1-sentence summary of what this document is about" }
  ],
  "connections": [
    { "documents": ["doc1.pdf", "doc2.pdf"], "description": "How these documents relate to each other" }
  ],
  "suggestedQuestions": [
    "A specific question the user could ask about these documents",
    "Another specific question",
    "Another specific question",
    "Another specific question",
    "Another specific question"
  ]
}

Rules:
- keyTopics: 3-5 main technical topics covered across the documents
- documentOverview: one entry per document (if you can identify individual documents from the text)
- connections: 1-3 relationships between documents (e.g., "doc A specifies requirements that doc B implements")
- suggestedQuestions: 5 specific, actionable questions that would be useful to ask about these documents. Make them specific to the content — not generic. Focus on engineering values, specifications, comparisons, and relationships.
- Return ONLY valid JSON. No markdown wrapping.`;

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

    // Check if there are any documents
    const docCount = await db.document.count({ where: { projectId } });
    if (docCount === 0) {
      return NextResponse.json({
        error: 'No documents in this project yet. Upload documents to generate insights.',
      }, { status: 400 });
    }

    // Collect text from all documents (handles PDFs via LLM extraction)
    const { text: combinedText, docCount: actualDocCount } = await collectProjectText(
      projectId,
      15000,
      settings,
      20,
    );

    if (actualDocCount === 0 || !combinedText.trim()) {
      return NextResponse.json({
        error: 'Documents exist but no text could be extracted. Try uploading text-based documents.',
      }, { status: 400 });
    }

    // Generate insights via LLM
    const completionText = await generateChat([
      { role: 'system', content: INSIGHTS_SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Analyze these ${actualDocCount} engineering documents and generate proactive insights:\n\n${combinedText}`,
      },
    ], { temperature: 0.4 }, settings);

    // Parse JSON from response
    let insights;
    try {
      const jsonMatch = completionText?.match(/\{[\s\S]*\}/);
      insights = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    } catch {
      insights = null;
    }

    if (!insights) {
      return NextResponse.json({
        error: 'Failed to generate insights. Please try again.',
      }, { status: 500 });
    }

    // Validate and clean the insights
    const cleanInsights = {
      summary: typeof insights.summary === 'string' ? insights.summary : '',
      keyTopics: Array.isArray(insights.keyTopics)
        ? insights.keyTopics.filter((t: unknown) => typeof t === 'string').slice(0, 5)
        : [],
      documentOverview: Array.isArray(insights.documentOverview)
        ? insights.documentOverview
            .filter((d: Record<string, unknown>) => d && typeof d.filename === 'string')
            .map((d: Record<string, unknown>) => ({
              filename: d.filename,
              summary: typeof d.summary === 'string' ? d.summary : '',
            }))
        : [],
      connections: Array.isArray(insights.connections)
        ? insights.connections
            .filter((c: Record<string, unknown>) => c && Array.isArray(c.documents))
            .map((c: Record<string, unknown>) => ({
              documents: c.documents as string[],
              description: typeof c.description === 'string' ? c.description : '',
            }))
            .slice(0, 3)
        : [],
      suggestedQuestions: Array.isArray(insights.suggestedQuestions)
        ? insights.suggestedQuestions
            .filter((q: unknown) => typeof q === 'string' && q.trim().length > 0)
            .slice(0, 5)
        : [],
    };

    return NextResponse.json({
      projectId,
      ...cleanInsights,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Insights generation error:', error);
    if (error instanceof AIConfigError) {
      return NextResponse.json({ error: error.message, needsSettings: true }, { status: 400 });
    }
    return NextResponse.json(
      { error: 'Failed to generate insights', details: String(error) },
      { status: 500 }
    );
  }
}
