/**
 * Supabase Storage client for document files.
 *
 * Replaces the previous local-disk storage (`db/uploads/<projectId>/...`)
 * which does not survive on Vercel's serverless runtime (read-only
 * filesystem except `/tmp`). All document bytes now live in a private
 * Supabase Storage bucket named `documents`.
 *
 * AUTHENTICATION
 * --------------
 * Storage writes/reads use the **service role** key (`SUPABASE_SERVICE_ROLE_KEY`)
 * which bypasses Storage RLS — exactly like Prisma uses the postgres
 * superuser to bypass table RLS. The app's API routes already enforce
 * ownership via `getOwnedProject()` before any storage call, so access
 * control is preserved at the application layer.
 *
 * If the service role key is not configured, we fall back to the anon-key
 * server client (cookie-authenticated). In that case the `documents` bucket
 * must have Storage RLS policies that allow authenticated users to manage
 * objects under their own project paths — see `supabase/storage_policies.sql`.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/** Name of the Supabase Storage bucket that holds uploaded document files. */
export const DOCUMENTS_BUCKET = 'documents';

let _serviceClient: SupabaseClient | null = null;

/**
 * Returns a Supabase client configured for server-side storage operations.
 * Uses the service role key when available (bypasses RLS); otherwise falls
 * back to the anon key (requires Storage RLS policies).
 */
export function getStorageClient(): SupabaseClient {
  if (_serviceClient) return _serviceClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set');

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const key = serviceKey || anonKey;
  if (!key) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY (recommended) or NEXT_PUBLIC_SUPABASE_ANON_KEY is not set'
    );
  }

  _serviceClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _serviceClient;
}

/**
 * Builds the storage path for a document.
 *
 * Layout: `<projectId>/<documentId>/<filename>`
 * - `projectId` segment lets us write project-scoped Storage RLS policies.
 * - `documentId` segment guarantees uniqueness even when two uploads share
 *   the same filename (Supabase `upload` overwrites an existing object at
 *   the same path; the document id prevents that).
 */
export function buildStoragePath(projectId: string, documentId: string, filename: string): string {
  // Strip path separators from the filename to prevent path traversal.
  const safeName = filename.replace(/[/\\]+/g, '_');
  return `${projectId}/${documentId}/${safeName}`;
}

/**
 * Uploads a document file to Supabase Storage.
 *
 * @returns the storage path that should be persisted to `Document.filePath`.
 */
export async function uploadDocumentFile(
  projectId: string,
  documentId: string,
  filename: string,
  data: Buffer,
  contentType: string,
): Promise<string> {
  const path = buildStoragePath(projectId, documentId, filename);
  const { error } = await getStorageClient()
    .storage.from(DOCUMENTS_BUCKET)
    .upload(path, data, { contentType, upsert: false });

  if (error) {
    throw new Error(`Storage upload failed for "${filename}": ${error.message}`);
  }
  return path;
}

/**
 * Downloads a document file from Supabase Storage and returns it as a Buffer.
 */
export async function downloadDocumentFile(storagePath: string): Promise<Buffer> {
  const { data, error } = await getStorageClient()
    .storage.from(DOCUMENTS_BUCKET)
    .download(storagePath);

  if (error) {
    throw new Error(`Storage download failed for "${storagePath}": ${error.message}`);
  }
  if (!data) {
    throw new Error(`Storage returned no data for "${storagePath}"`);
  }
  // `data` is a Blob when running on Node 18+ via fetch. Convert to Buffer.
  const arrayBuffer = await (data as Blob).arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Deletes a document file from Supabase Storage. Silently ignores
 * "object not found" errors so deleting a DB row whose file is already
 * gone does not fail.
 */
export async function deleteDocumentFile(storagePath: string): Promise<void> {
  const { error } = await getStorageClient()
    .storage.from(DOCUMENTS_BUCKET)
    .remove([storagePath]);

  if (error) {
    // Supabase does not surface a distinct "not found" code; treat any
    // error as non-fatal so DB cleanup can still proceed.
    console.error(`[storage] delete failed for "${storagePath}":`, error.message);
  }
}

/**
 * Deletes every file under a project's storage prefix. Used when a project
 * is deleted — Supabase `remove` takes exact object keys, so we list first.
 */
export async function deleteProjectFiles(projectId: string): Promise<void> {
  const client = getStorageClient();
  // List objects at the project prefix. Supabase `list` is recursive within
  // the prefix when `search` is empty; paginate via offset to be safe.
  const allPaths: string[] = [];
  let offset = 0;
  const limit = 1000;
  for (;;) {
    const { data, error } = await client.storage
      .from(DOCUMENTS_BUCKET)
      .list(projectId, { limit, offset });

    if (error) {
      console.error(`[storage] list failed for project "${projectId}":`, error.message);
      return;
    }
    if (!data || data.length === 0) break;

    // Each entry is a folder name (document id) — recurse one level.
    for (const entry of data) {
      if (entry.id === '.' || !entry.name) continue;
      // `entry.name` is the documentId folder; list its contents.
      const { data: files, error: filesErr } = await client.storage
        .from(DOCUMENTS_BUCKET)
        .list(`${projectId}/${entry.name}`, { limit: 100 });
      if (filesErr || !files) continue;
      for (const f of files) {
        if (f.id === '.' || !f.name) continue;
        allPaths.push(`${projectId}/${entry.name}/${f.name}`);
      }
    }

    if (data.length < limit) break;
    offset += limit;
  }

  if (allPaths.length === 0) return;

  const { error: rmErr } = await client.storage
    .from(DOCUMENTS_BUCKET)
    .remove(allPaths);
  if (rmErr) {
    console.error(`[storage] bulk delete failed for project "${projectId}":`, rmErr.message);
  }
}

/**
 * Checks whether a document file exists in storage. Used by the debug
 * endpoint. Supabase Storage has no HEAD/exists call, so we list the
 * parent folder and look for the object name.
 */
export async function documentFileExists(storagePath: string): Promise<boolean> {
  const lastSlash = storagePath.lastIndexOf('/');
  const folder = storagePath.slice(0, lastSlash);
  const name = storagePath.slice(lastSlash + 1);
  if (!folder || !name) return false;

  const { data, error } = await getStorageClient()
    .storage.from(DOCUMENTS_BUCKET)
    .list(folder, { limit: 1000, search: name });

  if (error || !data) return false;
  return data.some((f) => f.name === name);
}
