import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getOwnerId, getOwnedProject, notOwnedResponse, unauthenticatedResponse } from '@/lib/owner';

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

    const document = await db.document.findUnique({ where: { id } });
    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    const ownerId = await getOwnerId();
    if (!ownerId) return unauthenticatedResponse();
    const project = await getOwnedProject(document.projectId, ownerId);
    if (!project) return notOwnedResponse();

    const updated = await db.document.update({
      where: { id },
      data: { discipline },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Failed to update discipline:', error);
    return NextResponse.json({ error: 'Failed to update discipline' }, { status: 500 });
  }
}