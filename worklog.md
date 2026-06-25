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

---
Task ID: 2
Agent: Main
Task: Replace pdf-parse with Gemini VLM for PDF text extraction

Work Log:
- Tried sending PDF as `file_url` data URI → API error 1214 "URL格式无效" (invalid URL format)
- Tried sending PDF as `image_url` data URI → API error 1210 "图片输入格式/解析错误" (image format error)
- Solution: Render PDF pages to PNG images using pdfjs-dist + canvas, then send PNGs to VLM
- Installed `pdfjs-dist` and `canvas` packages
- Fixed pdfjs-dist worker issue: set `GlobalWorkerOptions.workerSrc` to absolute path of worker.min.mjs
- Added `canvas` to `serverExternalPackages` in next.config.ts (native C++ bindings)
- Removed `pdf-parse` from serverExternalPackages (no longer used)
- Full E2E test passed: upload PDF → VLM extracts text → chunk created → chat finds context

Stage Summary:
- `src/lib/pdf-parser.ts` now uses: pdfjs-dist (render) → canvas (PNG export) → z-ai-web-dev-sdk VLM (OCR)
- Works with any PDF including scanned/image-based ones (VLM does OCR)
- No dependency on pdf-parse anymore
- Added `canvas` to serverExternalPackages for native module support
---
Task ID: 2
Agent: Main
Task: Replace pdf-parse with Gemini native PDF base64, fix DropZone build error, add credentials to .env

Work Log:
- Created missing `src/components/upload/DropZone.tsx` — drag-and-drop upload with compact mode
- Rewrote `src/app/api/documents/route.ts` — PDFs skip text extraction entirely (just save to disk)
- Rewrote `src/app/api/chat/route.ts` — PDFs sent as `file_url` base64 to Gemini via `createVision`; non-PDFs use chunk-based text search
- Updated `src/components/chat/ChatPanel.tsx` — debug panel now shows PDF direct mode info (pdfCount, pdfNames, usedPdfDirectMode)
- Updated `src/components/workspace/DocumentSidebar.tsx` — removed false "no text extracted" warning for PDFs
- Created `.env` with all credentials (DATABASE_URL, ZAI_BASE_URL, ZAI_API_KEY, ZAI_CHAT_ID, ZAI_USER_ID, ZAI_TOKEN)
- Created `.z-ai-config` in project root (SDK reads this JSON for Gemini API credentials)
- Created `.env.example` with placeholder values

Stage Summary:
- **PDF reading now works end-to-end** — verified with browser test: uploaded PDF → asked question → AI correctly identified document content with page citation
- Architecture: PDF files are sent as raw base64 `file_url` parts to Gemini's `createVision` API — no client-side text extraction needed
- Non-PDF files (TXT, DOCX, XLSX, CSV) still use chunk-based keyword search approach
- Both approaches can be combined when a project has both PDF and non-PDF documents
