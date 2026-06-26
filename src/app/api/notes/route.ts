import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getOwnerId, getOwnedProject, notOwnedResponse, unauthenticatedResponse } from '@/lib/owner';

// GET — list notes for a project
export async function GET(request: NextRequest) {
  try {
    const projectId = request.nextUrl.searchParams.get('projectId');
    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
    }

    const ownerId = await getOwnerId();
    if (!ownerId) return unauthenticatedResponse();
    const project = await getOwnedProject(projectId, ownerId);
    if (!project) return notOwnedResponse();

    const notes = await db.note.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(notes);
  } catch (error) {
    console.error('Failed to fetch notes:', error);
    return NextResponse.json({ error: 'Failed to fetch notes' }, { status: 500 });
  }
}

// POST — create a note (pin an answer)
export async function POST(request: NextRequest) {
  try {
    const { projectId, title, content } = await request.json();

    if (!projectId || !content?.trim()) {
      return NextResponse.json({ error: 'projectId and content are required' }, { status: 400 });
    }

    const ownerId = await getOwnerId();
    if (!ownerId) return unauthenticatedResponse();
    const project = await getOwnedProject(projectId, ownerId);
    if (!project) return notOwnedResponse();

    const note = await db.note.create({
      data: {
        projectId,
        title: title?.trim() || content.trim().slice(0, 60) + '...',
        content: content.trim(),
      },
    });

    return NextResponse.json(note, { status: 201 });
  } catch (error) {
    console.error('Failed to create note:', error);
    return NextResponse.json({ error: 'Failed to create note' }, { status: 500 });
  }
}

// DELETE — remove a note
export async function DELETE(request: NextRequest) {
  try {
    const noteId = request.nextUrl.searchParams.get('id');
    if (!noteId) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const ownerId = await getOwnerId();
    if (!ownerId) return unauthenticatedResponse();

    // Verify ownership via the note's project
    const note = await db.note.findUnique({ where: { id: noteId } });
    if (!note) {
      return NextResponse.json({ error: 'Note not found' }, { status: 404 });
    }
    const project = await getOwnedProject(note.projectId, ownerId);
    if (!project) return notOwnedResponse();

    await db.note.delete({ where: { id: noteId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete note:', error);
    return NextResponse.json({ error: 'Failed to delete note' }, { status: 500 });
  }
}
