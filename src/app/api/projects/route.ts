import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getOwnerId, claimLegacyProjects, unauthenticatedResponse } from '@/lib/owner';

export async function GET() {
  try {
    const ownerId = await getOwnerId();
    if (!ownerId) return unauthenticatedResponse();

    // Claim legacy (null-owner) projects for this browser on first load.
    await claimLegacyProjects(ownerId);

    const projects = await db.project.findMany({
      where: ownerId ? { ownerId } : {},
      orderBy: { updatedAt: 'desc' },
      include: {
        _count: { select: { documents: true } },
      },
    });

    return NextResponse.json(projects);
  } catch (error) {
    console.error('Failed to fetch projects:', error);
    return NextResponse.json({ error: 'Failed to fetch projects' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, description, discipline } = body;

    if (!name || name.trim().length === 0) {
      return NextResponse.json({ error: 'Project name is required' }, { status: 400 });
    }

    const ownerId = await getOwnerId();
    if (!ownerId) return unauthenticatedResponse();

    const project = await db.project.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        discipline: discipline || 'General',
        ownerId: ownerId || null,
      },
      include: {
        _count: { select: { documents: true } },
      },
    });

    return NextResponse.json(project, { status: 201 });
  } catch (error) {
    console.error('Failed to create project:', error);
    return NextResponse.json({ error: 'Failed to create project' }, { status: 500 });
  }
}