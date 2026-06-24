# Engine Book - Development Worklog

---
Task ID: 1
Agent: Main
Task: Project setup - dependencies, DB, directories, layout

Work Log:
- Installed react-dropzone, cytoscape, react-cytoscapejs
- Created all project directories (components, API routes)
- Prisma schema already in sync, generated client
- DB is at db/custom.db (SQLite)
- Updated layout.tsx with ThemeProvider from next-themes

Stage Summary:
- Project foundation ready
- All shadcn/ui components available
- Zustand store with full types defined
- Chunker/search utilities ready
- Dependencies: mammoth, pdf-parse, xlsx, react-markdown, diff, zustand, framer-motion, react-resizable-panels---
Task ID: 1
Agent: main
Task: Fix 'setCurrentProject is not defined' error and add upload progress bars

Work Log:
- Diagnosed the ReferenceError: `setCurrentProject` was used in `WorkspaceToolbar.tsx` line 21 but not destructured from `useAppStore()` on line 16
- Fixed by adding `setCurrentProject` to the destructuring statement
- Implemented upload progress bar in `DocumentSidebar.tsx`:
  - Replaced `fetch` with `XMLHttpRequest` to access `upload.onprogress` events
  - Added `UploadItem` interface tracking per-file: id, file, progress (0-100), status (uploading/parsing/done/error)
  - Progress panel appears below DropZone when uploads are active
  - Each file shows: icon, filename, progress bar, percentage, cancel button
  - After upload completes (100%), transitions to "Parsing..." state (amber pulse), then "Done" (green checkmark), then auto-cleans
  - Error states show red border with error message, auto-cleans after 4s
  - Uses `abortControllersRef` to support cancelling in-flight uploads
  - Uses shadcn/ui `Progress` component with custom indicator colors per state
- Ran ESLint - passes cleanly
- Ran TypeScript check - no errors in modified files
- Verified via agent-browser: page loads with zero console errors

Stage Summary:
- Fixed: `setCurrentProject is not defined` in WorkspaceToolbar.tsx (added missing destructuring)
- Added: Full upload progress tracking with per-file progress bars in DocumentSidebar.tsx
- Note: Server OOM in sandbox environment prevents full E2E browser testing (known limitation)
---
Task ID: 2
Agent: main
Task: Fix dropzone stuck disabled after upload + PDF viewer tiny height

Work Log:
- Diagnosed dropzone issue: `uploading` boolean state managed separately from `uploadItems`, never reset because the cleanup check ran synchronously while items were still in async `parsing` state via setTimeout
- Fixed by removing separate `uploading` state and deriving it: `const uploading = uploadItems.some(u => u.status === 'uploading' || u.status === 'parsing')` — auto-resets the instant all items leave active states
- Diagnosed PDF height issue: DocumentViewer root used `flex-1` class but parent (react-resizable-panels Panel) is not a flex container, so `flex-1` had no effect — iframe collapsed to minimal height
- Fixed DocumentViewer: changed all root containers from `flex-1` to `h-full` (4 places: empty state, loading, error, main view)
- Added `min-h-0 relative` to the content wrapper div to prevent flexbox min-height auto issue with iframe
- ESLint passes cleanly

Stage Summary:
- Fixed: Dropzone no longer gets stuck disabled — `uploading` is now derived from uploadItems state
- Fixed: PDF viewer now fills full panel height using `h-full` + `min-h-0`
