/**
 * Client-side AI settings storage.
 *
 * The user's AI configuration (provider, model, base URL, API key) is stored
 * ONLY in the browser's localStorage — it is NEVER written to the app's
 * server-side database. It persists until the user manually deletes it.
 *
 * Types are duplicated here (instead of imported from ai.ts) so this module
 * stays fully client-side and never pulls server-only code (e.g. Prisma) into
 * the browser bundle.
 */

export type AIProvider = 'gemini' | 'openai' | 'anthropic';

export interface AISettings {
  provider: AIProvider;
  model: string;
  apiKey: string;
  baseUrl?: string;
}

const STORAGE_KEY = 'enginebook_ai_settings';

/** Load settings from localStorage. Returns null if absent. */
export function loadAISettings(): AISettings | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AISettings;
    return {
      provider: (parsed.provider as AIProvider) || 'gemini',
      model: parsed.model || '',
      apiKey: parsed.apiKey || '',
      baseUrl: parsed.baseUrl || undefined,
    };
  } catch {
    return null;
  }
}

/** Save settings to localStorage. */
export function saveAISettings(settings: AISettings): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    provider: settings.provider,
    model: settings.model,
    apiKey: settings.apiKey,
    baseUrl: settings.baseUrl,
  }));
}

/** Manually delete stored settings immediately. */
export function clearAISettings(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
}

export function hasAISettings(): boolean {
  return loadAISettings() !== null;
}
