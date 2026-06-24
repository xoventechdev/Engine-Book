'use client'

import { useEffect, useState } from 'react'
import { useAppStore } from '@/store/useAppStore'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { FileText, FileSpreadsheet, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'

interface DocumentViewerProps {
  onCitationClick?: (docName: string, page?: number) => void
}

export function DocumentViewer({ onCitationClick }: DocumentViewerProps) {
  const { selectedDocumentId, documents, currentProject } = useAppStore()
  const [content, setContent] = useState<string | null>(null)
  const [contentType, setContentType] = useState<'pdf' | 'html' | 'table' | 'text' | null>(null)
  const [tableData, setTableData] = useState<Record<string, string[][]> | null>(null)
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { toast } = useToast()

  const selectedDoc = documents.find((d) => d.id === selectedDocumentId)

  useEffect(() => {
    // Cleanup blob URL when changing documents
    return () => {
      if (pdfBlobUrl) {
        URL.revokeObjectURL(pdfBlobUrl)
      }
    }
  }, [selectedDocumentId])

  useEffect(() => {
    if (!selectedDocumentId) {
      setContent(null)
      setContentType(null)
      setTableData(null)
      if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl)
      setPdfBlobUrl(null)
      return
    }

    const loadContent = async () => {
      setLoading(true)
      setError(null)

      try {
        const res = await fetch(`/api/documents/${selectedDocumentId}/content`)
        if (!res.ok) {
          throw new Error('Failed to load document content')
        }

        const contentTypeHeader = res.headers.get('content-type')

        if (contentTypeHeader?.includes('application/pdf')) {
          // PDF - create blob URL
          const blob = await res.blob()
          if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl)
          const url = URL.createObjectURL(blob)
          setPdfBlobUrl(url)
          setContentType('pdf')
          setContent(null)
          setTableData(null)
        } else {
          // JSON response (HTML, table, or text)
          const data = await res.json()
          setPdfBlobUrl(null)

          if (data.type === 'html') {
            setContentType('html')
            setContent(data.content)
            setTableData(null)
          } else if (data.type === 'table') {
            setContentType('table')
            setContent(null)
            setTableData(data.sheets)
          } else if (data.type === 'text') {
            setContentType('text')
            setContent(data.content)
            setTableData(null)
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load document')
        toast({ title: 'Error', description: 'Failed to load document content', variant: 'destructive' })
      } finally {
        setLoading(false)
      }
    }

    loadContent()
  }, [selectedDocumentId])

  if (!selectedDocumentId) {
    return (
      <div className="h-full flex items-center justify-center bg-muted/20">
        <div className="text-center space-y-3 max-w-sm">
          <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mx-auto">
            <FileText className="h-8 w-8 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">No Document Selected</p>
            <p className="text-xs text-muted-foreground mt-1">
              Upload and select a document from the sidebar to view it here
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="h-full p-6 space-y-4 bg-card overflow-y-auto">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-32" />
        <div className="space-y-3 mt-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-4 w-full" style={{ width: `${90 - Math.random() * 20}%` }} />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center bg-muted/20">
        <div className="text-center space-y-3">
          <AlertCircle className="h-8 w-8 text-destructive mx-auto" />
          <p className="text-sm text-destructive">{error}</p>
          <Button variant="outline" size="sm" onClick={() => {
            setContent(null); setError(null)
          }}>
            Retry
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-card overflow-hidden">
      {/* Document header */}
      <div className="px-4 py-2.5 border-b flex items-center gap-2 shrink-0">
        {selectedDoc?.fileType === 'pdf' && <FileText className="h-4 w-4 text-rose-500" />}
        {selectedDoc?.fileType === 'docx' && <FileText className="h-4 w-4 text-blue-500" />}
        {selectedDoc?.fileType === 'xlsx' && <FileSpreadsheet className="h-4 w-4 text-emerald-500" />}
        {selectedDoc?.fileType === 'csv' && <FileSpreadsheet className="h-4 w-4 text-emerald-500" />}
        {selectedDoc?.fileType === 'txt' && <FileText className="h-4 w-4 text-muted-foreground" />}
        <span className="text-sm font-medium truncate">{selectedDoc?.filename}</span>
      </div>

      {/* Document content */}
      <div className="flex-1 min-h-0 overflow-hidden relative">
        {contentType === 'pdf' && pdfBlobUrl && (
          <iframe
            src={pdfBlobUrl}
            className="w-full h-full border-0"
            title={selectedDoc?.filename || 'PDF Viewer'}
          />
        )}

        {contentType === 'html' && content && (
          <div
            className="prose prose-sm dark:prose-invert max-w-none p-6 overflow-y-auto h-full"
            dangerouslySetInnerHTML={{ __html: content }}
          />
        )}

        {contentType === 'text' && content && (
          <pre className="p-6 text-sm font-mono whitespace-pre-wrap overflow-y-auto h-full">
            {content}
          </pre>
        )}

        {contentType === 'table' && tableData && (
          <div className="overflow-auto h-full p-4">
            {Object.entries(tableData).map(([sheetName, rows]) => (
              <div key={sheetName} className="mb-6">
                <h3 className="text-sm font-semibold mb-2 text-muted-foreground">
                  {sheetName}
                </h3>
                <div className="border rounded-lg overflow-hidden">
                  <table className="text-sm w-full">
                    <tbody>
                      {rows.map((row, rowIndex) => (
                        <tr key={rowIndex} className={rowIndex === 0 ? 'bg-muted font-medium' : 'border-t'}>
                          {row.map((cell, cellIndex) => (
                            <td key={cellIndex} className="px-3 py-2 border-r last:border-r-0 whitespace-nowrap max-w-xs truncate">
                              {cell || ''}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}