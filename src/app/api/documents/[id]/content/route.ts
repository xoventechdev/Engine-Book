import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getOwnerId, getOwnedProject, notOwnedResponse, unauthenticatedResponse } from '@/lib/owner';
import path from 'path';
import fs from 'fs';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const document = await db.document.findUnique({ where: { id } });

    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    const ownerId = await getOwnerId();
    if (!ownerId) return unauthenticatedResponse();
    const project = await getOwnedProject(document.projectId, ownerId);
    if (!project) return notOwnedResponse();

    const absPath = path.join(process.cwd(), document.filePath);
    if (!fs.existsSync(absPath)) {
      return NextResponse.json({ error: 'File not found on disk' }, { status: 404 });
    }

    const fileBuffer = fs.readFileSync(absPath);

    // For PDF files, return the raw file for iframe/embed viewing
    if (document.fileType === 'pdf') {
      return new NextResponse(fileBuffer, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `inline; filename="${document.filename}"`,
        },
      });
    }

    // For DOCX, convert to HTML
    if (document.fileType === 'docx') {
      const mammoth = await import('mammoth');
      const result = await mammoth.convertToHtml({ buffer: fileBuffer });
      return NextResponse.json({ type: 'html', content: result.value });
    }

    // For XLSX/CSV, parse to JSON table
    if (document.fileType === 'xlsx' || document.fileType === 'csv') {
      const XLSX = await import('xlsx');
      let sheets: Record<string, string[][]> = {};

      if (document.fileType === 'xlsx') {
        const workbook = XLSX.read(fileBuffer);
        for (const name of workbook.SheetNames) {
          sheets[name] = XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1 }) as string[][];
        }
      } else {
        const csvText = fileBuffer.toString('utf-8');
        const sheet = XLSX.utils.sheet_to_json(
          XLSX.utils.aoa_to_sheet(csvText.split('\n').map((r) => r.split(','))),
          { header: 1 }
        ) as string[][];
        sheets['Sheet1'] = sheet;
      }

      return NextResponse.json({ type: 'table', sheets });
    }

    // For TXT, return plain text
    if (document.fileType === 'txt') {
      const text = fileBuffer.toString('utf-8');
      return NextResponse.json({ type: 'text', content: text });
    }

    return NextResponse.json({ error: 'Unsupported file type' }, { status: 400 });
  } catch (error) {
    console.error('Failed to get document content:', error);
    return NextResponse.json({ error: 'Failed to get document content' }, { status: 500 });
  }
}