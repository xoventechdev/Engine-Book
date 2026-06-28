'use client'

import { useState } from 'react'
import { type Citation, type ToolCallLogEntry } from '@/store/useAppStore'
import { cn } from '@/lib/utils'
import ReactMarkdown from 'react-markdown'
import {
  User, Bot, BookOpen, Pin, Search, FileText, List,
  ChevronDown, Wrench,
} from 'lucide-react'

interface ChatMessageProps {
  id: string
  role: 'user' | 'assistant'
  content: string
  citations: Citation[] | null
  toolCalls?: ToolCallLogEntry[] | null
  onCitationClick?: (docName: string, page?: number) => void
  onPin?: (content: string) => void
}

const TOOL_ICONS: Record<string, typeof Search> = {
  list_documents: List,
  search_documents: Search,
  read_document: FileText,
}

const TOOL_LABELS: Record<string, string> = {
  list_documents: 'Listed documents',
  search_documents: 'Searched documents',
  read_document: 'Read document',
}

export function ChatMessage({
  role,
  content,
  citations,
  toolCalls,
  onCitationClick,
  onPin,
}: ChatMessageProps) {
  const isUser = role === 'user'
  const [showSteps, setShowSteps] = useState(false)

  const hasToolCalls = toolCalls && toolCalls.length > 0

  return (
    <div className={cn('flex gap-3 group', isUser ? 'flex-row-reverse' : '')}>
      <div
        className={cn(
          'h-7 w-7 rounded-full flex items-center justify-center shrink-0 mt-1',
          isUser ? 'bg-emerald-100 dark:bg-emerald-900/30' : 'bg-muted'
        )}
      >
        {isUser ? (
          <User className="h-4 w-4 text-emerald-700 dark:text-emerald-400" />
        ) : (
          <Bot className="h-4 w-4 text-muted-foreground" />
        )}
      </div>

      <div className={cn('flex-1 min-w-0 max-w-[85%]', isUser ? 'flex flex-col items-end' : '')}>
        {/* Agent tool calls (collapsible) */}
        {!isUser && hasToolCalls && (
          <div className="mb-1.5 w-full">
            <button
              type="button"
              onClick={() => setShowSteps(!showSteps)}
              className="inline-flex items-center gap-1.5 rounded-lg border bg-background px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:bg-accent transition-colors w-full justify-between"
            >
              <span className="inline-flex items-center gap-1.5">
                <Wrench className="h-3 w-3 text-violet-500" />
                Agent used {toolCalls.length} tool{toolCalls.length === 1 ? '' : 's'}
              </span>
              <ChevronDown className={cn('h-3 w-3 transition-transform', showSteps && 'rotate-180')} />
            </button>
            {showSteps && (
              <div className="mt-1 rounded-lg border bg-muted/40 p-2 space-y-1.5">
                {toolCalls.map((tc, i) => {
                  const Icon = TOOL_ICONS[tc.tool] || Wrench
                  const label = TOOL_LABELS[tc.tool] || tc.tool
                  const argSummary = tc.tool === 'search_documents'
                    ? `"${tc.args.query || ''}"`
                    : tc.tool === 'read_document'
                      ? `${tc.args.documentId ? `"${String(tc.args.documentId).slice(0, 12)}..."` : ''}`
                      : ''
                  return (
                    <div key={i} className="flex items-start gap-1.5 text-[10px]">
                      <span className="text-muted-foreground/60 font-mono shrink-0 mt-0.5">{i + 1}.</span>
                      <Icon className="h-3 w-3 text-violet-500 shrink-0 mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <span className="font-medium text-foreground">{label}</span>
                        {argSummary && <span className="text-muted-foreground"> {argSummary}</span>}
                        <p className="text-muted-foreground/70 mt-0.5 line-clamp-2">{tc.resultSummary}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        <div
          className={cn(
            'rounded-xl px-4 py-2.5 text-sm leading-relaxed',
            isUser
              ? 'bg-emerald-600 text-white rounded-br-sm'
              : 'bg-muted rounded-bl-sm'
          )}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap">{content}</p>
          ) : (
            <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-table:text-xs">
              <ReactMarkdown>{content}</ReactMarkdown>
            </div>
          )}
        </div>

        {/* Citations + Pin button */}
        {!isUser && (
          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
            {citations && citations.length > 0 && citations.map((citation, i) => (
              <button
                key={i}
                type="button"
                className="inline-flex items-center gap-1 rounded-full border bg-background text-[10px] px-2 py-0.5 cursor-pointer hover:bg-accent transition-colors"
                onClick={() => onCitationClick?.(citation.documentName, citation.page)}
              >
                <BookOpen className="h-2.5 w-2.5" />
                {citation.documentName}{citation.page ? `, p.${citation.page}` : ''}
              </button>
            ))}
            {onPin && (
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-full border bg-background text-[10px] px-2 py-0.5 cursor-pointer hover:bg-accent transition-colors opacity-0 group-hover:opacity-100 transition-opacity ml-auto"
                onClick={() => onPin(content)}
                title="Pin to Notes"
              >
                <Pin className="h-2.5 w-2.5" />
                Pin
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
