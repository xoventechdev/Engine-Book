'use client'

import { type Citation } from '@/store/useAppStore'
import { cn } from '@/lib/utils'
import ReactMarkdown from 'react-markdown'
import { User, Bot, BookOpen, Pin } from 'lucide-react'

interface ChatMessageProps {
  id: string
  role: 'user' | 'assistant'
  content: string
  citations: Citation[] | null
  onCitationClick?: (docName: string, page?: number) => void
  onPin?: (content: string) => void
}

export function ChatMessage({ role, content, citations, onCitationClick, onPin }: ChatMessageProps) {
  const isUser = role === 'user'

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
