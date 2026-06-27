'use client'

import { useEffect, useState, useCallback } from 'react'
import { useAppStore } from '@/store/useAppStore'
import { Button } from '@/components/ui/button'
import { loadAISettings } from '@/lib/client-settings'
import { useToast } from '@/hooks/use-toast'
import {
  Sparkles, Loader2, ChevronDown, ChevronRight,
  Lightbulb, FileSearch, Link2, HelpCircle, RefreshCw,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface Insights {
  summary: string
  keyTopics: string[]
  documentOverview: { filename: string; summary: string }[]
  connections: { documents: string[]; description: string }[]
  suggestedQuestions: string[]
}

export function InsightsPanel() {
  const { currentProject, documents, setPendingChatInput } = useAppStore()
  const [insights, setInsights] = useState<Insights | null>(null)
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState(true)
  const [hasLoaded, setHasLoaded] = useState(false)
  const { toast } = useToast()

  const projectId = currentProject?.id
  const docCount = documents.length

  const generateInsights = useCallback(async () => {
    if (!projectId || docCount === 0) return
    setLoading(true)
    try {
      const aiSettings = loadAISettings()
      const res = await fetch('/api/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          ...(aiSettings ? { settings: aiSettings } : {}),
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        if (err.needsSettings) {
          toast({ title: 'AI Settings needed', description: 'Configure your AI provider in Settings to generate insights.' })
          return
        }
        throw new Error(err.error || 'Failed to generate insights')
      }
      const data = await res.json()
      setInsights(data)
      setExpanded(true)
    } catch (err) {
      toast({
        title: 'Insights failed',
        description: err instanceof Error ? err.message : 'Failed to generate insights',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }, [projectId, docCount, toast])

  // Auto-generate insights when documents first appear (once per project)
  useEffect(() => {
    if (projectId && docCount > 0 && !hasLoaded && !loading) {
      setHasLoaded(true)
      generateInsights()
    }
    // Reset when project changes
    if (projectId && !hasLoaded) {
      setInsights(null)
    }
  }, [projectId, docCount, hasLoaded, loading, generateInsights])

  // Reset state when project changes
  useEffect(() => {
    setHasLoaded(false)
    setInsights(null)
  }, [projectId])

  // Don't render if no documents
  if (docCount === 0) return null

  const handleQuestionClick = (question: string) => {
    setPendingChatInput(question)
  }

  return (
    <div className="border-b bg-gradient-to-br from-violet-50/50 to-blue-50/50 dark:from-violet-950/20 dark:to-blue-950/20">
      {/* Header */}
      <div className="px-3 py-2 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1.5 text-xs font-semibold text-violet-700 dark:text-violet-300"
        >
          {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          <Sparkles className="h-3.5 w-3.5" />
          AI Insights
        </button>
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5"
          onClick={generateInsights}
          disabled={loading}
          title="Regenerate insights"
        >
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
        </Button>
      </div>

      {/* Content */}
      {expanded && (
        <div className="px-3 pb-2.5 space-y-2.5">
          {loading && !insights ? (
            <div className="flex items-center gap-2 py-3">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-500" />
              <span className="text-[11px] text-muted-foreground">Analyzing documents...</span>
            </div>
          ) : insights ? (
            <>
              {/* Summary */}
              {insights.summary && (
                <div className="space-y-1">
                  <div className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                    <Lightbulb className="h-2.5 w-2.5" />
                    Summary
                  </div>
                  <p className="text-[11px] leading-relaxed text-foreground/80">{insights.summary}</p>
                </div>
              )}

              {/* Key Topics */}
              {insights.keyTopics.length > 0 && (
                <div className="space-y-1">
                  <div className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                    <FileSearch className="h-2.5 w-2.5" />
                    Key Topics
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {insights.keyTopics.map((topic, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center rounded-full bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 text-[10px] px-2 py-0.5 font-medium"
                      >
                        {topic}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Connections */}
              {insights.connections.length > 0 && (
                <div className="space-y-1">
                  <div className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                    <Link2 className="h-2.5 w-2.5" />
                    Connections
                  </div>
                  <div className="space-y-1">
                    {insights.connections.map((conn, i) => (
                      <div key={i} className="text-[10px] leading-relaxed">
                        <span className="font-medium text-foreground/70">{conn.documents.join(' ↔ ')}</span>
                        <p className="text-muted-foreground">{conn.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Suggested Questions */}
              {insights.suggestedQuestions.length > 0 && (
                <div className="space-y-1">
                  <div className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                    <HelpCircle className="h-2.5 w-2.5" />
                    Suggested Questions
                  </div>
                  <div className="space-y-1">
                    {insights.suggestedQuestions.map((q, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => handleQuestionClick(q)}
                        className={cn(
                          'w-full text-left text-[11px] leading-relaxed rounded-lg border bg-background/80 px-2 py-1.5',
                          'text-foreground/80 hover:bg-accent hover:border-violet-300 dark:hover:border-violet-700',
                          'transition-colors cursor-pointer'
                        )}
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : null}
        </div>
      )}
    </div>
  )
}
