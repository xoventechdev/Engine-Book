'use client'

import { useEffect, useState } from 'react'
import { useAppStore, type Note } from '@/store/useAppStore'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { useToast } from '@/hooks/use-toast'
import { Trash2, StickyNote, Copy } from 'lucide-react'

interface NotesPanelProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function NotesPanel({ open, onOpenChange }: NotesPanelProps) {
  const { currentProject, notes, setNotes, removeNote } = useAppStore()
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()

  const projectId = currentProject?.id

  useEffect(() => {
    if (!open || !projectId) return
    let cancelled = false
    const load = async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/notes?projectId=${projectId}`)
        if (res.ok) {
          const data = await res.json()
          if (!cancelled) setNotes(Array.isArray(data) ? data : [])
        }
      } catch {
        // silent
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [open, projectId, setNotes])

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/notes?id=${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete')
      removeNote(id)
      toast({ title: 'Deleted', description: 'Note removed' })
    } catch {
      toast({ title: 'Error', description: 'Failed to delete note', variant: 'destructive' })
    }
  }

  const handleCopy = (content: string) => {
    navigator.clipboard.writeText(content)
    toast({ title: 'Copied', description: 'Note copied to clipboard' })
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md flex flex-col">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <StickyNote className="h-4 w-4 text-emerald-500" />
            Saved Notes
          </SheetTitle>
        </SheetHeader>

        <div className="px-4 pb-2">
          <p className="text-xs text-muted-foreground">
            Pinned AI answers for this project. {notes.length} note{notes.length !== 1 ? 's' : ''}
          </p>
        </div>

        <ScrollArea className="flex-1 px-4 pb-4">
          {loading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Loading notes...</div>
          ) : notes.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <StickyNote className="h-8 w-8 text-muted-foreground mx-auto opacity-50" />
              <p className="text-sm font-medium text-muted-foreground">No notes yet</p>
              <p className="text-xs text-muted-foreground max-w-[200px] mx-auto">
                Hover over an AI answer in chat and click &quot;Pin&quot; to save it here
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {notes.map((note) => (
                <div
                  key={note.id}
                  className="rounded-lg border bg-card p-3 space-y-2 group"
                >
                  <p className="text-xs font-semibold text-muted-foreground truncate">
                    {note.title}
                  </p>
                  <div className="prose prose-sm dark:prose-invert max-w-none text-xs">
                    <ReactMarkdown>{note.content}</ReactMarkdown>
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(note.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => handleCopy(note.content)}
                        title="Copy"
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => handleDelete(note.id)}
                        title="Delete"
                      >
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}

// Inline import to avoid circular deps
import ReactMarkdown from 'react-markdown'
