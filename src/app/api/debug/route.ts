import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getOwnerId, getOwnedProject, claimLegacyProjects, unauthenticatedResponse } from '@/lib/owner';
import path from 'path';
import fs from 'fs';

/**
 * Debug endpoint to diagnose document processing pipeline
 * Usage: GET /api/debug?projectId=xxx   (project-specific)
 *        GET /api/debug                  (all projects overview)
 */
export async function GET(request: NextRequest) {
  // Only available in development — prevents leaking internal diagnostics in production
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Not available' }, { status: 403 });
  }

  try {
    const ownerId = await getOwnerId();
    if (!ownerId) return unauthenticatedResponse();
    const projectId = request.nextUrl.searchParams.get('projectId');

    const debug: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      nodeVersion: process.version,
    };

    if (!projectId) {
      // Show all projects overview (scoped to this owner)
      await claimLegacyProjects(ownerId);
      const projects = await db.project.findMany({
        where: ownerId ? { ownerId } : {},
        include: {
          _count: { select: { documents: true, chatMessages: true } },
          documents: {
            include: { _count: { select: { chunks: true } } },
            orderBy: { uploadedAt: 'desc' },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      debug.projects = projects.map(p => ({
        id: p.id,
        name: p.name,
        documentsCount: p._count.documents,
        chatCount: p._count.chatMessages,
        documents: p.documents.map(d => ({
          id: d.id,
          filename: d.filename,
          fileType: d.fileType,
          fileSize: d.fileSize,
          filePath: d.filePath,
          fileExists: fs.existsSync(path.join(process.cwd(), d.filePath)),
          chunkCount: d._count.chunks,
        })),
      }));

      return NextResponse.json(debug);
    }

    // Project-specific debug
    const owned = await getOwnedProject(projectId, ownerId);
    if (!owned) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const project = await db.project.findUnique({
      where: { id: projectId },
      include: {
        documents: {
          include: { _count: { select: { chunks: true } } },
          orderBy: { uploadedAt: 'desc' },
        },
      },
    });
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Get all chunks for the project
    const allChunks = await db.documentChunk.findMany({
      where: {
        documentId: { in: project.documents.map(d => d.id) },
      },
      select: {
        id: true,
        documentId: true,
        text: true,
        pageNumber: true,
        chunkIndex: true,
      },
      orderBy: { chunkIndex: 'asc' },
    });

    // Group chunks by document
    const chunksByDoc = new Map<string, typeof allChunks>();
    for (const chunk of allChunks) {
      const existing = chunksByDoc.get(chunk.documentId) || [];
      existing.push(chunk);
      chunksByDoc.set(chunk.documentId, existing);
    }

    debug.project = {
      id: project.id,
      name: project.name,
      documentCount: project.documents.length,
    };

    debug.documents = project.documents.map(d => ({
      id: d.id,
      filename: d.filename,
      fileType: d.fileType,
      fileSize: d.fileSize,
      filePath: d.filePath,
      fileExists: fs.existsSync(path.join(process.cwd(), d.filePath)),
      chunkCount: d._count.chunks,
      chunksPreview: (chunksByDoc.get(d.id) || []).slice(0, 2).map(c => ({
        chunkIndex: c.chunkIndex,
        pageNumber: c.pageNumber,
        textLength: c.text.length,
        preview: c.text.slice(0, 150),
      })),
    }));

    debug.totalChunks = allChunks.length;

    return NextResponse.json(debug);
  } catch (error) {
    return NextResponse.json({
      error: 'Debug endpoint failed',
      details: String(error),
      stack: (error as Error).stack?.slice(0, 1000),
    }, { status: 500 });
  }
}