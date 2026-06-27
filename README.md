# Engine Book

**AI-Powered Engineering Document Assistant** — a NotebookLM-style web app for engineers to upload technical documents and interact with them using AI. Ask questions, extract data, compare revisions, generate reports, listen to audio overviews, and create study guides.

Built for BMS/HVAC/Electrical/Fire Alarm/MEP engineers, site commissioning engineers, MEP designers, and engineering students.

---

## Features

### Core

| Feature | Description |
|---------|-------------|
| **Multi-Agent AI Chat Q&A** | The chat uses a **3-agent collaborative pipeline**: **Researcher** (gathers information via tools) → **Fact-Checker** (verifies every citation against source documents) → **Synthesizer** (produces the final verified answer). Each agent's work is visible in the UI as collapsible "Research Steps". Answers include inline citations `[[Document Name, Page X]]` that jump to the source page. |
| **Proactive AI Insights** | When documents are uploaded, the AI **automatically generates** a project summary, key topics, cross-document connections, and 5 suggested questions — without the user asking anything. Clicking a suggested question sends it to the chat. |
| **Document Upload & Viewer** | Drag-and-drop upload for PDF, DOCX, TXT, XLSX, CSV (max 25 MB). Files stored in Supabase Storage. Built-in viewer with PDF iframe, DOCX HTML render, and spreadsheet table view. |
| **Knowledge Graph** | Auto-extract entities and relationships from documents. Interactive node graph (Cytoscape.js) with type filters (Equipment, Spec, Standard, Location, Value). |
| **Document Comparison** | Upload two versions of a document and AI highlights what changed. Side-by-side AI summary + word-level text diff. |
| **Report Builder** | Generate commissioning checklists, equipment schedules, handover reports, and data extraction tables from your documents. Editable output with copy/download. |

### NotebookLM-style Features

| Feature | Description |
|---------|-------------|
| **Audio Overview** | Generates a podcast-style audio summary where two AI hosts discuss your documents. Plays via browser SpeechSynthesis with a scrollable transcript that highlights the current line. |
| **Saved Notes** | Pin important AI answers to a per-project notes panel. Notes persist in the database and can be copied or deleted. |
| **Study Guide** | One-click generation of a structured study guide: executive summary, key terms with definitions, FAQ, and an interactive multiple-choice quiz with score tracking and explanations. |

### Security & Multi-User

| Feature | Description |
|---------|-------------|
| **Supabase Authentication** | Email + password login/signup with email confirmation and forgot-password flow. Each user's projects are private to their account. |
| **Row Level Security** | Supabase RLS policies ensure users can only access their own data via the public REST API. SQL migration included. |
| **Browser-Only AI Keys** | Your AI provider API key (Gemini/OpenAI/Anthropic) is stored **only in your browser's localStorage** — never in the app database. You can delete it anytime. |

### UI/UX

- Dark/light theme toggle
- Responsive three-panel workspace (sidebar / viewer / chat)
- Resizable panels
- Discipline filter (BMS, HVAC, Electrical, Fire Alarm, Structural, Civil, MEP, General)
- Markdown rendering with `@tailwindcss/typography`
- framer-motion animations
- Accessibility: keyboard-focusable citations, labeled form fields, ARIA-compliant upload zones

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Framework** | Next.js 16 (App Router, Webpack) |
| **Language** | TypeScript 5 |
| **Styling** | Tailwind CSS 4 + `@tailwindcss/typography` |
| **UI Components** | shadcn/ui (Radix primitives) |
| **State** | Zustand |
| **Database** | Supabase (PostgreSQL) via Prisma ORM |
| **Storage** | Supabase Storage (private `documents` bucket, RLS-scoped) |
| **Auth** | Supabase Auth (`@supabase/ssr`) |
| **AI Providers** | Google Gemini (default), OpenAI-compatible (OpenAI/Groq/OpenRouter/Ollama), Anthropic Claude |
| **Graph** | Cytoscape.js + react-cytoscapejs |
| **Animations** | framer-motion |
| **Icons** | lucide-react |

---

## Getting Started

### Prerequisites

- Node.js 18+
- A Supabase project (free tier works)
- An AI API key (Google Gemini is free and recommended)

### 1. Clone & Install

```bash
npm install
```

### 2. Environment Variables

Create a `.env` file in the project root:

