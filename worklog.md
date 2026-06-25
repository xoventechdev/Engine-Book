---
Task ID: 1
Agent: Main
Task: Fix PDF reading failure - root cause diagnosis and fix

Work Log:
- Investigated dev.log: only shows HTTP request lines, not console.log output from API routes
- Checked database: 0 PDF documents recorded despite PDF files existing on disk
- Tested pdf-parse in Node.js directly: works perfectly (extracts text from test-hvac.pdf)
- Tested PDF upload via Next.js API: **server crashes during route compilation**
- Root cause: `pdf-parse` module crashes Turbopack when it tries to bundle/compile the route
- Fix: Added `serverExternalPackages: ["pdf-parse"]` to next.config.ts
- Verified fix: PDF upload now creates document + 1 chunk, chat AI correctly reads PDF content
- Created missing DropZone component (was lost from previous session)
- Added `/api/debug` endpoint for diagnostics
- Added debug info to chat API response and debug panel in ChatPanel UI

Stage Summary:
- **ROOT CAUSE**: `pdf-parse` crashes the Turbopack dev server during API route compilation. The server starts, but any request to `/api/documents` (POST) or `/api/chat` (POST) that triggers pdf-parse import causes a silent crash. This is why PDFs were never processed - the upload request itself crashed the server.
- **FIX**: `serverExternalPackages: ["pdf-parse"]` in next.config.ts tells Turbopack to not bundle pdf-parse, loading it at runtime instead
- **DROPZONE**: Re-created missing `/src/components/upload/DropZone.tsx` component
- **DEBUG**: Added debug panel (🐛 button) in AI Chat that auto-opens when no context is found, showing document count, chunk count, search results, and per-document diagnostics
