import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { generateChat, parseAISettings, AIConfigError } from '@/lib/ai';
import { getOwnerId, getOwnedProject, notOwnedResponse, unauthenticatedResponse } from '@/lib/owner';
import { collectProjectText } from '@/lib/document-text';

const REPORT_SYSTEM_PROMPT = `You are a technical documentation expert for engineering projects.
Based on the document content provided, generate the requested output in structured format.
Use clear headings, numbered lists for sequential steps, and tables for specifications.
Every item in the output must be traceable to a specific document section.
Output in clean Markdown format.`;

export async function POST(request: NextRequest) {
  try {
    const { projectId, outputType, title, settings: bodySettings } = await request.json();

    if (!projectId || !outputType) {
      return NextResponse.json(
        { error: 'projectId and outputType are required' },
        { status: 400 }
      );
    }

    const ownerId = await getOwnerId();
    if (!ownerId) return unauthenticatedResponse();
    const project = await getOwnedProject(projectId, ownerId);
    if (!project) return notOwnedResponse();

    const settings = parseAISettings(bodySettings) ?? undefined;

    // Collect text from all documents (handles PDFs via OCR fallback)
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

    // Build the generation prompt based on output type
    const typeInstructions: Record<string, string> = {
      commissioning_checklist: `Generate a comprehensive commissioning checklist. Include sections for:
- Pre-commissioning checks
- Startup procedures
- Functional performance tests
- Point-to-point verification
- Safety interlocks testing
Format as a checklist with checkboxes (using [ ] syntax). Include the source document reference for each item.`,

      equipment_schedule: `Generate an equipment schedule table. Include:
- Equipment tag/number
- Equipment type and model
- Rated capacity/values (power, flow, pressure, etc.)
- Location/area
- Manufacturer
Format as a Markdown table. Include document references.`,

      handover_report: `Generate a handover / O&M summary report. Include:
- System overview
- Equipment inventory
- Key operating parameters
- Maintenance schedule recommendations
- Warranty information
- Emergency procedures summary
Format in a professional report structure with clear sections.`,

      data_extraction: `Extract all relevant data into a structured table format. Identify:
- Setpoints and thresholds
- Control parameters
- Alarm settings
- Performance ratings
- Any tabular data in the documents
Format as organized Markdown tables. Cite sources.`,
    };

    const instruction = typeInstructions[outputType] || typeInstructions.data_extraction;

    // Call LLM
    const completionText = await generateChat([
      { role: 'system', content: REPORT_SYSTEM_PROMPT },
      {
        role: 'user',
        content: `${instruction}\n\nDocument content:\n${combinedText}`,
      },
    ], undefined, settings);

    const reportContent = completionText || 'Failed to generate report.';

    // Save to database
    const output = await db.generatedOutput.create({
      data: {
        projectId,
        outputType,
        title: title || getOutputTitle(outputType),
        content: reportContent,
      },
    });

    return NextResponse.json({
      id: output.id,
      outputType: output.outputType,
      title: output.title,
      content: output.content,
      createdAt: output.createdAt,
    });
  } catch (error) {
    console.error('Report generation error:', error);
    if (error instanceof AIConfigError) {
      return NextResponse.json({ error: error.message, needsSettings: true }, { status: 400 });
    }
    return NextResponse.json(
      { error: 'Failed to generate report', details: String(error) },
      { status: 500 }
    );
  }
}

function getOutputTitle(type: string): string {
  const titles: Record<string, string> = {
    commissioning_checklist: 'Commissioning Checklist',
    equipment_schedule: 'Equipment Schedule',
    handover_report: 'Handover / O&M Report',
    data_extraction: 'Data Extraction Table',
  };
  return titles[type] || 'Generated Report';
}
