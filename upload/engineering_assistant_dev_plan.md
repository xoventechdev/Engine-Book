# Engineering Assistant — Full Development Plan
**App codename: Engine Book**
**Type:** AI-powered document assistant for engineers (NotebookLM-style)
**Date:** June 2026

---

## 1. App Overview

EngineBot is a web application that allows engineers to upload technical documents — datasheets, spec sheets, commissioning reports, point schedules, wiring diagrams, manuals — and interact with them using AI. Users can ask questions, extract structured data, compare document revisions, and auto-generate checklists and reports. It works across all engineering disciplines: BMS/BAS, HVAC, Electrical, Civil, Structural, MEP, and Fire Alarm.

The core experience is simple: upload your documents, then talk to them.

---

## 2. Target Users

### Primary Users

**BMS / BAS Engineers (like you)**
- Upload Alerton, Siemens, Honeywell, or Johnson Controls controller manuals
- Ask questions like "What is the default baud rate for the ACM controller?"
- Extract BACnet point schedules from PDFs automatically
- Generate commissioning checklists from submitted specs

**Site Commissioning Engineers**
- Upload O&M manuals and system submittals before site visits
- Generate pre-commissioning punch lists from spec documents
- Ask "What are the startup requirements for this AHU?"

**MEP Design Engineers**
- Upload multiple vendor submittals and compare them side by side
- Search across 10+ documents without reading everything manually
- Ask "Which vendor meets the minimum EER rating in the spec?"

**Electrical Engineers**
- Upload panel schedules, single-line diagrams, and protection relay manuals
- Extract cable sizing tables and protection settings

**Project Managers / Document Controllers**
- Upload as-built drawings and specifications
- Track document versions and compare revisions
- Generate summary reports from technical submittals

**Engineering Students / Fresh Graduates**
- Learn from real technical documents interactively
- Ask concept questions grounded in actual spec documents
- Use it as a study tool for certifications (CIBSE, ASHRAE, etc.)

---

## 3. Core Features (All Phases)

### Feature 1 — Document Upload and Viewer
- Supported formats: PDF, DOCX, TXT, XLSX, CSV
- Drag-and-drop upload interface
- Multi-file upload (up to 10 documents per project)
- Built-in PDF viewer using PDF.js (page navigation, zoom, text selection)
- DOCX rendered as HTML for preview
- XLSX displayed as a scrollable table
- Users can select text in the viewer and click "Ask about this" to query it directly

### Feature 2 — AI Chat Q&A (RAG-powered)
- Type any question about the uploaded documents
- AI searches across all uploaded files using semantic vector search (RAG — Retrieval-Augmented Generation)
- Every answer includes citations: document name, page number, and section
- Clicking a citation jumps to that exact page in the document viewer
- Conversation history is saved per project session
- Supports follow-up questions within the same context
- Works in both English and Bengali (bilingual support)

### Feature 3 — Knowledge Graph
- Click "Generate Graph" to auto-extract all key entities from the documents
- Entities include: equipment names, model numbers, rated values, standards references, system names, process tags
- Displays as an interactive visual node graph (using D3.js or Cytoscape.js)
- Click any node to ask a question about it
- Filter graph by category: Equipment, Specs, Standards, Locations
- Export graph as PNG or SVG

### Feature 4 — Document Comparison Mode
- Upload two versions of the same document (e.g., Revision A vs Revision B)
- AI highlights what changed: added content, removed content, modified values
- Side-by-side diff view in the UI
- Summary of changes shown as a bulleted list
- Useful for tracking spec revisions, vendor resubmittals, and drawing updates

### Feature 5 — Report and Checklist Generator
- Select any uploaded document and choose an output type:
  - Commissioning checklist (pre-comm, startup, functional test)
  - Equipment schedule (tag, type, rated values, location)
  - Handover / O&M summary report
  - Data extraction table (e.g., all set-points from a BMS spec)
- Generated output is editable in the app before export
- Export as PDF or DOCX
- Templates can be saved and reused per discipline

