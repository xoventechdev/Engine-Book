'use client'

import { useState } from 'react'
import { useAppStore } from '@/store/useAppStore'
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels'
import { WorkspaceToolbar } from './WorkspaceToolbar'
import { DocumentSidebar } from './DocumentSidebar'
import { DocumentViewer } from '@/components/viewer/DocumentViewer'
import { ChatPanel } from '@/components/chat/ChatPanel'
import { useIsMobile } from '@/hooks/use-mobile-detect'
import { GripVertical, FileText, MessageSquare, FolderOpen } from 'lucide-react'
import { cn } from '@/lib/utils'

type MobileTab = 'documents' | 'viewer' | 'chat'

export function ProjectWorkspace() {
  const { currentProject, selectedDocumentId, chatMessages } = useAppStore()
  const isMobile = useIsMobile()
  const [mobileTab, setMobileTab] = useState<MobileTab>('documents')

  if (!currentProject) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">No project selected</p>
      </div>
    )
  }

  // Auto-switch to viewer when a document is selected on mobile
  // (handled via effect in the mobile layout below)

  if (isMobile) {
    return <MobileWorkspace tab={mobileTab} setTab={setMobileTab} />
  }

  return (
    <div className="h-screen flex flex-col">
      <WorkspaceToolbar />
      <div className="flex-1 min-h-0">
        <PanelGroup direction="horizontal" autoSaveId="workspace-layout">
          {/* Document Sidebar */}
          <Panel defaultSize={20} minSize={15} maxSize={30}>
            <DocumentSidebar />
          </Panel>

          <PanelResizeHandle className="w-1.5 bg-border hover:bg-emerald-500/50 transition-colors flex items-center justify-center group">
            <GripVertical className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
          </PanelResizeHandle>

          {/* Document Viewer */}
          <Panel defaultSize={50} minSize={30}>
            <DocumentViewer />
          </Panel>

          <PanelResizeHandle className="w-1.5 bg-border hover:bg-emerald-500/50 transition-colors flex items-center justify-center group">
            <GripVertical className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
          </PanelResizeHandle>

          {/* Chat Panel */}
          <Panel defaultSize={30} minSize={20} maxSize={45}>
            <ChatPanel />
          </Panel>
        </PanelGroup>
      </div>
    </div>
  )
}

// ---- Mobile layout: one panel at a time with bottom tab bar ----

function MobileWorkspace({ tab, setTab }: { tab: MobileTab; setTab: (t: MobileTab) => void }) {
  const { selectedDocumentId, chatMessages } = useAppStore()

  // Auto-switch to viewer tab when a document is selected
  const [lastSelected, setLastSelected] = useState<string | null>(null)
  if (selectedDocumentId && selectedDocumentId !== lastSelected) {
    setLastSelected(selectedDocumentId)
    if (tab === 'documents') setTab('viewer')
  }

  const chatBadge = chatMessages.length

  const tabs: { id: MobileTab; label: string; icon: typeof FileText; badge?: number }[] = [
    { id: 'documents', label: 'Files', icon: FolderOpen },
    { id: 'viewer', label: 'Viewer', icon: FileText },
    { id: 'chat', label: 'Chat', icon: MessageSquare, badge: chatBadge },
  ]

  return (
    <div className="h-screen flex flex-col">
      <WorkspaceToolbar />

      {/* Single active panel */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {tab === 'documents' && <DocumentSidebar />}
        {tab === 'viewer' && <DocumentViewer />}
        {tab === 'chat' && <ChatPanel />}
      </div>

      {/* Bottom tab bar */}
      <nav className="shrink-0 border-t bg-card flex items-center justify-around h-14 px-2 safe-area-bottom">
        {tabs.map((t) => {
          const Icon = t.icon
          const active = tab === t.id
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                'flex flex-col items-center justify-center gap-0.5 flex-1 h-full text-[10px] font-medium transition-colors relative',
                active ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'
              )}
            >
              <div className="relative">
                <Icon className="h-5 w-5" />
                {t.badge !== undefined && t.badge > 0 && (
                  <span className="absolute -top-1.5 -right-2 bg-emerald-500 text-white text-[8px] font-semibold rounded-full min-w-[14px] h-[14px] flex items-center justify-center px-0.5">
                    {t.badge}
                  </span>
                )}
              </div>
              <span>{t.label}</span>
              {active && <div className="absolute top-0 left-1/4 right-1/4 h-0.5 bg-emerald-500 rounded-b-full" />}
            </button>
          )
        })}
      </nav>
    </div>
  )
}