```env
# Database (Supabase PostgreSQL)
# Pooled connection (port 6543) — for app runtime
DATABASE_URL="postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:6543/postgres?pgbouncer=true"
# Direct connection (port 5432) — for Prisma migrations
DIRECT_URL="postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres"

# Supabase Auth (safe to expose — protected by RLS)
NEXT_PUBLIC_SUPABASE_URL="https://[PROJECT_REF].supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="[YOUR_ANON_KEY]"

# Supabase Storage — service role key (server-only, NEVER expose publicly)
# Used by the API routes to upload/download document files. Bypasses Storage
# RLS the same way Prisma bypasses table RLS. Get it from:
# Supabase Dashboard → Settings → API → Project API keys → service_role
SUPABASE_SERVICE_ROLE_KEY="[YOUR_SERVICE_ROLE_KEY]"

# App URL
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

Get your values from: **Supabase Dashboard → Project Settings → API**

### 3. Database Setup

Push the Prisma schema to your database:

```bash
npm run db:push
```

### 4. Storage Setup (Required — files live in Supabase Storage)

Uploaded documents are stored in a private Supabase Storage bucket named
`documents` (not on the server filesystem — that doesn't work on Vercel).

1. Open **Supabase Dashboard → SQL Editor**
2. Paste the contents of `supabase/storage_setup.sql`
3. Click **Run**

This creates the `documents` bucket (25 MB limit, private) with optional
Row Level Security policies scoped to each user's projects.

### 5. Row Level Security (Important!)

Run the RLS policies SQL in the Supabase SQL Editor to protect your data:

1. Open **Supabase Dashboard → SQL Editor**
2. Paste the contents of `supabase/rls_policies.sql`
3. Click **Run**

This ensures users can only access their own projects/documents via the public REST API.

### 6. Enable Email Auth

1. Open **Supabase Dashboard → Authentication → Providers**
2. Enable **Email**
3. (Optional) Toggle "Confirm email" on/off based on your preference

### 7. Run

```bash
# Development
npm run dev

# Production build
npm run build
npm run start
```

Open [http://localhost:3000](http://localhost:3000)

---

## AI Provider Setup

AI settings are configured in the app UI (**Settings** gear icon) and stored only in your browser.

| Provider | Get API Key | Default Model |
|----------|------------|---------------|
| Google Gemini (default) | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) | `gemini-2.5-flash` |
| OpenAI-compatible | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) | `gpt-4o-mini` |
| Anthropic Claude | [console.anthropic.com](https://console.anthropic.com/settings/keys) | `claude-3-5-sonnet-latest` |

For OpenAI-compatible providers (Groq, OpenRouter, Together, Ollama, etc.), you can set a custom **Base URL** in Settings.

---

## Project Structure

```
src/
├── app/
│   ├── api/                    # API routes
│   │   ├── audio-overview/     # Podcast script generation
│   │   ├── chat/               # AI Q&A with citations
│   │   ├── compare/            # Document diff comparison
│   │   ├── debug/              # Dev-only diagnostics
│   │   ├── documents/          # Upload, list, delete, content
│   │   ├── graph/              # Knowledge graph extraction
│   │   ├── insights/           # Proactive AI insights (auto-generated on upload)
│   │   ├── notes/              # Saved/pinned notes CRUD
│   │   ├── projects/           # Project CRUD + ownership
│   │   ├── report/             # Report/checklist generation
│   │   └── study-guide/        # Study guide generation
│   ├── globals.css             # Tailwind v4 + typography + theme
│   ├── layout.tsx              # Root layout (AuthGate, ThemeProvider)
│   └── page.tsx                # View router (dashboard/workspace/...)
├── components/
│   ├── auth/                   # AuthGate, AuthDialog, UserMenu
│   ├── audio/                  # AudioOverviewDialog (podcast player)
│   ├── chat/                   # ChatPanel, ChatMessage
│   ├── dashboard/              # Dashboard, CreateProjectDialog, EditProjectDialog
│   ├── notes/                  # NotesPanel (pinned answers)
│   ├── report/                 # ReportBuilder
│   ├── settings/               # SettingsDialog (AI provider config)
│   ├── study/                  # StudyGuideDialog (quiz + FAQ)
│   ├── ui/                     # shadcn/ui primitives
│   ├── upload/                 # DropZone
│   ├── viewer/                 # DocumentViewer
│   ├── workspace/              # ProjectWorkspace, DocumentSidebar, WorkspaceToolbar, InsightsPanel
│   ├── graph/                  # KnowledgeGraphView
│   └── compare/                # CompareView
├── lib/
│   ├── ai.ts                   # Provider-agnostic AI dispatcher (Gemini/OpenAI/Anthropic) + tool-calling
│   ├── agent/                  # Agentic AI workflow (multi-agent + tool-calling)
│   │   ├── types.ts            #   Tool/agent/multi-agent type definitions
│   │   ├── tools.ts            #   Tool definitions + executors (list/search/read)
│   │   ├── loop.ts             #   Agent loop (plan→act→observe→reflect)
│   │   └── multi-agent.ts      #   3-agent pipeline (researcher→fact-checker→synthesizer)
│   ├── client-settings.ts      # Browser localStorage AI settings
│   ├── db.ts                   # Prisma client singleton
│   ├── document-text.ts        # Shared text extraction (chunks + PDF fallback)
│   ├── owner.ts                # Supabase auth + project ownership helpers
│   ├── pdf-parser.ts           # PDF text extraction via LLM
│   ├── storage.ts              # Supabase Storage client (upload/download/delete)
│   ├── supabase/               # Supabase browser + server clients
│   └── ...
├── store/
│   └── useAppStore.ts          # Zustand global state
└── proxy.ts                    # Next.js proxy (session refresh)

