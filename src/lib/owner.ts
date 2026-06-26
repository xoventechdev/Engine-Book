/**
 * Server-side helpers for per-user data isolation via Supabase Auth.
 *
 * The owner identity is the Supabase user's UUID, retrieved from the session
 * cookie (set by the browser Supabase client + refreshed by middleware).
 * Project queries are scoped to this owner. Legacy projects (ownerId null —
 * created before auth) are claimable by the first user that lists projects.
 */

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getUserId } from '@/lib/supabase/server'

/** Returns the authenticated Supabase user's UUID, or '' if not logged in. */
export async function getOwnerId(): Promise<string> {
  return getUserId()
}

/** 401 response for routes that require authentication. */
export function unauthenticatedResponse() {
  return NextResponse.json(
    { error: 'Authentication required. Please sign in.', needsAuth: true },
    { status: 401 }
  )
}

/**
 * Returns the project if it exists AND is owned by `ownerId`.
 * Legacy projects (ownerId null/empty) are accessible to any authenticated
 * user as a fallback (they are normally claimed on the first dashboard load
 * via claimLegacyProjects).
 */
export async function getOwnedProject(projectId: string, ownerId: string) {
  const project = await db.project.findUnique({ where: { id: projectId } });
  if (!project) return null;
  if (project.ownerId === null || project.ownerId === '') return project;
  if (ownerId && project.ownerId === ownerId) return project;
  return null;
}

/**
 * Reassign all legacy (null-owner) projects to the given user. Runs on project
 * list load.
 *
 * Race-safety: Prisma's updateMany compiles to a single
 *   UPDATE "Project" SET "ownerId" = $1 WHERE "ownerId" IS NULL
 * Under READ COMMITTED (Postgres default), concurrent calls are serialized by
 * row-level locks — the first transaction updates the rows, and the second
 * re-evaluates the WHERE clause against the now-non-null rows (0 matched).
 * So only one user can claim a given legacy project. No additional guarding
 * needed.
 */
export async function claimLegacyProjects(ownerId: string): Promise<void> {
  if (!ownerId) return;
  await db.project.updateMany({ where: { ownerId: null }, data: { ownerId } });
}

export function notOwnedResponse(msg = 'Project not found or not accessible') {
  return NextResponse.json({ error: msg }, { status: 403 });
}
