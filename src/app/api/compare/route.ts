import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { generateChat, parseAISettings, AIConfigError } from '@/lib/ai';
import { getOwnerId, getOwnedProject, notOwnedResponse, unauthenticatedResponse } from '@/lib/owner';
import { extractDocumentText } from '@/lib/document-text';

const COMPARE_SYSTEM_PROMPT = `You are an expert at comparing engineering document revisions.
Compare the two document texts provided and identify all differences.
Return a JSON object with this structure:
{
  "summary": "A brief summary of what changed overall",
  "changes": [
    {
      "type": "added|removed|modified",
      "section": "The section or area where the change occurred",
      "detail": "Description of what changed"
    }
  ]
}
Be specific with technical values, numbers, and specifications.
No preamble. Only valid JSON.`;

export async function POST(request: NextRequest) {
  try {
    const { documentAId, documentBId, settings: bodySettings } = await request.json();

    if (!documentAId || !documentBId) {
      return NextResponse.json(
        { error: 'Both documentAId and documentBId are required' },
        { status: 400 }
      );
    }

    const ownerId = await getOwnerId();
    if (!ownerId) return unauthenticatedResponse();
    const settings = parseAISettings(bodySettings) ?? undefined;

    // Get document metadata
    const [docA, docB] = await Promise.all([
      db.document.findUnique({ where: { id: documentAId } }),
      db.document.findUnique({ where: { id: documentBId } }),
    ]);

    if (!docA || !docB) {
      return NextResponse.json({ error: 'One or both documents not found' }, { status: 404 });
    }

    // Verify ownership of both documents' parent projects
    const [projA, projB] = await Promise.all([
      getOwnedProject(docA.projectId, ownerId),
      getOwnedProject(docB.projectId, ownerId),
    ]);
    if (!projA || !projB) return notOwnedResponse();

    // Extract text from both documents (shared helper handles PDF OCR fallback)
    const [textA, textB] = await Promise.all([
      extractDocumentText(docA, settings),
      extractDocumentText(docB, settings),
    ]);

    if (!textA.trim() && !textB.trim()) {
      return NextResponse.json(
        { error: 'Could not extract text from one or both documents' },
        { status: 400 }
      );
    }

    // Use LLM to compare (use same text window for AI + diff for consistency)
    const windowA = textA.slice(0, 8000);
    const windowB = textB.slice(0, 8000);

    const completionText = await generateChat([
      { role: 'system', content: COMPARE_SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Document A (${docA.filename}):\n${windowA}\n\n---\n\nDocument B (${docB.filename}):\n${windowB}`,
      },
    ], undefined, settings);

    const rawResponse = completionText || '{}';

    let comparisonResult;
    try {
      const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
      comparisonResult = jsonMatch ? JSON.parse(jsonMatch[0]) : { summary: 'No differences found', changes: [] };
    } catch {
      comparisonResult = { summary: rawResponse, changes: [] };
    }

    // Also compute a text-level diff
    const { diffWords } = await import('diff');
    const diffResult = diffWords(windowA, windowB);

    return NextResponse.json({
      documentA: { id: docA.id, filename: docA.filename },
      documentB: { id: docB.id, filename: docB.filename },
      aiComparison: comparisonResult,
      textDiff: diffResult.map((part: { added?: boolean; removed?: boolean; value: string }) => ({
        type: part.added ? 'added' : part.removed ? 'removed' : 'unchanged',
        value: part.value,
      })),
      fullTextA: textA,
      fullTextB: textB,
    });
  } catch (error) {
    console.error('Compare error:', error);
    if (error instanceof AIConfigError) {
      return NextResponse.json({ error: error.message, needsSettings: true }, { status: 400 });
    }
    return NextResponse.json(
      { error: 'Failed to compare documents', details: String(error) },
      { status: 500 }
    );
  }
}
