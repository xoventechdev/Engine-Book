'use client'

import { useState } from 'react'
import { useAppStore } from '@/store/useAppStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { ArrowLeft, FileBarChart2, Loader2, Sparkles, Download, Copy, Check } from 'lucide-react'
import { REPORT_TYPES } from '@/lib/helpers'
import { loadAISettings } from '@/lib/client-settings'
import ReactMarkdown from 'react-markdown'

export function ReportBuilder() {
  const { currentProject, setViewMode } = useAppStore()
  const [outputType, setOutputType] = useState<string>(REPORT_TYPES[0].value)
  const [title, setTitle] = useState('')
  const [loading, setLoading] = useState(false)
  const [report, setReport] = useState<{ id: string; outputType: string; title: string; content: string } | null>(null)
  const [editContent, setEditContent] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [copied, setCopied] = useState(false)
  const { toast } = useToast()

  const handleGenerate = async () => {
    if (!currentProject) return
    setLoading(true)
    setIsEditing(false)

    try {
      const aiSettings = loadAISettings()
      const res = await fetch('/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: currentProject.id,
          outputType,
          title: title.trim() || undefined,
          ...(aiSettings ? { settings: aiSettings } : {}),
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        if (err.needsSettings) {
          toast({ title: 'AI Settings needed', description: 'Add your API key in Settings first.', variant: 'destructive' })
        }
        throw new Error(err.error || 'Failed to generate report')
      }

      const data = await res.json()
      setReport(data)
      setEditContent(data.content)
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to generate report',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(isEditing ? editContent : report?.content || '')
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast({ title: 'Error', description: 'Failed to copy', variant: 'destructive' })
    }
  }

  const handleDownloadTxt = () => {
    const content = isEditing ? editContent : report?.content || ''
    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${report?.title || 'report'}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <header className="h-12 border-b bg-card/80 backdrop-blur-sm flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setViewMode('workspace')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2">
            <FileBarChart2 className="h-4 w-4 text-emerald-500" />
            <h2 className="text-sm font-semibold">Report Builder</h2>
          </div>
        </div>
        {report && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsEditing(!isEditing)}
              className="gap-1.5 text-xs"
            >
              {isEditing ? 'Preview' : 'Edit'}
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={handleCopy}>
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={handleDownloadTxt}>
              <Download className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </header>

      <div className="flex-1 overflow-hidden flex flex-col lg:flex-row">
        {/* Sidebar Controls */}
        <div className="w-full lg:w-72 border-b lg:border-b-0 lg:border-r bg-card p-4 shrink-0 space-y-4">
          <div className="space-y-2">
            <Label>Report Type</Label>
            <Select value={outputType} onValueChange={setOutputType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REPORT_TYPES.map((rt) => (
                  <SelectItem key={rt.value} value={rt.value}>{rt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="report-title">Custom Title (optional)</Label>
            <Input
              id="report-title"
              placeholder="Leave empty for default"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <Button
            onClick={handleGenerate}
            disabled={loading}
            className="w-full gap-2"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {report ? 'Regenerate' : 'Generate Report'}
          </Button>

          <div className="text-xs text-muted-foreground space-y-1 pt-2 border-t">
            <p className="font-medium">Report types:</p>
            <ul className="space-y-0.5">
              <li><strong>Checklist:</strong> Commissioning steps</li>
              <li><strong>Schedule:</strong> Equipment inventory table</li>
              <li><strong>Handover:</strong> O&M summary report</li>
              <li><strong>Extraction:</strong> Data tables from docs</li>
            </ul>
          </div>
        </div>

        {/* Report Content */}
        <div className="flex-1 min-h-0">
          {loading && (
            <div className="h-full flex items-center justify-center">
              <div className="text-center space-y-3">
                <Loader2 className="h-8 w-8 animate-spin text-emerald-500 mx-auto" />
                <p className="text-sm text-muted-foreground">Generating report...</p>
              </div>
            </div>
          )}

          {!loading && !report && (
            <div className="h-full flex items-center justify-center">
              <div className="text-center space-y-4 max-w-sm">
                <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mx-auto">
                  <FileBarChart2 className="h-8 w-8 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium">Generate a Report</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Select a report type and generate it from your uploaded documents
                  </p>
                </div>
              </div>
            </div>
          )}

          {!loading && report && !isEditing && (
            <ScrollArea className="h-full">
              <div className="max-w-3xl mx-auto p-6">
                <h2 className="text-xl font-bold mb-4">{report.title}</h2>
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <ReactMarkdown>{report.content}</ReactMarkdown>
                </div>
              </div>
            </ScrollArea>
          )}

          {!loading && report && isEditing && (
            <div className="h-full p-4">
              <Textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="h-full font-mono text-sm resize-none"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}