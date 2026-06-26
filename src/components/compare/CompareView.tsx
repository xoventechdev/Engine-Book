'use client'

import { useState } from 'react'
import { useAppStore } from '@/store/useAppStore'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'
import { ArrowLeft, GitCompare, Loader2, FileText } from 'lucide-react'
import { loadAISettings } from '@/lib/client-settings'

interface CompareResult {
  documentA: { id: string; filename: string }
  documentB: { id: string; filename: string }
  aiComparison: {
    summary: string
    changes: { type: string; section: string; detail: string }[]
  }
  textDiff: { type: string; value: string }[]
}

export function CompareView() {
  const { documents, setViewMode } = useAppStore()
  const [docAId, setDocAId] = useState<string>('')
  const [docBId, setDocBId] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<CompareResult | null>(null)
  const { toast } = useToast()

  const handleCompare = async () => {
    if (!docAId || !docBId) {
      toast({ title: 'Error', description: 'Select two documents to compare', variant: 'destructive' })
      return
    }
    if (docAId === docBId) {
      toast({ title: 'Error', description: 'Select two different documents', variant: 'destructive' })
      return
    }

    setLoading(true)
    try {
      const aiSettings = loadAISettings()
      const res = await fetch('/api/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentAId: docAId,
          documentBId: docBId,
          ...(aiSettings ? { settings: aiSettings } : {}),
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        if (err.needsSettings) {
          toast({ title: 'AI Settings needed', description: 'Add your API key in Settings first.', variant: 'destructive' })
        }
        throw new Error(err.error || 'Failed to compare')
      }

      const data = await res.json()
      setResult(data)
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to compare documents',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <header className="h-12 border-b bg-card/80 backdrop-blur-sm flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setViewMode('workspace')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2">
            <GitCompare className="h-4 w-4 text-emerald-500" />
            <h2 className="text-sm font-semibold">Compare Documents</h2>
          </div>
        </div>
      </header>

      {/* Controls */}
      <div className="px-4 py-3 border-b bg-card shrink-0">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[180px]">
            <Label className="text-xs font-medium text-muted-foreground mb-1 block">Document A</Label>
            <Select value={docAId} onValueChange={setDocAId}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Select first document" />
              </SelectTrigger>
              <SelectContent>
                {documents.map((d) => (
                  <SelectItem key={d.id} value={d.id}>{d.filename}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1 min-w-[180px]">
            <Label className="text-xs font-medium text-muted-foreground mb-1 block">Document B</Label>
            <Select value={docBId} onValueChange={setDocBId}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Select second document" />
              </SelectTrigger>
              <SelectContent>
                {documents.map((d) => (
                  <SelectItem key={d.id} value={d.id}>{d.filename}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={handleCompare}
            disabled={loading || !docAId || !docBId}
            className="gap-2"
            size="sm"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <GitCompare className="h-4 w-4" />}
            Compare
          </Button>
        </div>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-hidden">
        {loading && (
          <div className="h-full flex items-center justify-center">
            <div className="text-center space-y-3">
              <Loader2 className="h-8 w-8 animate-spin text-emerald-500 mx-auto" />
              <p className="text-sm text-muted-foreground">Comparing documents...</p>
            </div>
          </div>
        )}

        {!loading && !result && (
          <div className="h-full flex items-center justify-center">
            <div className="text-center space-y-4 max-w-sm">
              <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mx-auto">
                <GitCompare className="h-8 w-8 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium">Select Two Documents</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Choose two documents to compare and identify differences
                </p>
              </div>
            </div>
          </div>
        )}

        {!loading && result && (
          <ScrollArea className="h-full">
            <div className="max-w-5xl mx-auto p-6 space-y-6">
              {/* AI Summary */}
              <div className="bg-card border rounded-lg p-5 space-y-4">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <FileText className="h-4 w-4 text-emerald-500" />
                  AI Comparison Summary
                </h3>
                <p className="text-sm text-muted-foreground">{result.aiComparison?.summary || 'No summary available.'}</p>

                {result.aiComparison?.changes && result.aiComparison.changes.length > 0 && (
                  <div className="space-y-2 mt-3">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Changes</h4>
                    {result.aiComparison.changes.map((change, i) => (
                      <div key={i} className="flex items-start gap-2 text-sm">
                        <Badge
                          variant="outline"
                          className={`text-[10px] mt-0.5 shrink-0 ${
                            change.type === 'added'
                              ? 'border-emerald-500 text-emerald-600 bg-emerald-50 dark:bg-emerald-950/20'
                              : change.type === 'removed'
                              ? 'border-red-500 text-red-600 bg-red-50 dark:bg-red-950/20'
                              : 'border-amber-500 text-amber-600 bg-amber-50 dark:bg-amber-950/20'
                          }`}
                        >
                          {change.type}
                        </Badge>
                        <div>
                          <span className="font-medium">{change.section}</span>
                          <span className="text-muted-foreground"> — {change.detail}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Text Diff */}
              <div className="bg-card border rounded-lg p-5">
                <h3 className="text-sm font-semibold mb-3">Text Differences</h3>
                <div className="text-sm font-mono leading-relaxed">
                  {result.textDiff.map((part, i) => (
                    <span
                      key={i}
                      className={
                        part.type === 'added'
                          ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-300'
                          : part.type === 'removed'
                          ? 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300 line-through'
                          : ''
                      }
                    >
                      {part.value}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  )
}