'use client'

import { useEffect, useState, useRef } from 'react'
import { useAppStore } from '@/store/useAppStore'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { FileText, FileSpreadsheet, AlertCircle } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

export function DocumentViewer() {
  const { selectedDocumentId, documents, jumpTarget, setJumpTarget } = useAppStore()
  const [content, setContent] = useState<string | null>(null)
  const [contentType, setContentType] = useState<'pdf' | 'html' | 'table' | 'text' | null>(null)
  const [tableData, setTableData] = useState<Record<string, string[][]> | null>(null)
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)
  const { toast } = useToast()
  const blobRef = useRef<string | null>(null)

  const selectedDoc = documents.find((d) => d.id === selectedDocumentId)

  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => {
      if (blobRef.current) {
        URL.revokeObjectURL(blobRef.current)
        blobRef.current = null
      }
    }
  }, [])

  // Load content when the selected document or retry changes.
  // NOTE: jumpTarget and pdfBlobUrl are intentionally NOT in the dependency
  // array — jumpTarget only changes the iframe page hash (no reload needed),
  // and pdfBlobUrl is set BY this effect (including it causes an infinite loop).
  const loadedDocRef = useRef<string | null>(null)

  useEffect(() => {
    if (!selectedDocumentId) {
      setContent(null)
      setContentType(null)
      setTableData(null)
      setError(null)
      if (blobRef.current) {
        URL.revokeObjectURL(blobRef.current)
        blobRef.current = null
      }
      setPdfBlobUrl(null)
      loadedDocRef.current = null
      return
    }

    // Skip if we already loaded this exact document (e.g. effect re-ran due
    // to pdfBlobUrl changing — which we set ourselves).
    if (loadedDocRef.current === selectedDocumentId && retryCount === 0) {
      return
    }

    let cancelled = false

    const loadContent = async () => {
      setLoading(true)
      setError(null)

      try {
        const res = await fetch(`/api/documents/${selectedDocumentId}/content`)
        if (!res.ok) {
          throw new Error('Failed to load document content')
        }

        if (cancelled) return

        const contentTypeHeader = res.headers.get('content-type')

        if (contentTypeHeader?.includes('application/pdf')) {
          // PDF - create blob URL (revoke previous first)
          const blob = await res.blob()
          if (cancelled) return
          if (blobRef.current) URL.revokeObjectURL(blobRef.current)
          const url = URL.createObjectURL(blob)
          blobRef.current = url
          setPdfBlobUrl(url)
          setContentType('pdf')
          setContent(null)
          setTableData(null)
        } else {
          // JSON response (HTML, table, or text)
          const data = await res.json()
          if (cancelled) return
          if (blobRef.current) {
            URL.revokeObjectURL(blobRef.current)
            blobRef.current = null
          }
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
        loadedDocRef.current = selectedDocumentId
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Failed to load document')
        toast({ title: 'Error', description: 'Failed to load document content', variant: 'destructive' })
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadContent()
    return () => { cancelled = true }
  }, [selectedDocumentId, retryCount])

  const handleRetry = () => {
    setError(null)
    setContent(null)
    loadedDocRef.current = null
    setRetryCount((c) => c + 1)
  }

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
          {[90, 75, 85, 70, 80, 65, 88, 72].map((w, i) => (
            <Skeleton key={i} className="h-4" style={{ width: `${w}%` }} />
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
          <Button variant="outline" size="sm" onClick={handleRetry}>
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
            key={jumpTarget ? `${selectedDocumentId}-p${jumpTarget.page}` : selectedDocumentId}
            src={pdfBlobUrl + (jumpTarget ? `#page=${jumpTarget.page}` : '')}
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
