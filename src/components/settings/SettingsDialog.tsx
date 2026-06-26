'use client'

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { Loader2, Settings2, ExternalLink, Eye, EyeOff, ShieldCheck, Trash2 } from 'lucide-react'
import {
  loadAISettings,
  saveAISettings,
  clearAISettings,
  type AIProvider,
  type AISettings,
} from '@/lib/client-settings'

type Provider = AIProvider

const PROVIDERS: { value: Provider; label: string; helpUrl: string; defaultModel: string; defaultBaseUrl?: string; baseUrlLabel?: string }[] = [
  {
    value: 'gemini',
    label: 'Google Gemini (default)',
    helpUrl: 'https://aistudio.google.com/apikey',
    defaultModel: 'gemini-2.5-flash',
  },
  {
    value: 'openai',
    label: 'OpenAI-compatible (OpenAI, Groq, OpenRouter, Together, Mistral, Ollama)',
    helpUrl: 'https://platform.openai.com/api-keys',
    defaultModel: 'gpt-4o-mini',
    defaultBaseUrl: 'https://api.openai.com/v1',
    baseUrlLabel: 'Base URL',
  },
  {
    value: 'anthropic',
    label: 'Anthropic Claude',
    helpUrl: 'https://console.anthropic.com/settings/keys',
    defaultModel: 'claude-3-5-sonnet-latest',
  },
]

interface SettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const [provider, setProvider] = useState<Provider>('gemini')
  const [model, setModel] = useState('gemini-2.5-flash')
  const [baseUrl, setBaseUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [hasStored, setHasStored] = useState(false)
  const [showKey, setShowKey] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const { toast } = useToast()

  // Load settings from browser localStorage when the dialog opens.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    const load = () => {
      setLoading(true)
      const s = loadAISettings()
      if (cancelled) return
      if (s) {
        setProvider(s.provider)
        setModel(s.model)
        setBaseUrl(s.baseUrl || '')
        setApiKey(s.apiKey)
        setHasStored(true)
      } else {
        setProvider('gemini')
        setModel('gemini-2.5-flash')
        setBaseUrl('')
        setApiKey('')
        setHasStored(false)
      }
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [open])

  const handleProviderChange = (p: Provider) => {
    const def = PROVIDERS.find((x) => x.value === p)
    setProvider(p)
    setModel(def?.defaultModel || '')
    setBaseUrl(def?.defaultBaseUrl || '')
  }

  const handleSave = async () => {
    if (!apiKey.trim()) {
      toast({ title: 'API key required', description: 'Paste your API key to save settings.', variant: 'destructive' })
      return
    }
    if (!model.trim()) {
      toast({ title: 'Model required', description: 'Enter a model name.', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      const settings: AISettings = {
        provider,
        model: model.trim(),
        apiKey: apiKey.trim(),
        baseUrl: baseUrl.trim() || undefined,
      }
      saveAISettings(settings)
      setHasStored(true)
      toast({ title: 'Saved', description: 'AI settings saved to your browser' })
      onOpenChange(false)
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to save settings', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = () => {
    clearAISettings()
    setHasStored(false)
    setApiKey('')
    setProvider('gemini')
    setModel('gemini-2.5-flash')
    setBaseUrl('')
    toast({ title: 'Deleted', description: 'AI settings removed from your browser' })
  }

  const selected = PROVIDERS.find((p) => p.value === provider)!

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="h-4 w-4" />
            AI Settings
          </DialogTitle>
          <DialogDescription>
            Use your own API key. By default, this app uses Google Gemini with the <code className="text-xs">gemini-2.5-flash</code> model.
          </DialogDescription>
        </DialogHeader>

        {/* Privacy notice — browser-only storage, not in app database */}
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-50 dark:bg-emerald-950/20 p-3 space-y-1.5">
          <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
            <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
            <span className="text-xs font-semibold">Browser-only storage</span>
          </div>
          <p className="text-[11px] text-emerald-800/90 dark:text-emerald-300/80 leading-relaxed">
            Your AI configuration (provider, model, base URL, and API key) is stored
            <strong> only in your browser</strong> — it is <strong>not saved in the app database</strong>.
            It stays until you manually delete it below.
          </p>
        </div>

        {loading ? (
          <div className="py-8 flex justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Provider</Label>
              <Select value={provider} onValueChange={(v) => handleProviderChange(v as Provider)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROVIDERS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                Get a key:
                <a href={selected.helpUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-emerald-600 hover:underline">
                  {selected.helpUrl.replace(/^https?:\/\//, '')}
                  <ExternalLink className="h-3 w-3" />
                </a>
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="ai-model">Model</Label>
              <Input
                id="ai-model"
                placeholder={selected.defaultModel}
                value={model}
                onChange={(e) => setModel(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">
                Default for this provider: <code className="text-xs">{selected.defaultModel}</code>
              </p>
            </div>

            {selected.baseUrlLabel && (
              <div className="space-y-2">
                <Label htmlFor="ai-baseurl">{selected.baseUrlLabel}</Label>
                <Input
                  id="ai-baseurl"
                  placeholder={selected.defaultBaseUrl}
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="ai-apikey">
                API Key {hasStored && <span className="text-[11px] text-emerald-600">(saved in browser)</span>}
              </Label>
              <div className="relative">
                <Input
                  id="ai-apikey"
                  type={showKey ? 'text' : 'password'}
                  placeholder="Paste your API key here"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  className="pr-9"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1 h-7 w-7"
                  onClick={() => setShowKey((s) => !s)}
                  tabIndex={-1}
                >
                  {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Stored only in this browser. Not saved in the app database.
              </p>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          {hasStored && (
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={saving || loading}
              className="gap-2 mr-auto"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving || loading}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || loading || !model.trim()} className="gap-2">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save Settings
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
