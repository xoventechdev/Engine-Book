'use client'

import { useCallback, useRef, useState } from 'react'
import { Upload } from 'lucide-react'
import { cn } from '@/lib/utils'

const ACCEPTED_EXTENSIONS = ['.pdf', '.docx', '.txt', '.xlsx', '.csv']
const ACCEPTED_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
]

interface DropZoneProps {
  onFilesSelected: (files: File[]) => void
  disabled?: boolean
  compact?: boolean
}

export function DropZone({ onFilesSelected, disabled, compact }: DropZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const filterFiles = useCallback((fileList: FileList | File[]): File[] => {
    return Array.from(fileList).filter((f) => {
      const ext = '.' + f.name.split('.').pop()?.toLowerCase()
      return ACCEPTED_EXTENSIONS.includes(ext) || ACCEPTED_TYPES.includes(f.type)
    })
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragOver(false)
      if (disabled) return
      const files = filterFiles(e.dataTransfer.files)
      if (files.length > 0) onFilesSelected(files)
    },
    [disabled, onFilesSelected, filterFiles]
  )

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      if (!disabled) setIsDragOver(true)
    },
    [disabled]
  )

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }, [])

  const handleClick = useCallback(() => {
    if (!disabled) inputRef.current?.click()
  }, [disabled])

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) {
        const files = filterFiles(e.target.files)
        if (files.length > 0) onFilesSelected(files)
      }
      // Reset input so the same file can be re-selected
      e.target.value = ''
    },
    [onFilesSelected, filterFiles]
  )

  if (compact) {
    return (
      <>
        <button
          type="button"
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={handleClick}
          disabled={disabled}
          aria-label="Upload documents"
          className={cn(
            'w-full flex items-center justify-center gap-2 rounded-lg border-2 border-dashed transition-colors cursor-pointer',
            isDragOver
              ? 'border-primary bg-primary/5 text-primary'
              : 'border-muted-foreground/25 hover:border-muted-foreground/50 text-muted-foreground',
            disabled && 'opacity-50 cursor-not-allowed'
          )}
        >
          <Upload className="h-3.5 w-3.5" />
          <span className="text-xs font-medium">
            {isDragOver ? 'Drop files here' : 'Upload documents'}
          </span>
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPTED_EXTENSIONS.join(',')}
          onChange={handleChange}
          className="hidden"
        />
      </>
    )
  }

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleClick() } }}
      aria-label="Drag and drop or click to upload documents"
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 transition-colors cursor-pointer',
        isDragOver
          ? 'border-primary bg-primary/5'
          : 'border-muted-foreground/25 hover:border-muted-foreground/50',
        disabled && 'opacity-50 cursor-not-allowed'
      )}
    >
      <div className="rounded-full bg-muted p-3">
        <Upload className="h-5 w-5 text-muted-foreground" />
      </div>
      <div className="text-center">
        <p className="text-sm font-medium">
          {isDragOver ? 'Drop files here' : 'Drag & drop or click to upload'}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          PDF, DOCX, TXT, XLSX, CSV
        </p>
      </div>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPTED_EXTENSIONS.join(',')}
        onChange={handleChange}
        className="hidden"
      />
    </div>
  )
}