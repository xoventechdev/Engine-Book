-- ===========================================================================
-- Engine Book — Row Level Security (RLS) Policies
-- ===========================================================================
-- Run this in the Supabase SQL Editor (Dashboard → SQL → New query → paste → Run)
--
-- WHY: Supabase exposes a public REST API (PostgREST) at
--   https://<project>.supabase.co/rest/v1
-- using the public anon key. Without RLS, ANYONE with that key can read/write
-- ALL rows in every table — bypassing the app's API routes entirely.
--
-- These policies ensure that via the REST API, a user can only access rows
-- belonging to projects they own (projectId → Project.ownerId = auth.uid()::text).
--
-- NOTE: Prisma connects as the postgres superuser which BYPASSES RLS, so the
-- app's own API routes continue to work normally. RLS only restricts direct
-- REST API access with the anon/authenticated key.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 0. Drop existing policies (idempotent — safe to re-run)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "owner_select" ON "Project";
DROP POLICY IF EXISTS "owner_insert" ON "Project";
DROP POLICY IF EXISTS "owner_update" ON "Project";
DROP POLICY IF EXISTS "owner_delete" ON "Project";

DROP POLICY IF EXISTS "doc_select"   ON "Document";
DROP POLICY IF EXISTS "doc_insert"   ON "Document";
DROP POLICY IF EXISTS "doc_update"   ON "Document";
DROP POLICY IF EXISTS "doc_delete"   ON "Document";

DROP POLICY IF EXISTS "chunk_select" ON "DocumentChunk";
DROP POLICY IF EXISTS "chunk_insert" ON "DocumentChunk";
DROP POLICY IF EXISTS "chunk_delete" ON "DocumentChunk";

DROP POLICY IF EXISTS "msg_select"   ON "ChatMessage";
DROP POLICY IF EXISTS "msg_insert"   ON "ChatMessage";
DROP POLICY IF EXISTS "msg_delete"   ON "ChatMessage";

DROP POLICY IF EXISTS "ann_select"   ON "Annotation";
DROP POLICY IF EXISTS "ann_insert"   ON "Annotation";
DROP POLICY IF EXISTS "ann_update"   ON "Annotation";
DROP POLICY IF EXISTS "ann_delete"   ON "Annotation";

DROP POLICY IF EXISTS "out_select"   ON "GeneratedOutput";
DROP POLICY IF EXISTS "out_insert"   ON "GeneratedOutput";
DROP POLICY IF EXISTS "out_delete"   ON "GeneratedOutput";

-- ---------------------------------------------------------------------------
-- 1. Enable RLS on all tables
-- ---------------------------------------------------------------------------
ALTER TABLE "Project"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Document"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DocumentChunk"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ChatMessage"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Annotation"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GeneratedOutput"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Setting"          ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 2. Project — owner can manage their own projects
--    ownerId = auth.uid()::text (legacy null-owner projects are NOT accessible via REST)
-- ---------------------------------------------------------------------------
CREATE POLICY "owner_select" ON "Project"
  FOR SELECT TO authenticated USING ("ownerId" = auth.uid()::text);

CREATE POLICY "owner_insert" ON "Project"
  FOR INSERT TO authenticated WITH CHECK ("ownerId" = auth.uid()::text);

CREATE POLICY "owner_update" ON "Project"
  FOR UPDATE TO authenticated USING ("ownerId" = auth.uid()::text) WITH CHECK ("ownerId" = auth.uid()::text);

CREATE POLICY "owner_delete" ON "Project"
  FOR DELETE TO authenticated USING ("ownerId" = auth.uid()::text);

-- ---------------------------------------------------------------------------
-- 3. Document — accessible if parent project is owned by the user
-- ---------------------------------------------------------------------------
CREATE POLICY "doc_select" ON "Document"
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM "Project" p WHERE p.id = "projectId" AND p."ownerId" = auth.uid()::text)
  );

CREATE POLICY "doc_insert" ON "Document"
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM "Project" p WHERE p.id = "projectId" AND p."ownerId" = auth.uid()::text)
  );

CREATE POLICY "doc_update" ON "Document"
  FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM "Project" p WHERE p.id = "projectId" AND p."ownerId" = auth.uid()::text)
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM "Project" p WHERE p.id = "projectId" AND p."ownerId" = auth.uid()::text)
  );

