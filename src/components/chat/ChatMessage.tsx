'use client'

import { useAppStore, type Citation } from '@/store/useAppStore'
import { cn } from '@/lib/utils'
import ReactMarkdown from 'react-markdown'
import { User, Bot, BookOpen } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

interface ChatMessageProps {
  id: string
  role: 'user' | 'assistant'
  content: string
  citations: Citation[] | null
  onCitationClick?: (docName: string, page?: number) => void
}

export function ChatMessage({ role, content, citations, onCitationClick }: ChatMessageProps) {
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
            <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-table:text-xs prose-pre:bg-background prose-pre:border prose-pre:rounded">
              <ReactMarkdown>{content}</ReactMarkdown>
            </div>
          )}
        </div>

        {/* Citations */}
        {citations && citations.length > 0 && !isUser && (
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {citations.map((citation, i) => (
              <Badge
                key={i}
                variant="outline"
                className="text-[10px] px-2 py-0 cursor-pointer hover:bg-accent transition-colors gap-1"
                onClick={() => onCitationClick?.(citation.documentName, citation.page)}
              >
                <BookOpen className="h-2.5 w-2.5" />
                {citation.documentName}{citation.page ? `, p.${citation.page}` : ''}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}