prisma/
└── schema.prisma               # Project, Document, DocumentChunk, ChatMessage, Note, etc.

supabase/
├── rls_policies.sql            # Row Level Security migration (tables)
└── storage_setup.sql           # Storage bucket + Storage RLS policies
```

---

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server (port 3000) |
| `npm run build` | Production build (webpack + standalone output) |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run db:push` | Push schema changes to database |
| `npm run db:generate` | Regenerate Prisma client |
| `npm run db:migrate` | Create + apply a migration |
| `npm run db:reset` | Reset database (destructive) |

---

## How It Works

### Multi-Agent Chat Workflow

The chat uses a **3-agent collaborative pipeline** with native tool-calling (function-calling) support across all three AI providers (Gemini, OpenAI, Anthropic). Each agent has a distinct role and the fact-checker ensures citation accuracy before the final answer is delivered.

**The pipeline:**

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│  Researcher │ ──▶ │ Fact-Checker │ ──▶ │  Synthesizer │ ──▶ Final Answer
│  (tools)    │     │  (tools)     │     │  (no tools)  │
└─────────────┘     └──────────────┘     └──────────────┘
```

1. **Researcher** — Uses tools (`list_documents`, `search_documents`, `read_document`) to gather information. Runs the agentic plan→act→observe→reflect loop (up to 10 iterations). Produces a draft answer with citations.
2. **Fact-Checker** — Receives the draft answer and uses tools to READ the cited documents and verify each claim. Produces a verification report: which citations are confirmed, which are not found, and any inaccuracies. (Up to 6 verification iterations.)
3. **Synthesizer** — Receives the draft + verification report and produces the final polished answer. Removes unverified claims, corrects inaccuracies, and ensures all citations are accurate.

Each agent's work is visible in the UI as a collapsible "Multi-agent pipeline" panel showing the 3 phases (Research → Fact-Check → Synthesize) with their tool calls.

**Agent tools:**
- `list_documents` — queries the database for available documents
- `search_documents` — keyword-searches across non-PDF document chunks
- `read_document` — downloads a document from Supabase Storage and extracts its text (PDFs use AI vision extraction)

**Provider-specific tool-calling:**
- **Gemini**: `functionDeclarations` + `functionCall` / `functionResponse` parts
- **OpenAI**: `tools` array with `function` type + `tool_calls` response + `tool` role messages
- **Anthropic**: `tools` with `input_schema` + `tool_use` / `tool_result` content blocks

### Proactive Insights

When documents are uploaded, the AI **automatically generates** (without being asked):
- **Project summary** — 2-3 sentence overview of what the documents cover collectively
- **Key topics** — 3-5 main technical topics extracted from the content
- **Cross-document connections** — how documents relate to each other
- **5 suggested questions** — specific, actionable questions the user can click to ask

The insights appear in the document sidebar and update when new documents are added. Clicking a suggested question sends it directly to the chat.

### PDF Text Extraction (for Graph/Report/Study Guide)

Features that need raw text (graph, report, study guide, compare) use `collectProjectText()` which:
1. Reads existing `DocumentChunk` rows for each document
2. For PDFs with no chunks: downloads the raw PDF from Supabase Storage and sends it to the LLM, asking it to extract all text → caches the result as chunks for future requests

### Multi-User Isolation

- Each user authenticates via Supabase Auth (email + password)
- The Supabase user UUID is stored as `Project.ownerId`
- All API routes verify ownership via `getOwnedProject()` before returning data
- Supabase RLS policies enforce the same isolation at the database level for REST API access

---

## License

Private project.
