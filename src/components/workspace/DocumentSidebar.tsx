'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useAppStore, type Document, type Discipline } from '@/store/useAppStore'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { DropZone } from '@/components/upload/DropZone'
import { formatFileSize, getDisciplineColor, DISCIPLINES, getFileType } from '@/lib/helpers'
import { useToast } from '@/hooks/use-toast'
import { FileText, FileSpreadsheet, FileType, Trash2, Upload, Filter, CheckCircle2, AlertCircle, X, Loader2 } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

const FILE_ICONS: Record<string, typeof FileText> = {
  pdf: FileText,
  docx: FileType,
  txt: FileText,
  xlsx: FileSpreadsheet,
  csv: FileSpreadsheet,
}

interface UploadItem {
  id: string
  file: File
  progress: number
  status: 'uploading' | 'parsing' | 'done' | 'error'
  error?: string
}

export function DocumentSidebar() {
  const {
    currentProject,
    documents,
    setDocuments,
    addDocument,
    removeDocument,
    selectedDocumentId,
    setSelectedDocumentId,
    disciplineFilter,
    setDisciplineFilter,
  } = useAppStore()
  const [uploadItems, setUploadItems] = useState<UploadItem[]>([])
  const [loading, setLoading] = useState(true)
  const { toast } = useToast()
  const abortControllersRef = useRef<Map<string, XMLHttpRequest>>(new Map())

  // Derive uploading state from active items — never gets stuck
  const uploading = uploadItems.some((u) => u.status === 'uploading' || u.status === 'parsing')

  const projectId = currentProject?.id

  const loadDocuments = useCallback(async () => {
    if (!projectId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/documents?projectId=${projectId}`)
      if (res.ok) {
        const data = await res.json()
        setDocuments(data)
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to load documents', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [projectId, setDocuments, toast])

  useEffect(() => { loadDocuments() }, [loadDocuments])

  const handleUpload = async (files: File[]) => {
    if (!projectId) return

    const items: UploadItem[] = files.map((file, i) => ({
      id: `${Date.now()}-${i}`,
      file,
      progress: 0,
      status: 'uploading' as const,
    }))
    setUploadItems((prev) => [...prev, ...items])

    for (const item of items) {
      try {
        const formData = new FormData()
        formData.append('file', item.file)
        formData.append('projectId', projectId)
        formData.append('discipline', currentProject?.discipline || 'General')

        const result = await new Promise<{ ok: boolean; doc?: Document; error?: string }>((resolve) => {
          const xhr = new XMLHttpRequest()
          abortControllersRef.current.set(item.id, xhr)

          xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
              const pct = Math.round((e.loaded / e.total) * 100)
              setUploadItems((prev) =>
                prev.map((u) => (u.id === item.id ? { ...u, progress: Math.min(pct, 99) } : u))
              )
            }
          })

          xhr.addEventListener('load', () => {
            abortControllersRef.current.delete(item.id)
            if (xhr.status >= 200 && xhr.status < 300) {
              try {
                const doc = JSON.parse(xhr.responseText)
                resolve({ ok: true, doc })
              } catch {
                resolve({ ok: true })
              }
            } else {
              try {
                const err = JSON.parse(xhr.responseText)
                resolve({ ok: false, error: err.error || `Upload failed (${xhr.status})` })
              } catch {
                resolve({ ok: false, error: `Upload failed (${xhr.status})` })
              }
            }
          })

          xhr.addEventListener('error', () => {
            abortControllersRef.current.delete(item.id)
            resolve({ ok: false, error: 'Network error' })
          })

          xhr.addEventListener('abort', () => {
            abortControllersRef.current.delete(item.id)
            resolve({ ok: false, error: 'Cancelled' })
          })

          xhr.open('POST', '/api/documents')
          xhr.send(formData)
        })

        if (result.ok) {
          // Mark as parsing (server is processing the file)
          setUploadItems((prev) =>
            prev.map((u) => (u.id === item.id ? { ...u, progress: 100, status: 'parsing' } : u))
          )
          if (result.doc) {
            addDocument(result.doc)
          }
          toast({ title: 'Uploaded', description: `${item.file.name} uploaded successfully` })
          // Show "done" briefly, then auto-clean
          setTimeout(() => {
            setUploadItems((prev) =>
              prev.map((u) => (u.id === item.id ? { ...u, status: 'done' } : u))
            )
            setTimeout(() => {
              setUploadItems((prev) => prev.filter((u) => u.id !== item.id))
            }, 1200)
          }, 800)
        } else {
          setUploadItems((prev) =>
            prev.map((u) => (u.id === item.id ? { ...u, status: 'error', error: result.error } : u))
          )
          toast({ title: 'Upload Error', description: result.error || `Failed to upload ${item.file.name}`, variant: 'destructive' })
          setTimeout(() => {
            setUploadItems((prev) => prev.filter((u) => u.id !== item.id))
          }, 4000)
        }
      } catch {
        setUploadItems((prev) =>
          prev.map((u) => (u.id === item.id ? { ...u, status: 'error', error: 'Failed to upload' } : u))
        )
        toast({ title: 'Error', description: `Failed to upload ${item.file.name}`, variant: 'destructive' })
        setTimeout(() => {
          setUploadItems((prev) => prev.filter((u) => u.id !== item.id))
        }, 4000)
      }
    }
  }

  const handleCancelUpload = (itemId: string) => {
    const xhr = abortControllersRef.current.get(itemId)
    if (xhr) {
      xhr.abort()
    }
    setUploadItems((prev) => prev.filter((u) => u.id !== itemId))
  }

  const handleDelete = async (docId: string, filename: string) => {
    if (!projectId) return
    try {
      await fetch(`/api/documents/${docId}`, { method: 'DELETE' })
      removeDocument(docId)
      if (selectedDocumentId === docId) {
        setSelectedDocumentId(null)
      }
      toast({ title: 'Deleted', description: `${filename} removed` })
    } catch {
      toast({ title: 'Error', description: 'Failed to delete document', variant: 'destructive' })
    }
  }

  const filteredDocs = disciplineFilter === 'All'
    ? documents
    : documents.filter((d) => d.discipline === disciplineFilter)

  return (
    <div className="flex flex-col h-full border-r bg-card">
      {/* Header */}
      <div className="px-3 py-3 border-b space-y-2 shrink-0">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Documents</h3>
          <Badge variant="secondary" className="text-xs">{documents.length}</Badge>
        </div>
        <DropZone onFilesSelected={handleUpload} disabled={uploading} compact />
      </div>

      {/* Upload Progress Panel */}
      {uploadItems.length > 0 && (
        <div className="px-3 py-2 border-b shrink-0 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Loader2 className="h-3.5 w-3.5 text-emerald-600 animate-spin" />
              <span className="text-xs font-medium text-muted-foreground">
                {uploadItems.filter((u) => u.status === 'uploading').length > 0
                  ? `Uploading ${uploadItems.filter((u) => u.status === 'uploading').length} file${uploadItems.filter((u) => u.status === 'uploading').length > 1 ? 's' : ''}...`
                  : uploadItems.filter((u) => u.status === 'parsing').length > 0
                    ? 'Processing documents...'
                    : 'Uploads complete'}
              </span>
            </div>
          </div>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {uploadItems.map((item) => {
              const Icon = FILE_ICONS[getFileType(item.file.name)] || FileText
              return (
                <div
                  key={item.id}
                  className={cn(
                    'rounded-lg border p-2.5 space-y-1.5 transition-all',
                    item.status === 'error' && 'border-destructive/50 bg-destructive/5',
                    item.status === 'done' && 'border-emerald-500/50 bg-emerald-50 dark:bg-emerald-950/20',
                    item.status === 'parsing' && 'border-amber-500/30 bg-amber-50 dark:bg-amber-950/20',
                    item.status === 'uploading' && 'border-border',
                  )}
                >
                  <div className="flex items-center gap-2">
                    <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="text-xs font-medium truncate flex-1">{item.file.name}</span>
                    {item.status === 'done' && (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                    )}
                    {item.status === 'error' && (
                      <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
                    )}
                    {item.status === 'parsing' && (
                      <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium shrink-0">Parsing...</span>
                    )}
                    {item.status === 'uploading' && (
                      <>
                        <span className="text-[10px] text-muted-foreground shrink-0">{item.progress}%</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5 shrink-0"
                          onClick={() => handleCancelUpload(item.id)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </>
                    )}
                  </div>
                  {item.status === 'uploading' && (
                    <Progress value={item.progress} className="h-1.5" />
                  )}
                  {item.status === 'parsing' && (
                    <Progress value={100} className="h-1.5 [&>[data-slot=progress-indicator]]:bg-amber-500 [&>[data-slot=progress-indicator]]:animate-pulse" />
                  )}
                  {item.status === 'done' && (
                    <Progress value={100} className="h-1.5 [&>[data-slot=progress-indicator]]:bg-emerald-500" />
                  )}
                  {item.status === 'error' && item.error && (
                    <p className="text-[10px] text-destructive">{item.error}</p>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Discipline Filter */}
      <div className="px-3 py-2 border-b shrink-0">
        <div className="flex items-center gap-1.5 mb-1.5">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Filter</span>
        </div>
        <Select
          value={disciplineFilter}
          onValueChange={(v) => setDisciplineFilter(v as Discipline | 'All')}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="All">All Disciplines</SelectItem>
            {DISCIPLINES.map((d) => (
              <SelectItem key={d} value={d}>{d}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Document List */}
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="p-3 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            ))
          ) : filteredDocs.length === 0 ? (
            <div className="text-center py-8 px-2">
              <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">
                {documents.length === 0 ? 'Upload documents to get started' : 'No documents match the filter'}
              </p>
            </div>
          ) : (
            filteredDocs.map((doc) => {
              const Icon = FILE_ICONS[doc.fileType] || FileText
              const isSelected = selectedDocumentId === doc.id

              return (
                <div
                  key={doc.id}
                  className={`group flex items-start gap-2.5 p-2.5 rounded-lg cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-accent text-accent-foreground'
                      : 'hover:bg-muted/50'
                  }`}
                  onClick={() => setSelectedDocumentId(doc.id)}
                >
                  <Icon className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{doc.filename}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-muted-foreground">{formatFileSize(doc.fileSize)}</span>
                      <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 ${getDisciplineColor(doc.discipline)}`}>
                        {doc.discipline}
                      </Badge>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDelete(doc.id, doc.filename)
                    }}
                  >
                    <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                  </Button>
                </div>
              )
            })
          )}
        </div>
      </ScrollArea>
    </div>
  )
}