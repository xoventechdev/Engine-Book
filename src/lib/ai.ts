/**
 * Provider-agnostic AI dispatcher.
 *
 * Supports three providers (configurable via the singleton `Setting` row):
 *   - "gemini"    : Google Generative AI (default). Native REST API,
 *                   supports inline PDFs/images via `inlineData`.
 *   - "openai"    : Any OpenAI-compatible endpoint (OpenAI, Groq, OpenRouter,
 *                   Together, Mistral, local Ollama, etc.). User supplies
 *                   baseUrl + apiKey + model. PDFs are not natively supported
 *                   via /chat/completions, so they fall back to text context.
 *   - "anthropic" : Anthropic Messages API. Supports PDF `document` blocks
 *                   (up to ~100 pages / 32 MB) and image blocks.
 *
 * The public surface is intentionally tiny and normalizes a single universal
 * message shape (string content OR array of content parts) that each provider
 * translator maps to its native format.
 */

export type AIProvider = 'gemini' | 'openai' | 'anthropic';

export interface AISettings {
  provider: AIProvider;
  model: string;
  apiKey: string;
  baseUrl?: string;
}

export const DEFAULT_SETTINGS: AISettings = {
  provider: 'gemini',
  model: 'gemini-2.5-flash',
  apiKey: '',
};

export const PROVIDER_DEFAULTS: Record<AIProvider, { model: string; baseUrl?: string; label: string; helpUrl: string }> = {
  gemini: {
    model: 'gemini-2.5-flash',
    label: 'Google Gemini',
    helpUrl: 'https://aistudio.google.com/apikey',
  },
  openai: {
    model: 'gpt-4o-mini',
    baseUrl: 'https://api.openai.com/v1',
    label: 'OpenAI-compatible',
    helpUrl: 'https://platform.openai.com/api-keys',
  },
  anthropic: {
    model: 'claude-3-5-sonnet-latest',
    label: 'Anthropic Claude',
    helpUrl: 'https://console.anthropic.com/settings/keys',
  },
};

/** Universal content part. Mirrors the OpenAI multimodal shape so existing
 *  call sites that already build these parts keep working. */
export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }
  | { type: 'file_url'; file_url: { url: string } };

export interface UniversalMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | ContentPart[];
}

export interface ChatOptions {
  /** Max output tokens (provider-specific default if omitted). */
  maxTokens?: number;
  /** Sampling temperature 0–1. */
  temperature?: number;
}

