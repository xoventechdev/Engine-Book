import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import path from 'path';
import fs from 'fs';
import ZAI from 'z-ai-web-dev-sdk';

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
    const { documentAId, documentBId } = await request.json();

    if (!documentAId || !documentBId) {
      return NextResponse.json(
        { error: 'Both documentAId and documentBId are required' },
        { status: 400 }
      );
    }

    // Get document metadata
    const [docA, docB] = await Promise.all([
      db.document.findUnique({ where: { id: documentAId } }),
      db.document.findUnique({ where: { id: documentBId } }),
    ]);

    if (!docA || !docB) {
      return NextResponse.json({ error: 'One or both documents not found' }, { status: 404 });
    }

    // Extract text from both documents
    const [textA, textB] = await Promise.all([
      extractDocumentText(docA),
      extractDocumentText(docB),
    ]);

    if (!textA.trim() && !textB.trim()) {
      return NextResponse.json(
        { error: 'Could not extract text from one or both documents' },
        { status: 400 }
      );
    }

    // Use LLM to compare
    const zai = await ZAI.create();
    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'assistant', content: COMPARE_SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Document A (${docA.filename}):\n${textA.slice(0, 8000)}\n\n---\n\nDocument B (${docB.filename}):\n${textB.slice(0, 8000)}`,
        },
      ],
      thinking: { type: 'disabled' },
    });

    const rawResponse = completion.choices[0]?.message?.content || '{}';

    let comparisonResult;
    try {
      const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
      comparisonResult = jsonMatch ? JSON.parse(jsonMatch[0]) : { summary: 'No differences found', changes: [] };
    } catch {
      comparisonResult = { summary: rawResponse, changes: [] };
    }

    // Also compute a text-level diff
    const { default: Diff } = await import('diff');
    const diffResult = Diff.diffWords(textA.slice(0, 5000), textB.slice(0, 5000));

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
    return NextResponse.json(
      { error: 'Failed to compare documents', details: String(error) },
      { status: 500 }
    );
  }
}

async function extractDocumentText(doc: { id: string; fileType: string; filePath: string }): Promise<string> {
  // First try to get text from chunks
  const chunks = await db.documentChunk.findMany({
    where: { documentId: doc.id },
    orderBy: { chunkIndex: 'asc' },
    select: { text: true },
  });

  if (chunks.length > 0) {
    return chunks.map((c) => c.text).join('\n\n');
  }

  // Fallback: parse from file
  const absPath = path.join(process.cwd(), doc.filePath);
  if (!fs.existsSync(absPath)) return '';

  const fileBuffer = fs.readFileSync(absPath);

  if (doc.fileType === 'pdf') {
    const pdfParse = (await import('pdf-parse')).default;
    const data = await pdfParse(fileBuffer);
    return data.text;
  } else if (doc.fileType === 'docx') {
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ buffer: fileBuffer });
    return result.value;
  } else if (doc.fileType === 'txt') {
    return fileBuffer.toString('utf-8');
  } else if (doc.fileType === 'xlsx' || doc.fileType === 'csv') {
    const XLSX = await import('xlsx');
    const workbook = XLSX.read(fileBuffer);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as string[][];
    return rows.map((r) => r.join(' | ')).join('\n');
  }

  return '';
}