### Feature 6 — Project Workspace
- Users create named projects (e.g., "KAFD P403 — Fire Alarm BACnet Integration")
- Each project holds its own set of documents, chat history, and generated outputs
- Projects are saved and can be reopened at any time
- Share a project (read-only link) with a colleague

### Feature 7 — Smart Highlight and Annotation
- Select any text in the document viewer
- Right-click menu: Highlight, Add Note, Ask AI, Copy
- Highlights and notes are saved per document per project
- All annotations are exportable as a summary PDF

### Feature 8 — Discipline Filter and Tag System
- Each uploaded document is tagged by discipline on upload: BMS, HVAC, Electrical, Fire Alarm, Structural, Civil, MEP, General
- Chat can be filtered: "Only search in Fire Alarm documents"
- Documents tagged automatically by AI based on content
- Users can override tags manually

---

## 4. Phased Development Roadmap

### Phase 1 — MVP (Minimum Viable Product)
**Goal:** Core working app that can be demoed at the competition.
**Timeline estimate:** 2–3 weeks

Features to build:
- [ ] Project creation and document upload (PDF, DOCX, TXT)
- [ ] PDF viewer with PDF.js
- [ ] AI chat Q&A with citations (Gemini API)
- [ ] Basic RAG pipeline: chunk documents → embed → vector search → LLM answer
- [ ] Simple project dashboard (list of projects, document list per project)
- [ ] Responsive UI (works on desktop and tablet)

Tech decisions for Phase 1:
- Frontend: React + Tailwind CSS
- Backend: Next.js full-stack
- Vector DB: Supabase with pgvector (free tier)
- AI: gemini-2.5-flash
- PDF rendering: PDF.js (CDN)
- Hosting: Vercel (free tier)

### Phase 2 — Core Feature Completion
**Goal:** Full feature set minus advanced outputs.
**Timeline estimate:** 2–3 weeks after Phase 1

Features to build:
- [ ] Knowledge graph generation and visualization (D3.js)
- [ ] Document comparison mode (diff view)
- [ ] XLSX and CSV upload + table preview
- [ ] Discipline tagging (auto + manual)
- [ ] Text selection → "Ask about this" flow
- [ ] Chat history saved per project (localStorage or Supabase)
- [ ] Bilingual support: English + Bengali UI strings

### Phase 3 — Output and Polish
**Goal:** Professional-grade outputs and UX polish.
**Timeline estimate:** 2 weeks after Phase 2

Features to build:
- [ ] Report and checklist generator with editable output
- [ ] PDF and DOCX export of generated reports
- [ ] Smart highlights and annotations with export
- [ ] Project sharing (read-only link)
- [ ] Dark mode
- [ ] Loading skeletons and error states
- [ ] Mobile optimization (PWA-ready)

### Phase 4 — Future / Post-Competition
Features for later: not will be implemented now
- [ ] User authentication (Supabase Auth ). 
- [ ] DWG/DXF drawing viewer (basic)
- [ ] Voice input for chat (Web Speech API)
- [ ] Offline mode with service worker
- [ ] Team collaboration (multiple users per project)
- [ ] Custom AI prompt templates per discipline
- [ ] Integration with Google Drive and OneDrive for document import

---

## 5. Technical Architecture

### Frontend
- **Framework:** React 18 (Next.js)
- **Styling:** Tailwind CSS
- **PDF viewer:** PDF.js
- **Graph visualization:** D3.js or Cytoscape.js
- **File handling:** react-dropzone
- **State management:** Zustand (lightweight, simple)
- **Routing:**  Next.js App Router
- **Export:** jsPDF (PDF), docx.js (DOCX)

### Backend
- **Runtime:** Node.js
- **Framework:** Next.js API routes
- **File parsing:**
  - PDF: pdf-parse or pdfplumber (Python microservice option)
  - DOCX: mammoth.js
  - XLSX: SheetJS (xlsx)
- **Text chunking:** Split documents into 500-token chunks with 50-token overlap
- **Embeddings:** gemini ai
- **Vector store:** Supabase with pgvector
- **LLM:**  Gemini 2.5 Flash 