export interface AIFile {
  /** Filename — used by providers that need a name (Anthropic PDFs). */
  filename: string;
  /** MIME type, e.g. "application/pdf", "image/png". */
  mimeType: string;
  /** Raw file bytes. */
  data: Buffer;
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

/**
 * Returns default settings. AI configuration is stored ONLY in the browser
 * (localStorage) and sent per-request by the client. The server no longer
 * reads or writes AI settings to the database. When the client doesn't send
 * settings, this returns defaults with an empty apiKey — assertKey() will
 * then throw AIConfigError, and the route returns { needsSettings: true }
 * so the UI can prompt the user to open Settings.
 */
export async function getAISettings(): Promise<AISettings> {
  return { ...DEFAULT_SETTINGS };
}

export function hasConfiguredSettings(s: AISettings): boolean {
  return Boolean(s.apiKey && s.apiKey.trim());
}

/**
 * Parse AI settings supplied by the client (from browser localStorage) into a
 * validated AISettings object. Returns null if absent or invalid — callers
 * then fall back to the server-side getAISettings().
 */
export function parseAISettings(raw: unknown): AISettings | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const provider = r.provider as AIProvider;
  if (!provider || !['gemini', 'openai', 'anthropic'].includes(provider)) return null;
  const apiKey = typeof r.apiKey === 'string' ? r.apiKey : '';
  const model = typeof r.model === 'string' ? r.model : '';
  if (!apiKey.trim() || !model.trim()) return null;
  return {
    provider,
    model,
    apiKey,
    baseUrl: typeof r.baseUrl === 'string' && r.baseUrl.trim() ? r.baseUrl : undefined,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function assertKey(s: AISettings): void {
  if (!hasConfiguredSettings(s)) {
    throw new AIConfigError(
      'No AI provider configured. Open Settings and add your own API key to use AI features.'
    );
  }
}

/** Parse a `data:<mime>;base64,<...>` URL into its parts. */
function parseDataUrl(url: string): { mimeType: string; data: string } | null {
  const m = /^data:([^;]+);base64,(.*)$/.exec(url);
  if (!m) return null;
  return { mimeType: m[1], data: m[2] };
}

/** Convert a Buffer to a base64 string without Node Buffer issues. */
function toBase64(buf: Buffer): string {
  return buf.toString('base64');
}

// ---------------------------------------------------------------------------
// Public error type — UI/callers can detect this to prompt the user to
// open Settings instead of surfacing a raw 500.
// ---------------------------------------------------------------------------
export class AIConfigError extends Error {}
export class AICallError extends Error {
  status: number;
  body: string;
  constructor(message: string, status: number, body: string) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

// ===========================================================================
// 1) GEMINI — Google Generative Language API
// ===========================================================================

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';

function geminiRole(role: UniversalMessage['role']): 'user' | 'model' {
  return role === 'assistant' ? 'model' : 'user';
}

function toGeminiContent(content: string | ContentPart[]): Array<Record<string, unknown>> {
  const parts: Array<Record<string, unknown>> = [];
  if (typeof content === 'string') {
    parts.push({ text: content });
    return parts;
  }
  for (const part of content) {
    if (part.type === 'text') {
      parts.push({ text: part.text });
    } else if (part.type === 'image_url') {
      const du = parseDataUrl(part.image_url.url);
      if (du) parts.push({ inlineData: { mimeType: du.mimeType, data: du.data } });
    } else if (part.type === 'file_url') {
      const du = parseDataUrl(part.file_url.url);
      if (du) parts.push({ inlineData: { mimeType: du.mimeType, data: du.data } });
    }
  }
  return parts;
}

async function callGemini(
  messages: UniversalMessage[],
  files: AIFile[],
  opts: ChatOptions | undefined,
  s: AISettings
): Promise<string> {
  assertKey(s);

  const systemMsgs = messages.filter((m) => m.role === 'system');
  const turnMsgs = messages.filter((m) => m.role !== 'system');

  const contents = turnMsgs.map((m) => ({
    role: geminiRole(m.role),
    parts: toGeminiContent(m.content),
  }));

  // Append any extra files (e.g. raw PDFs not already embedded as file_url parts)
  // as additional inlineData items on the last user turn.
  if (files.length > 0) {
    const lastUser = [...contents].reverse().find((c) => c.role === 'user');
    const fileParts = files.map((f) => ({
      inlineData: { mimeType: f.mimeType, data: toBase64(f.data) },
    }));
    if (lastUser) {
      (lastUser.parts as Array<Record<string, unknown>>).push(...fileParts);
    } else {
      contents.push({ role: 'user', parts: fileParts });
    }
  }

  const body: Record<string, unknown> = {
    contents,
    generationConfig: {
      ...(opts?.temperature !== undefined ? { temperature: opts.temperature } : {}),
      ...(opts?.maxTokens !== undefined ? { maxOutputTokens: opts.maxTokens } : {}),
    },
  };
  if (systemMsgs.length > 0) {
    body.systemInstruction = {
      parts: systemMsgs.map((m) => ({ text: typeof m.content === 'string' ? m.content : '' })),
    };
  }

  const url = `${GEMINI_BASE}/models/${encodeURIComponent(s.model)}:generateContent`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': s.apiKey },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new AICallError(`Gemini API error ${res.status}`, res.status, text);
  }
  const json = await res.json();
  const out: string = json?.candidates?.[0]?.content?.parts
    ?.map((p: { text?: string }) => p.text || '')
    .join('') || '';
  return out;
}

// ===========================================================================
// 2) OPENAI-COMPATIBLE — /chat/completions
// ===========================================================================

function toOpenAIContent(content: string | ContentPart[]): Array<Record<string, unknown>> {
  if (typeof content === 'string') return [{ type: 'text', text: content }];
  const parts: Array<Record<string, unknown>> = [];
  for (const part of content) {
    if (part.type === 'text') {
      parts.push({ type: 'text', text: part.text });
    } else if (part.type === 'image_url') {
      parts.push({ type: 'image_url', image_url: part.image_url });
    }
    // file_url (PDFs) is not portable across OpenAI-compatible providers —
    // callers should extract text instead. We skip the part silently.
  }
  return parts;
}

async function callOpenAI(
  messages: UniversalMessage[],
  files: AIFile[],
  opts: ChatOptions | undefined,
  s: AISettings
): Promise<string> {
  assertKey(s);

  const base = (s.baseUrl || PROVIDER_DEFAULTS.openai.baseUrl || '').replace(/\/+$/, '');
  if (!base) throw new AIConfigError('OpenAI-compatible provider requires a baseUrl in Settings.');

  // OpenAI /chat/completions has no portable file slot. If raw files were
  // supplied, the caller is expected to have already embedded their text
  // into a message; we ignore the binary blobs here.
  void files;

  const body: Record<string, unknown> = {
    model: s.model,
    messages: messages.map((m) => ({
      role: m.role,
      content: toOpenAIContent(m.content),
    })),
    ...(opts?.temperature !== undefined ? { temperature: opts.temperature } : {}),
    ...(opts?.maxTokens !== undefined ? { max_tokens: opts.maxTokens } : {}),
  };

  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${s.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new AICallError(`OpenAI-compatible API error ${res.status}`, res.status, text);
  }
  const json = await res.json();
  return json?.choices?.[0]?.message?.content || '';
}

// ===========================================================================
// 3) ANTHROPIC — Messages API
// ===========================================================================

const ANTHROPIC_BASE = 'https://api.anthropic.com/v1';

function toAnthropicContent(
  content: string | ContentPart[],
  files: AIFile[] = []
): Array<Record<string, unknown>> {
  const parts: Array<Record<string, unknown>> = [];
  if (typeof content === 'string') {
    parts.push({ type: 'text', text: content });
  } else {
    for (const part of content) {
      if (part.type === 'text') {
        parts.push({ type: 'text', text: part.text });
      } else if (part.type === 'image_url') {
        const du = parseDataUrl(part.image_url.url);
        if (du) {
          parts.push({
            type: 'image',
            source: { type: 'base64', media_type: du.mimeType, data: du.data },
          });
        }
      }
      // file_url parts handled below via the files[] array.
    }
  }

  // Inline any raw files (PDFs) as document blocks.
  for (const f of files) {
    parts.push({
      type: 'document',
      source: { type: 'base64', media_type: f.mimeType, data: toBase64(f.data) },
    });
  }
  return parts;
}

async function callAnthropic(
  messages: UniversalMessage[],
  files: AIFile[],
  opts: ChatOptions | undefined,
  s: AISettings
): Promise<string> {
  assertKey(s);

  const systemMsgs = messages.filter((m) => m.role === 'system');
  const turnMsgs = messages.filter((m) => m.role !== 'system');

  // Anthropic requires alternating user/assistant turns; collapse consecutive
  // same-role messages by concatenating their content.
  const collapsed: Array<{ role: 'user' | 'assistant'; content: Array<Record<string, unknown>> }> = [];
  for (const m of turnMsgs) {
    const role = m.role === 'assistant' ? 'assistant' : 'user';
    const parts = toAnthropicContent(m.content, role === 'user' ? files : []);
    const last = collapsed[collapsed.length - 1];
    if (last && last.role === role) {
      last.content.push(...parts);
    } else {
      collapsed.push({ role, content: parts });
    }
  }

  // If only system messages were supplied (rare), still need at least one user turn.
  if (collapsed.length === 0) {
    collapsed.push({ role: 'user', content: toAnthropicContent('', files) });
  }

  const body: Record<string, unknown> = {
    model: s.model,
    max_tokens: opts?.maxTokens ?? 8192,
    messages: collapsed,
    ...(systemMsgs.length > 0
      ? { system: systemMsgs.map((m) => (typeof m.content === 'string' ? m.content : '')).join('\n\n') }
      : {}),
    ...(opts?.temperature !== undefined ? { temperature: opts.temperature } : {}),
  };

  const res = await fetch(`${ANTHROPIC_BASE}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': s.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new AICallError(`Anthropic API error ${res.status}`, res.status, text);
  }
  const json = await res.json();
  const out: string = Array.isArray(json?.content)
    ? json.content.map((b: { text?: string }) => b.text || '').join('')
    : '';
  return out;
}

// ===========================================================================
// Public entry points
// ===========================================================================

/** Text-only (or text-with-image_url) chat completion. */
export async function generateChat(
  messages: UniversalMessage[],
  opts?: ChatOptions,
  settings?: AISettings
): Promise<string> {
  const s = settings || (await getAISettings());
  switch (s.provider) {
    case 'gemini':
      return callGemini(messages, [], opts, s);
    case 'anthropic':
      return callAnthropic(messages, [], opts, s);
    case 'openai':
    default:
      return callOpenAI(messages, [], opts, s);
  }
}

/** Chat with raw file attachments (e.g. PDFs sent inline). Only Gemini and
 *  Anthropic support binary file blocks; OpenAI-compatible falls back to
 *  whatever text the caller embedded in messages. */
export async function generateChatWithFiles(
  messages: UniversalMessage[],
  files: AIFile[],
  opts?: ChatOptions,
  settings?: AISettings
): Promise<string> {
  const s = settings || (await getAISettings());
  switch (s.provider) {
    case 'gemini':
      return callGemini(messages, files, opts, s);
    case 'anthropic':
      return callAnthropic(messages, files, opts, s);
    case 'openai':
    default:
      // No portable file support — caller must have inlined file text.
      return callOpenAI(messages, files, opts, s);
  }
}

/** Vision completion for a single image + text prompt (used by pdf-parser to
 *  OCR a rendered page). Returns the assistant text. */
export async function generateVisionOCR(
  imagePngBase64: string,
  prompt: string,
  settings?: AISettings
): Promise<string> {
  const s = settings || (await getAISettings());
  const messages: UniversalMessage[] = [
    {
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        {
          type: 'image_url',
          image_url: { url: `data:image/png;base64,${imagePngBase64}` },
        },
      ],
    },
  ];
  return generateChat(messages, undefined, s);
}