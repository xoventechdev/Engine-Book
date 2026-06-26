# Engine Book

**AI-Powered Engineering Document Assistant** — a NotebookLM-style web app for engineers to upload technical documents and interact with them using AI. Ask questions, extract data, compare revisions, generate reports, listen to audio overviews, and create study guides.

Built for BMS/HVAC/Electrical/Fire Alarm/MEP engineers, site commissioning engineers, MEP designers, and engineering students.

---

## Features

### Core

| Feature | Description |
|---------|-------------|
| **Document Upload & Viewer** | Drag-and-drop upload for PDF, DOCX, TXT, XLSX, CSV (max 25 MB). Built-in viewer with PDF iframe, DOCX HTML render, and spreadsheet table view. |
| **AI Chat Q&A** | Ask any question about your uploaded documents. AI answers with inline citations `[[Document Name, Page X]]`. Clicking a citation jumps to that page in the viewer. Conversation history saved per project. |
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

# App URL
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

Get your values from: **Supabase Dashboard → Project Settings → API**

### 3. Database Setup

Push the Prisma schema to your database:

```bash
npm run db:push
```

### 4. Row Level Security (Important!)

Run the RLS policies SQL in the Supabase SQL Editor to protect your data:

1. Open **Supabase Dashboard → SQL Editor**
2. Paste the contents of `supabase/rls_policies.sql`
3. Click **Run**

This ensures users can only access their own projects/documents via the public REST API.

### 5. Enable Email Auth

1. Open **Supabase Dashboard → Authentication → Providers**
2. Enable **Email**
3. (Optional) Toggle "Confirm email" on/off based on your preference

### 6. Run

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
│   ├── workspace/              # ProjectWorkspace, DocumentSidebar, WorkspaceToolbar
│   ├── graph/                  # KnowledgeGraphView
│   └── compare/                # CompareView
├── lib/
│   ├── ai.ts                   # Provider-agnostic AI dispatcher (Gemini/OpenAI/Anthropic)
│   ├── client-settings.ts      # Browser localStorage AI settings
│   ├── db.ts                   # Prisma client singleton
│   ├── document-text.ts        # Shared text extraction (chunks + PDF fallback)
│   ├── owner.ts                # Supabase auth + project ownership helpers
│   ├── pdf-parser.ts           # PDF text extraction via LLM
│   ├── supabase/               # Supabase browser + server clients
│   └── ...
├── store/
│   └── useAppStore.ts          # Zustand global state
└── proxy.ts                    # Next.js proxy (session refresh)

prisma/
└── schema.prisma               # Project, Document, DocumentChunk, ChatMessage, Note, etc.

supabase/
└── rls_policies.sql            # Row Level Security migration
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

### Chat Q&A Pipeline

1. User uploads documents → non-PDFs are parsed and chunked (500 chars, 50 overlap) → stored in `DocumentChunk` table
2. PDFs are stored raw on disk — sent directly to the LLM as inline files at chat time (Gemini/Anthropic support native PDF reading)
3. User asks a question → non-PDF chunks are keyword-searched for relevant context → PDFs are attached as files → LLM receives context + question + conversation history
4. LLM responds with Markdown + citations → citations are parsed and rendered as clickable badges → clicking jumps to the source page

### PDF Text Extraction (for Graph/Report/Study Guide)

Features that need raw text (graph, report, study guide, compare) use `collectProjectText()` which:
1. Reads existing `DocumentChunk` rows for each document
2. For PDFs with no chunks: sends the raw PDF to the LLM and asks it to extract all text → caches the result as chunks for future requests

### Multi-User Isolation

- Each user authenticates via Supabase Auth (email + password)
- The Supabase user UUID is stored as `Project.ownerId`
- All API routes verify ownership via `getOwnedProject()` before returning data
- Supabase RLS policies enforce the same isolation at the database level for REST API access

---

## License

Private project.
