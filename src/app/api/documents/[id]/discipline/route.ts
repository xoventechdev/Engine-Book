import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { discipline } = await request.json();

    if (!discipline) {
      return NextResponse.json({ error: 'Discipline is required' }, { status: 400 });
    }

    const document = await db.document.update({
      where: { id },
      data: { discipline },
    });

    return NextResponse.json(document);
  } catch (error) {
    console.error('Failed to update discipline:', error);
    return NextResponse.json({ error: 'Failed to update discipline' }, { status: 500 });
  }
}