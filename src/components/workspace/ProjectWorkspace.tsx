'use client'

import { useAppStore } from '@/store/useAppStore'
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels'
import { WorkspaceToolbar } from './WorkspaceToolbar'
import { DocumentSidebar } from './DocumentSidebar'
import { DocumentViewer } from '@/components/viewer/DocumentViewer'
import { ChatPanel } from '@/components/chat/ChatPanel'
import { GripVertical } from 'lucide-react'

export function ProjectWorkspace() {
  const { currentProject } = useAppStore()

  if (!currentProject) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">No project selected</p>
      </div>
    )
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