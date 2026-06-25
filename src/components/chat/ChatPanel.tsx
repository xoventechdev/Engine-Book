'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useAppStore, type ChatMessage as ChatMessageType, type Citation } from '@/store/useAppStore'
import { ChatMessage } from '@/components/chat/ChatMessage'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { Send, Trash2, MessageSquare, Loader2, Sparkles, Bug } from 'lucide-react'

export function ChatPanel() {
  const {
    currentProject,
    chatMessages,
    setChatMessages,
    addChatMessage,
    isChatLoading,
    setChatLoading,
    disciplineFilter,
    documents,
  } = useAppStore()

  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { toast } = useToast()
  const [showDebug, setShowDebug] = useState(false)
  const [lastDebug, setLastDebug] = useState<Record<string, unknown> | null>(null)

  const projectId = currentProject?.id

  // Load chat history
  useEffect(() => {
    if (!projectId) return
    const loadHistory = async () => {
      try {
        const res = await fetch(`/api/chat?projectId=${projectId}`)
        if (res.ok) {
          const data = await res.json()
          setChatMessages(data)
        }
      } catch {
        // Silent fail for chat history
      }
    }
    loadHistory()
  }, [projectId, setChatMessages])

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [chatMessages, isChatLoading])

  const handleSend = useCallback(async () => {
    if (!input.trim() || !projectId || isChatLoading) return

    const message = input.trim()
    setInput('')

    // Add user message to UI
    addChatMessage({
      id: `temp-${Date.now()}`,
      projectId,
      role: 'user',
      content: message,
      citations: null,
      createdAt: new Date().toISOString(),
    })

    setChatLoading(true)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          message,
          disciplineFilter: disciplineFilter === 'All' ? null : disciplineFilter,
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to get response')
      }

      const data = await res.json()
      addChatMessage({
        id: data.id,
        projectId,
        role: 'assistant',
        content: data.content,
        citations: data.citations || null,
        createdAt: data.createdAt,
      })
      // Store debug info if available
      if (data.debug) {
        setLastDebug(data.debug)
        if (!data.hasContext) {
          setShowDebug(true)
        }
      }
    } catch (error) {
      toast({
        title: 'AI Error',
        description: error instanceof Error ? error.message : 'Failed to get AI response',
        variant: 'destructive',
      })
    } finally {
      setChatLoading(false)
    }
  }, [input, projectId, isChatLoading, disciplineFilter, addChatMessage, setChatLoading, toast])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleCitationClick = (_docName: string, _page?: number) => {
    // Could navigate to the document and page
    toast({ title: 'Citation', description: `Referenced: ${_docName}${_page ? `, Page ${_page}` : ''}` })
  }

  const handleClear = async () => {
    if (!projectId) return
    try {
      await fetch(`/api/chat?projectId=${projectId}`, { method: 'DELETE' })
      setChatMessages([])
      toast({ title: 'Cleared', description: 'Chat history cleared' })
    } catch {
      toast({ title: 'Error', description: 'Failed to clear chat', variant: 'destructive' })
    }
  }

  const hasDocuments = documents.length > 0

  // Fetch full diagnostics when debug panel is open
  const [debugData, setDebugData] = useState<Record<string, unknown> | null>(null)
  useEffect(() => {
    if (showDebug && projectId) {
      fetch(`/api/debug?projectId=${projectId}`)
        .then(r => r.json())
        .then(setDebugData)
        .catch(() => {})
    }
  }, [showDebug, projectId])

  return (
    <div className="flex flex-col h-full bg-card border-l">
      {/* Header */}
      <div className="px-3 py-2.5 border-b flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-emerald-500" />
          <h3 className="text-sm font-semibold">AI Chat</h3>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant={showDebug ? 'default' : 'ghost'}
            size="icon"
            className="h-7 w-7"
            onClick={() => setShowDebug(!showDebug)}
            title="Toggle debug panel"
          >
            <Bug className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={handleClear}
            title="Clear chat"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="p-4 space-y-4">
          {chatMessages.length === 0 && !isChatLoading && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-3">
                <MessageSquare className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-muted-foreground">Ask anything about your documents</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-[200px]">
                {hasDocuments
                  ? 'Upload documents and ask questions about them'
                  : 'Upload some documents first, then ask questions'}
              </p>
            </div>
          )}

          {chatMessages.map((msg) => (
            <ChatMessage
              key={msg.id}
              id={msg.id}
              role={msg.role}
              content={msg.content}
              citations={msg.citations}
              onCitationClick={handleCitationClick}
            />
          ))}

          {isChatLoading && (
            <div className="flex gap-3">
              <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center shrink-0">
                <Bot className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="bg-muted rounded-xl rounded-bl-sm px-4 py-3">
                <div className="flex gap-1.5">
                  <span className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Debug Panel */}
      {showDebug && (
        <div className="border-t bg-muted/30 p-3 max-h-52 overflow-y-auto shrink-0">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Debug Info</span>
            <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => setShowDebug(false)}>
              <span className="text-xs">✕</span>
            </Button>
          </div>
          {lastDebug && (
            <div className="space-y-1.5 text-[11px] font-mono">
              <div className="flex gap-2">
                <span className="text-muted-foreground w-28 shrink-0">Documents:</span>
                <span className={lastDebug.documentCount === 0 ? 'text-destructive' : 'text-foreground'}>{String(lastDebug.documentCount)}</span>
              </div>
              <div className="flex gap-2">
                <span className="text-muted-foreground w-28 shrink-0">Chunks in DB:</span>
                <span className={Number(lastDebug.totalChunksInDb) === 0 ? 'text-destructive' : 'text-foreground'}>{String(lastDebug.totalChunksInDb)}</span>
              </div>
              <div className="flex gap-2">
                <span className="text-muted-foreground w-28 shrink-0">Search Results:</span>
                <span className={Number(lastDebug.searchResultsCount) === 0 ? 'text-destructive' : 'text-emerald-600'}>{String(lastDebug.searchResultsCount)}</span>
              </div>
              <div className="flex gap-2">
                <span className="text-muted-foreground w-28 shrink-0">Context Length:</span>
                <span>{String(lastDebug.contextLength)} chars</span>
              </div>
              {Boolean(lastDebug.rechunkedDocs) && (lastDebug.rechunkedDocs as string[]).length > 0 && (
                <div className="flex gap-2">
                  <span className="text-muted-foreground w-28 shrink-0">Re-chunked:</span>
                  <span className="text-amber-600">{(lastDebug.rechunkedDocs as string[]).join(', ')}</span>
                </div>
              )}
              {Array.isArray(lastDebug.chunksPerDoc) && (
                <div className="mt-1.5 pt-1.5 border-t">
                  <span className="text-muted-foreground">Chunks per doc:</span>
                  <div className="mt-1 space-y-0.5">
                    {(lastDebug.chunksPerDoc as { filename: string; chunkCount: number }[]).map(d => (
                      <div key={d.filename} className="flex gap-2">
                        <span className="truncate flex-1">{d.filename}</span>
                        <span className={d.chunkCount === 0 ? 'text-destructive' : 'text-emerald-600'}>{d.chunkCount}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          {debugData && Boolean(debugData.documents) && Array.isArray(debugData.documents) && (
            <div className="mt-2 pt-2 border-t">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Full Diagnostics</span>
              <div className="mt-1.5 space-y-1.5 text-[11px] font-mono">
                {(debugData.documents as { filename: string; fileType: string; fileExists: boolean; chunkCount: number; chunksPreview?: { preview?: string }[] }[]).map(d => (
                  <div key={d.filename} className="rounded bg-background p-1.5 border">
                    <div className="flex items-center gap-1.5">
                      <span className={d.fileExists ? 'text-emerald-500' : 'text-destructive'}>{d.fileExists ? '●' : '○'}</span>
                      <span className="truncate font-medium">{d.filename}</span>
                      <span className="text-muted-foreground">({d.fileType})</span>
                    </div>
                    <div className="flex gap-3 mt-0.5 text-muted-foreground">
                      <span>chunks: {d.chunkCount}</span>
                      {d.chunksPreview?.[0]?.preview && (
                        <span className="truncate">text: &quot;{d.chunksPreview[0].preview.slice(0, 80)}&quot;</span>
                      )}
                    </div>
                  </div>
                ))}
                {debugData.pdfTests && Object.keys(debugData.pdfTests as Record<string, unknown>).length > 0 && (
                  <div className="mt-1.5">
                    <span className="text-muted-foreground font-semibold">PDF extraction test:</span>
                    <pre className="mt-1 text-[10px] bg-background p-1.5 rounded border overflow-x-auto max-h-24">
                      {JSON.stringify(debugData.pdfTests, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Input */}
      <div className="p-3 border-t shrink-0">
        <div className="flex gap-2 items-end">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={hasDocuments ? 'Ask about your documents...' : 'Upload documents to start...'}
            disabled={isChatLoading}
            rows={1}
            className="min-h-[40px] max-h-[120px] resize-none text-sm"
          />
          <Button
            size="icon"
            onClick={handleSend}
            disabled={!input.trim() || isChatLoading}
            className="h-10 w-10 shrink-0"
          >
            {isChatLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground mt-1.5 text-center">
          AI answers are based on your uploaded documents. Always verify critical values.
        </p>
      </div>
    </div>
  )
}

function Bot({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 8V4H8" /><rect width="16" height="12" x="4" y="8" rx="2" />
      <path d="M2 14h2" /><path d="M20 14h2" /><path d="M15 13v2" /><path d="M9 13v2" />
    </svg>
  )
}