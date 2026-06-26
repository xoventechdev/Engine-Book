import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getOwnerId, getOwnedProject, notOwnedResponse, unauthenticatedResponse } from '@/lib/owner';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ownerId = await getOwnerId();
    if (!ownerId) return unauthenticatedResponse();
    const project = await getOwnedProject(id, ownerId);
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const fullProject = await db.project.findUnique({
      where: { id },
      include: {
        _count: { select: { documents: true } },
      },
    });

    return NextResponse.json(fullProject);
  } catch (error) {
    console.error('Failed to fetch project:', error);
    return NextResponse.json({ error: 'Failed to fetch project' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ownerId = await getOwnerId();
    if (!ownerId) return unauthenticatedResponse();
    const project = await getOwnedProject(id, ownerId);
    if (!project) return notOwnedResponse();

    // Delete associated documents from filesystem
    const documents = await db.document.findMany({
      where: { projectId: id },
      select: { filePath: true },
    });

    const fs = await import('fs');
    const path = await import('path');
    for (const doc of documents) {
      try {
        const fullPath = path.join(process.cwd(), doc.filePath);
        if (fs.existsSync(fullPath)) {
          fs.unlinkSync(fullPath);
        }
      } catch {
        // Ignore file deletion errors
      }
    }

    await db.project.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete project:', error);
    return NextResponse.json({ error: 'Failed to delete project' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ownerId = await getOwnerId();
    if (!ownerId) return unauthenticatedResponse();
    const project = await getOwnedProject(id, ownerId);
    if (!project) return notOwnedResponse();

    const body = await request.json();
    const { name, description, discipline } = body;

    const updated = await db.project.update({
      where: { id },
      data: {
        ...(name && { name: name.trim() }),
        ...(description !== undefined && { description: description?.trim() || null }),
        ...(discipline && { discipline }),
      },
      include: {
        _count: { select: { documents: true } },
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Failed to update project:', error);
    return NextResponse.json({ error: 'Failed to update project' }, { status: 500 });
  }
}