### RAG Pipeline (how chat Q&A works)
1. User uploads document
2. Backend extracts text, splits into chunks, generates embeddings
3. Embeddings stored in vector DB with metadata (doc name, page, chunk index)
4. User asks a question
5. Question is embedded and top-K similar chunks retrieved
6. Chunks + question sent to Claude with system prompt
7. Claude answers with inline citations pointing to source chunks
8. Frontend renders answer with clickable citation links

### Database (Supabase — free tier)
Tables needed:
- `projects` — id, name, created_at, user_id
- `documents` — id, project_id, filename, file_type, discipline_tag, uploaded_at
- `chunks` — id, document_id, page_number, chunk_text, embedding (vector)
- `chat_messages` — id, project_id, role (user/assistant), content, citations, created_at
- `annotations` — id, document_id, page, selected_text, note, color, created_at
- `generated_outputs` — id, project_id, output_type, content, created_at

### Hosting
- **Frontend:** Vercel (free tier, auto-deploy from GitHub)
- **Backend:** Vercel serverless functions or Railway.app (free tier)
- **File storage:** Supabase Storage (free 1GB) or Cloudflare R2

---

## 6. Folder Structure (Claude Code Project)

```
engineering-assistant/
├── public/
│   └── favicon.ico
├── src/
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Sidebar.jsx
│   │   │   ├── Header.jsx
│   │   │   └── Layout.jsx
│   │   ├── uploader/
│   │   │   └── DropZone.jsx
│   │   ├── viewer/
│   │   │   ├── PDFViewer.jsx
│   │   │   ├── DocxViewer.jsx
│   │   │   └── ExcelViewer.jsx
│   │   ├── chat/
│   │   │   ├── ChatPanel.jsx
│   │   │   ├── ChatMessage.jsx
│   │   │   └── CitationLink.jsx
│   │   ├── graph/
│   │   │   └── KnowledgeGraph.jsx
│   │   ├── compare/
│   │   │   └── DiffViewer.jsx
│   │   ├── report/
│   │   │   └── ReportBuilder.jsx
│   │   └── common/
│   │       ├── Button.jsx
│   │       ├── Badge.jsx
│   │       └── Modal.jsx
│   ├── pages/
│   │   ├── Dashboard.jsx       ← project list
│   │   ├── Project.jsx         ← main workspace
│   │   ├── Compare.jsx         ← diff view
│   │   └── Report.jsx          ← report builder
│   ├── hooks/
│   │   ├── useChat.js
│   │   ├── useDocuments.js
│   │   └── useProject.js
│   ├── lib/
│   │   ├── api.js              ← Anthropic API calls
│   │   ├── supabase.js         ← DB client
│   │   ├── chunker.js          ← text chunking logic
│   │   └── embeddings.js       ← vector search helpers
│   ├── store/
│   │   └── useAppStore.js      ← Zustand global state
│   └── App.jsx
├── api/                        ← serverless backend functions
│   ├── upload.js               ← parse and chunk document
│   ├── chat.js                 ← RAG query + LLM response
│   ├── graph.js                ← entity extraction
│   ├── compare.js              ← document diff
│   └── report.js               ← output generation
├── .env.local                  ← API keys (never commit)
├── package.json
├── tailwind.config.js
└── vite.config.js
```

---

## 7. System Prompts (AI Instructions)

### Chat Q&A System Prompt
```
You are an expert engineering assistant helping engineers understand technical documents.
You are given document chunks retrieved from the user's uploaded files. 
Answer the user's question using ONLY the provided context.
For every fact you state, include a citation in this format: [[Document Name, Page X]].
If the answer is not in the documents, say "This information was not found in the uploaded documents."
Be precise with numbers, units, and technical values. Do not guess.
Respond in the same language the user asks in (English or Bengali).
```

### Report Generator System Prompt
```
You are a technical documentation expert for engineering projects.
Based on the document content provided, generate a [REPORT_TYPE] in structured format.
Use clear headings, numbered lists for sequential steps, and tables for specifications.
Every item in the checklist must be traceable to a specific document section.
Output in clean Markdown format.
```

