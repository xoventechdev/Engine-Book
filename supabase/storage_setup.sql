-- ===========================================================================
-- Engine Book — Supabase Storage setup
-- ===========================================================================
-- Run this in the Supabase SQL Editor (Dashboard → SQL → New query → paste → Run)
--
-- Creates the `documents` bucket used by the app to store uploaded files
-- (PDF/DOCX/TXT/XLSX/CSV) and (optionally) Row Level Security policies.
--
-- WHEN ARE THE RLS POLICIES NEEDED?
-- --------------------------------
-- • If you set SUPABASE_SERVICE_ROLE_KEY in .env (RECOMMENDED): the app uses
--   the service role key, which bypasses Storage RLS entirely. The policies
--   below are still safe to apply but are not required.
-- • If you do NOT set the service role key: the app falls back to the anon
--   key (cookie-authenticated user). In that case the policies below ARE
--   required so users can only touch files under their own projects.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Create the `documents` bucket (private, 25 MB file size limit)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documents',
  'documents',
  false,                                -- private bucket — access via signed URL or service role only
  26214400,                             -- 25 MB, matches the app's MAX_FILE_SIZE
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'text/csv',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
on conflict (id) do update set
  public        = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- 2. Storage RLS policies (optional — see note above)
-- ---------------------------------------------------------------------------
-- Object path layout: `<projectId>/<documentId>/<filename>`
-- We use `split_part(name, '/', 1)` to pull the first path segment (= projectId)
-- as `text`. NOTE: do NOT use `storage.foldername(name)` — in current Supabase
-- versions it returns `text[]`, which makes `p.id = storage.foldername(name)`
-- fail with "operator does not exist: text = text[]".

-- Drop existing policies (idempotent — safe to re-run)
drop policy if exists "documents_storage_read"   on storage.objects;
drop policy if exists "documents_storage_insert" on storage.objects;
drop policy if exists "documents_storage_update" on storage.objects;
drop policy if exists "documents_storage_delete" on storage.objects;

-- Enable RLS on storage.objects (already enabled by default in Supabase)
-- alter table storage.objects enable row level security;

-- SELECT / read — owner of the parent project can read the object
create policy "documents_storage_read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'documents'
    and exists (
      select 1 from "Project" p
      where p.id = split_part(name, '/', 1)
        and p."ownerId" = auth.uid()::text
    )
  );

-- INSERT — owner of the parent project can upload into it
create policy "documents_storage_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'documents'
    and exists (
      select 1 from "Project" p
      where p.id = split_part(name, '/', 1)
        and p."ownerId" = auth.uid()::text
    )
  );

-- DELETE — owner of the parent project can delete objects in it
create policy "documents_storage_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'documents'
    and exists (
      select 1 from "Project" p
      where p.id = split_part(name, '/', 1)
        and p."ownerId" = auth.uid()::text
    )
  );

-- UPDATE — owner of the parent project can overwrite objects in it
create policy "documents_storage_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'documents'
    and exists (
      select 1 from "Project" p
      where p.id = split_part(name, '/', 1)
        and p."ownerId" = auth.uid()::text
    )
  )
  with check (
    bucket_id = 'documents'
    and exists (
      select 1 from "Project" p
      where p.id = split_part(name, '/', 1)
        and p."ownerId" = auth.uid()::text
    )
  );

-- Done. Verify with:
--   select id, name, public, file_size_limit from storage.buckets where id = 'documents';
--   select tablename, policyname from pg_policies where schemaname = 'storage' and tablename = 'objects';
