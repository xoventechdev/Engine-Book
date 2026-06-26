'use client'

import { useState } from 'react'
import { useAppStore } from '@/store/useAppStore'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTheme } from 'next-themes'
import { Moon, Sun, Settings2, Headphones, StickyNote, GraduationCap, Network, GitCompare, FileBarChart2, MoreHorizontal } from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
      <header className="h-12 border-b bg-card/80 backdrop-blur-sm flex items-center justify-between px-2 sm:px-4 shrink-0">
        {/* Left: back + title */}
        <div className="flex items-center gap-2 min-w-0">
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={handleBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-sm font-semibold truncate min-w-0">{currentProject.name}</h2>
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-0.5 sm:gap-1">
          {/* Desktop: full button list */}
          <div className="hidden md:flex items-center gap-1">
            <ToolbarButton icon={Headphones} label="Audio" onClick={() => setAudioOpen(true)} tooltip="Audio Overview (podcast)" />
            <Divider />
            <ToolbarButton icon={Network} label="Graph" onClick={() => setViewMode('graph')} tooltip="Knowledge Graph" />
            <ToolbarButton icon={GitCompare} label="Compare" onClick={() => setViewMode('compare')} tooltip="Compare Documents" />
            <ToolbarButton icon={FileBarChart2} label="Report" onClick={() => setViewMode('report')} tooltip="Generate Report" />
            <ToolbarButton icon={GraduationCap} label="Study" onClick={() => setStudyGuideOpen(true)} tooltip="Study Guide" />
            <ToolbarButton icon={StickyNote} label="Notes" onClick={() => setNotesOpen(true)} tooltip="Saved Notes" />
            <Divider />
            <ToolbarIconButton onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} tooltip="Toggle theme">
              <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
              <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
            </ToolbarIconButton>
            <ToolbarIconButton onClick={() => setSettingsOpen(true)} tooltip="AI Settings">
              <Settings2 className="h-4 w-4" />
            </ToolbarIconButton>
            <Divider />
          </div>

          {/* Mobile: icon-only for top actions + More menu */}
          <div className="flex md:hidden items-center gap-0.5">
            <ToolbarIconButton onClick={() => setAudioOpen(true)} tooltip="Audio Overview">
              <Headphones className="h-4 w-4" />
            </ToolbarIconButton>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setViewMode('graph')}>
                  <Network className="h-4 w-4 mr-2" /> Knowledge Graph
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setViewMode('compare')}>
                  <GitCompare className="h-4 w-4 mr-2" /> Compare
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setViewMode('report')}>
                  <FileBarChart2 className="h-4 w-4 mr-2" /> Report
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setStudyGuideOpen(true)}>
                  <GraduationCap className="h-4 w-4 mr-2" /> Study Guide
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setNotesOpen(true)}>
                  <StickyNote className="h-4 w-4 mr-2" /> Notes
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
                  {theme === 'dark' ? <Sun className="h-4 w-4 mr-2" /> : <Moon className="h-4 w-4 mr-2" />}
                  {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSettingsOpen(true)}>
                  <Settings2 className="h-4 w-4 mr-2" /> AI Settings
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

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
      <NotesPanel open={notesOpen} onOpenChange={setNotesOpen} />
    </TooltipProvider>
  )
}

// --- Helper components ---

function ToolbarButton({ icon: Icon, label, onClick, tooltip }: {
  icon: typeof Headphones
  label: string
  onClick: () => void
  tooltip: string
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5 h-8 text-xs" onClick={onClick}>
          <Icon className="h-3.5 w-3.5" />
          <span>{label}</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  )
}

function ToolbarIconButton({ children, onClick, tooltip }: {
  children: React.ReactNode
  onClick: () => void
  tooltip: string
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClick}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  )
}

function Divider() {
  return <div className="w-px h-5 bg-border mx-1" />
}
