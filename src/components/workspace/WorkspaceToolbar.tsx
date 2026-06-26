'use client'

import { useState } from 'react'
import { useAppStore, type Discipline } from '@/store/useAppStore'
import { ArrowLeft, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTheme } from 'next-themes'
import { Moon, Sun, GitCompare, Network, FileBarChart2, Settings2, Headphones, StickyNote, GraduationCap } from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { SettingsDialog } from '@/components/settings/SettingsDialog'
import { AudioOverviewDialog } from '@/components/audio/AudioOverviewDialog'
import { StudyGuideDialog } from '@/components/study/StudyGuideDialog'
import { NotesPanel } from '@/components/notes/NotesPanel'
import { UserMenu } from '@/components/auth/UserMenu'

export function WorkspaceToolbar() {
  const { currentProject, setViewMode, setCurrentProject, setDocuments, setChatMessages, setSelectedDocumentId } = useAppStore()
  const { theme, setTheme } = useTheme()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [audioOpen, setAudioOpen] = useState(false)
  const [studyGuideOpen, setStudyGuideOpen] = useState(false)
  const [notesOpen, setNotesOpen] = useState(false)

  const handleBack = () => {
    setViewMode('dashboard')
    setCurrentProject(null)
    setDocuments([])
    setChatMessages([])
    setSelectedDocumentId(null)
  }

  if (!currentProject) return null

  return (
    <TooltipProvider delayDuration={300}>
      <header className="h-12 border-b bg-card/80 backdrop-blur-sm flex items-center justify-between px-3 sm:px-4 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={handleBack}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Back to Dashboard</TooltipContent>
          </Tooltip>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold truncate">{currentProject.name}</h2>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 h-8 text-xs"
                onClick={() => setAudioOpen(true)}
              >
                <Headphones className="h-3.5 w-3.5" />
                <span className="hidden md:inline">Audio</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Audio Overview (podcast)</TooltipContent>
          </Tooltip>

          <div className="w-px h-5 bg-border mx-1" />

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 h-8 text-xs"
                onClick={() => setViewMode('graph')}
              >
                <Network className="h-3.5 w-3.5" />
                <span className="hidden md:inline">Graph</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Knowledge Graph</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 h-8 text-xs"
                onClick={() => setViewMode('compare')}
              >
                <GitCompare className="h-3.5 w-3.5" />
                <span className="hidden md:inline">Compare</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Compare Documents</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 h-8 text-xs"
                onClick={() => setViewMode('report')}
              >
                <FileBarChart2 className="h-3.5 w-3.5" />
                <span className="hidden md:inline">Report</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Generate Report</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 h-8 text-xs"
                onClick={() => setStudyGuideOpen(true)}
              >
                <GraduationCap className="h-3.5 w-3.5" />
                <span className="hidden md:inline">Study</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Study Guide</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 h-8 text-xs"
                onClick={() => setNotesOpen(true)}
              >
                <StickyNote className="h-3.5 w-3.5" />
                <span className="hidden md:inline">Notes</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Saved Notes</TooltipContent>
          </Tooltip>

          <div className="w-px h-5 bg-border mx-1" />

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              >
                <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
                <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Toggle theme</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setSettingsOpen(true)}
              >
                <Settings2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>AI Settings</TooltipContent>
          </Tooltip>

          <div className="w-px h-5 bg-border mx-1" />

          <UserMenu />
        </div>
      </header>

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      <AudioOverviewDialog
        open={audioOpen}
        onOpenChange={setAudioOpen}
        projectId={currentProject.id}
        projectName={currentProject.name}
      />
      <StudyGuideDialog
        open={studyGuideOpen}
        onOpenChange={setStudyGuideOpen}
        projectId={currentProject.id}
        projectName={currentProject.name}
      />
      <NotesPanel
        open={notesOpen}
        onOpenChange={setNotesOpen}
      />
    </TooltipProvider>
  )
}