import { NextRequest, NextResponse } from 'next/server';
import { generateChat, parseAISettings, AIConfigError } from '@/lib/ai';
import { getOwnerId, getOwnedProject, notOwnedResponse, unauthenticatedResponse } from '@/lib/owner';
import { collectProjectText } from '@/lib/document-text';

const STUDY_GUIDE_PROMPT = `You are an expert engineering educator. Based on the provided documents, create a comprehensive study guide.

Return a JSON object with this exact structure (no markdown, no code blocks, no preamble):
{
  "summary": "A 2-3 paragraph executive summary of the key topics covered in the documents.",
  "keyTerms": [
    { "term": "BACnet", "definition": "A communication protocol used in building automation..." },
    { "term": "AHU", "definition": "Air Handling Unit — a device used to condition and circulate air..." }
  ],
  "faq": [
    { "question": "What is the default baud rate for the ACM controller?", "answer": "According to the manual, the default baud rate is 38400 bps." },
    { "question": "How many BACnet points are supported?", "answer": "The system supports up to 500 BACnet points per controller." }
  ],
  "quiz": [
    {
      "question": "What is the operating temperature range of the chiller?",
      "options": ["-10 to 40°C", "0 to 35°C", "5 to 45°C", "-5 to 50°C"],
      "correctIndex": 0,
      "explanation": "The datasheet specifies an operating range of -10°C to 40°C."
    }
  ]
}

Rules:
1. Generate 8-15 key terms with clear, concise definitions.
2. Generate 5-8 FAQ questions with answers grounded in the documents.
3. Generate 3-5 multiple-choice quiz questions with 4 options each.
4. For quiz questions, the correctIndex is 0-based (0 = first option).
5. Include an explanation for each quiz answer referencing the source document.
6. Be precise with technical values — do not guess.
7. Return ONLY valid JSON.`;

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

    // Collect text from all documents
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

    // Generate the study guide
    const completionText = await generateChat([
      { role: 'system', content: STUDY_GUIDE_PROMPT },
      { role: 'user', content: `Create a study guide from these documents:\n\n${combinedText}` },
    ], { temperature: 0.5 }, settings);

    // Parse JSON from response
    let guide;
    try {
      const jsonMatch = completionText?.match(/\{[\s\S]*\}/);
      guide = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    } catch {
      guide = null;
    }

    if (!guide) {
      return NextResponse.json(
        { error: 'Failed to generate study guide. Please try again.' },
        { status: 500 }
      );
    }

    // Validate and sanitize the structure
    const safeGuide = {
      summary: typeof guide.summary === 'string' ? guide.summary : '',
      keyTerms: Array.isArray(guide.keyTerms)
        ? guide.keyTerms
            .filter((t: { term?: string; definition?: string }) => t.term && t.definition)
            .map((t: { term: string; definition: string }) => ({ term: String(t.term), definition: String(t.definition) }))
        : [],
      faq: Array.isArray(guide.faq)
        ? guide.faq
            .filter((f: { question?: string; answer?: string }) => f.question && f.answer)
            .map((f: { question: string; answer: string }) => ({ question: String(f.question), answer: String(f.answer) }))
        : [],
      quiz: Array.isArray(guide.quiz)
        ? guide.quiz
            .filter((q: { question?: string; options?: unknown; correctIndex?: number }) =>
              q.question && Array.isArray(q.options) && typeof q.correctIndex === 'number')
            .map((q: { question: string; options: string[]; correctIndex: number; explanation?: string }) => ({
              question: String(q.question),
              options: q.options.map(String),
              correctIndex: Number(q.correctIndex),
              explanation: q.explanation ? String(q.explanation) : '',
            }))
        : [],
    };

    return NextResponse.json(safeGuide);
  } catch (error) {
    console.error('Study guide error:', error);
    if (error instanceof AIConfigError) {
      return NextResponse.json({ error: error.message, needsSettings: true }, { status: 400 });
    }
    return NextResponse.json(
      { error: 'Failed to generate study guide', details: String(error) },
      { status: 500 }
    );
  }
}
