'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useAppStore, type ChatMessage as ChatMessageType, type Citation } from '@/store/useAppStore'
import { ChatMessage } from '@/components/chat/ChatMessage'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/hooks/use-toast'
import { Send, Trash2, MessageSquare, Loader2, Sparkles } from 'lucide-react'

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

  return (
    <div className="flex flex-col h-full bg-card border-l">
      {/* Header */}
      <div className="px-3 py-2.5 border-b flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-emerald-500" />
          <h3 className="text-sm font-semibold">AI Chat</h3>
        </div>
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