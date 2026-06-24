'use client'

import { useEffect, useState, useCallback } from 'react'
import { useAppStore, type Document, type Discipline } from '@/store/useAppStore'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DropZone } from '@/components/upload/DropZone'
import { formatFileSize, getDisciplineColor, DISCIPLINES, getFileType } from '@/lib/helpers'
import { useToast } from '@/hooks/use-toast'
import { FileText, FileSpreadsheet, FileType, Trash2, Upload, Filter } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'

const FILE_ICONS: Record<string, typeof FileText> = {
  pdf: FileText,
  docx: FileType,
  txt: FileText,
  xlsx: FileSpreadsheet,
  csv: FileSpreadsheet,
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
  const [uploading, setUploading] = useState(false)
  const [loading, setLoading] = useState(true)
  const { toast } = useToast()

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
    setUploading(true)

    for (const file of files) {
      try {
        const formData = new FormData()
        formData.append('file', file)
        formData.append('projectId', projectId)
        formData.append('discipline', currentProject?.discipline || 'General')

        const res = await fetch('/api/documents', {
          method: 'POST',
          body: formData,
        })

        if (res.ok) {
          const doc = await res.json()
          addDocument(doc)
          toast({ title: 'Uploaded', description: `${file.name} uploaded successfully` })
        } else {
          const err = await res.json()
          toast({ title: 'Upload Error', description: err.error || `Failed to upload ${file.name}`, variant: 'destructive' })
        }
      } catch {
        toast({ title: 'Error', description: `Failed to upload ${file.name}`, variant: 'destructive' })
      }
    }

    setUploading(false)
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