CREATE POLICY "doc_delete" ON "Document"
  FOR DELETE TO authenticated USING (
    EXISTS (SELECT 1 FROM "Project" p WHERE p.id = "projectId" AND p."ownerId" = auth.uid()::text)
  );

-- ---------------------------------------------------------------------------
-- 4. DocumentChunk — accessible if parent document's project is owned by user
-- ---------------------------------------------------------------------------
CREATE POLICY "chunk_select" ON "DocumentChunk"
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM "Document" d
      JOIN "Project" p ON p.id = d."projectId"
      WHERE d.id = "documentId" AND p."ownerId" = auth.uid()::text
    )
  );

CREATE POLICY "chunk_insert" ON "DocumentChunk"
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM "Document" d
      JOIN "Project" p ON p.id = d."projectId"
      WHERE d.id = "documentId" AND p."ownerId" = auth.uid()::text
    )
  );

CREATE POLICY "chunk_delete" ON "DocumentChunk"
  FOR DELETE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM "Document" d
      JOIN "Project" p ON p.id = d."projectId"
      WHERE d.id = "documentId" AND p."ownerId" = auth.uid()::text
    )
  );

-- ---------------------------------------------------------------------------
-- 5. ChatMessage — accessible if parent project is owned by the user
-- ---------------------------------------------------------------------------
CREATE POLICY "msg_select" ON "ChatMessage"
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM "Project" p WHERE p.id = "projectId" AND p."ownerId" = auth.uid()::text)
  );

CREATE POLICY "msg_insert" ON "ChatMessage"
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM "Project" p WHERE p.id = "projectId" AND p."ownerId" = auth.uid()::text)
  );

CREATE POLICY "msg_delete" ON "ChatMessage"
  FOR DELETE TO authenticated USING (
    EXISTS (SELECT 1 FROM "Project" p WHERE p.id = "projectId" AND p."ownerId" = auth.uid()::text)
  );

-- ---------------------------------------------------------------------------
-- 6. Annotation — accessible if parent project is owned by the user
-- ---------------------------------------------------------------------------
CREATE POLICY "ann_select" ON "Annotation"
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM "Project" p WHERE p.id = "projectId" AND p."ownerId" = auth.uid()::text)
  );

CREATE POLICY "ann_insert" ON "Annotation"
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM "Project" p WHERE p.id = "projectId" AND p."ownerId" = auth.uid()::text)
  );

CREATE POLICY "ann_update" ON "Annotation"
  FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM "Project" p WHERE p.id = "projectId" AND p."ownerId" = auth.uid()::text)
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM "Project" p WHERE p.id = "projectId" AND p."ownerId" = auth.uid()::text)
  );

CREATE POLICY "ann_delete" ON "Annotation"
  FOR DELETE TO authenticated USING (
    EXISTS (SELECT 1 FROM "Project" p WHERE p.id = "projectId" AND p."ownerId" = auth.uid()::text)
  );

-- ---------------------------------------------------------------------------
-- 7. GeneratedOutput — accessible if parent project is owned by the user
-- ---------------------------------------------------------------------------
CREATE POLICY "out_select" ON "GeneratedOutput"
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM "Project" p WHERE p.id = "projectId" AND p."ownerId" = auth.uid()::text)
  );

CREATE POLICY "out_insert" ON "GeneratedOutput"
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM "Project" p WHERE p.id = "projectId" AND p."ownerId" = auth.uid()::text)
  );

CREATE POLICY "out_delete" ON "GeneratedOutput"
  FOR DELETE TO authenticated USING (
    EXISTS (SELECT 1 FROM "Project" p WHERE p.id = "projectId" AND p."ownerId" = auth.uid()::text)
  );

-- ---------------------------------------------------------------------------
-- 8. Setting — NO policies (locks down all REST API access)
--    This table is only accessed via Prisma (superuser) in the app's API routes.
--    Enabling RLS with no policies = no REST access at all.
--    (AI keys now live in browser localStorage, not this table.)
-- ---------------------------------------------------------------------------

-- Done. Verify with:
--   SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public';
