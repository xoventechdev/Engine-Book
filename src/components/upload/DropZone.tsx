'use client'

import { useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { Upload, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'

interface DropZoneProps {
  onFilesSelected: (files: File[]) => void
  disabled?: boolean
  compact?: boolean
}

export function DropZone({ onFilesSelected, disabled, compact }: DropZoneProps) {
  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length > 0) {
        onFilesSelected(acceptedFiles)
      }
    },
    [onFilesSelected]
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'text/plain': ['.txt'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'text/csv': ['.csv'],
    },
    disabled,
    maxSize: 50 * 1024 * 1024, // 50MB
  })

  if (compact) {
    return (
      <div
        {...getRootProps()}
        className={cn(
          'border-2 border-dashed rounded-lg p-3 text-center cursor-pointer transition-colors',
          isDragActive ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20' : 'border-border hover:border-emerald-500/50 hover:bg-muted/50',
          disabled && 'opacity-50 cursor-not-allowed'
        )}
      >
        <input {...getInputProps()} />
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Upload className="h-4 w-4" />
          <span>{isDragActive ? 'Drop files here' : 'Upload documents'}</span>
        </div>
      </div>
    )
  }

  return (
    <div
      {...getRootProps()}
      className={cn(
        'border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-200',
        isDragActive
          ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20 scale-[1.01]'
          : 'border-border hover:border-emerald-500/50 hover:bg-muted/50',
        disabled && 'opacity-50 cursor-not-allowed'
      )}
    >
      <input {...getInputProps()} />
      <div className="flex flex-col items-center gap-3">
        <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
          {isDragActive ? (
            <FileText className="h-6 w-6 text-emerald-600" />
          ) : (
            <Upload className="h-6 w-6 text-muted-foreground" />
          )}
        </div>
        <div>
          <p className="text-sm font-medium">
            {isDragActive ? 'Drop files here' : 'Drag & drop documents here'}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            PDF, DOCX, TXT, XLSX, CSV — up to 50MB each
          </p>
        </div>
      </div>
    </div>
  )
}