### Knowledge Graph System Prompt
```
You are an entity extraction specialist for engineering documents.
From the text provided, extract all key entities and their relationships.
Return ONLY a JSON object with this structure:
{
  "nodes": [{"id": "1", "label": "Entity Name", "type": "Equipment|Spec|Standard|Location|Value"}],
  "edges": [{"source": "1", "target": "2", "relation": "has_spec|located_in|references|rated_at"}]
}
No preamble. No explanation. Only valid JSON.
```

---

## 8. Environment Variables

Create a `.env.local` file in the project root:

```
GEMINI_API_KEY=your_key_here
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

Never commit this file to GitHub. Add `.env.local` to `.gitignore`.

---

## 9. UI Screens / Pages

### Screen 1 — Dashboard (Home)
- List of all user's projects (card grid)
- "New Project" button → opens modal to name the project and select discipline
- Each project card shows: project name, document count, last updated date, discipline badge

### Screen 2 — Project Workspace (main screen)
Split into three panels:
- **Left panel:** Document list, upload button, discipline filter tabs
- **Center panel:** Document viewer (PDF/DOCX/Excel)
- **Right panel:** Chat Q&A interface with conversation history

Top toolbar: Knowledge Graph | Compare | Report Builder | Annotations | Share

### Screen 3 — Knowledge Graph View
- Full-screen interactive graph
- Sidebar with node filter (Equipment / Specs / Standards / Locations)
- Click node → shows excerpt from document where it appears
- "Ask about [node]" button → sends question to chat

### Screen 4 — Compare View
- Two-column layout: Document A (left) and Document B (right)
- Synchronized scroll
- AI-generated diff summary shown above
- Changed sections highlighted in yellow (additions in green, deletions in red)

### Screen 5 — Report Builder
- Select output type from dropdown (Commissioning Checklist, Equipment Schedule, etc.)
- Click "Generate" → AI produces structured output
- Inline editing of generated content
- Export buttons: PDF, DOCX

---

## 10. Competition Demo Script

When presenting at the competition, follow this flow:

1. Open the app and create a new project: "Chiller Plant Commissioning — Block A"
2. Upload two documents: a chiller datasheet PDF and a BMS spec DOCX
3. Show the PDF viewer — navigate pages, select text
4. Ask in chat: "What is the rated cooling capacity of the chiller?"
   → AI answers with page citation, you click it and the viewer jumps to that page
5. Ask: "What BACnet points are required for chiller integration?"
   → AI extracts the list from the BMS spec with source reference
6. Click "Generate Graph" — show the knowledge graph of all entities
7. Click "Report" → generate a commissioning checklist from the spec
8. Show the compare mode: upload Revision 0 and Revision 1 of the same spec
   → AI shows what changed
9. Export the checklist as PDF

Total demo time: approximately 5–7 minutes.

---

## 11. What Makes This Stand Out (Competition Angle)

- **Real problem, real user:** You are the target user. You have personally needed this tool on real engineering projects.
- **Domain-specific:** Not a generic chatbot. It understands engineering terminology, BACnet, HVAC, and commissioning workflows.
- **Comparison mode:** NotebookLM does not have document diff. This is a unique feature.
- **Bilingual:** English and Bengali support — broadens the user base significantly.
- **Multi-format:** Not just PDFs. Handles DOCX, Excel point schedules, and CSV — real engineering file formats.
- **Citation-grounded:** Every AI answer cites its source. Engineers cannot trust AI that makes things up. This solves that trust problem.
- **Discipline-aware:** Other document AI tools treat all content the same. This one understands engineering disciplines.

---

## 12. Known Risks and Mitigations

| Risk | Mitigation |
|---|---|
| AI hallucinates technical values | RAG grounding + "not found" fallback prompt |
| Large PDFs slow to process | Chunk in background, show progress bar |
| API cost at demo scale | Use Claude Haiku for embeddings, Sonnet only for chat |
| DWG files not supported | Clearly state in UI: "DWG coming soon" |
| Supabase free tier limits | Cache embeddings, do not re-embed same doc twice |
| No auth in Phase 1 | Store project data in localStorage for MVP demo |

