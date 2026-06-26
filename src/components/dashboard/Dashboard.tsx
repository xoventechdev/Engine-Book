'use client'

import { useEffect, useState } from 'react'
import { useAppStore, type Project } from '@/store/useAppStore'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { CreateProjectDialog } from '@/components/dashboard/CreateProjectDialog'
import { EditProjectDialog } from '@/components/dashboard/EditProjectDialog'
import { formatRelativeTime, getDisciplineColor } from '@/lib/helpers'
import { Plus, FolderOpen, Trash2, FileText, MoreVertical, Settings2, Pencil } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { UserMenu } from '@/components/auth/UserMenu'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useToast } from '@/hooks/use-toast'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { SettingsDialog } from '@/components/settings/SettingsDialog'

export function Dashboard() {
  const { setViewMode, setCurrentProject, setDocuments, setChatMessages, setChatOpen, setSelectedDocumentId } = useAppStore()
  const [projects, setProjects] = useState<(Project & { _count?: { documents: number } })[]>([])
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [editTarget, setEditTarget] = useState<Project | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const { toast } = useToast()

  const loadProjects = async () => {
    try {
      const res = await fetch('/api/projects')
      const data = await res.json()
      if (!res.ok) {
        if (data.needsAuth) {
          // Session expired — AuthGate will handle redirect to login
          setProjects([])
          return
        }
        throw new Error(data.error || 'Failed to load projects')
      }
      setProjects(Array.isArray(data) ? data : [])
    } catch {
      setProjects([])
      toast({ title: 'Error', description: 'Failed to load projects', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadProjects() }, [])

  const handleOpenProject = (project: Project & { _count?: { documents: number } }) => {
    setCurrentProject(project)
    setDocuments([])
    setChatMessages([])
    setSelectedDocumentId(null)
    setChatOpen(true)
    setViewMode('workspace')
  }

  const handleDeleteProject = async (id: string) => {
    try {
      const res = await fetch(`/api/projects/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to delete project')
      }
      setProjects((prev) => prev.filter((p) => p.id !== id))
      toast({ title: 'Deleted', description: 'Project deleted successfully' })
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to delete project', variant: 'destructive' })
    }
    setDeleteTarget(null)
  }

  const handleCreated = () => {
    setCreateOpen(false)
    loadProjects()
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-emerald-600 flex items-center justify-center">
              <FileText className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Engine Book</h1>
              <p className="text-xs text-muted-foreground">AI Engineering Document Assistant</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <UserMenu />
            <Button variant="outline" size="icon" onClick={() => setSettingsOpen(true)} title="AI Settings" aria-label="AI Settings">
              <Settings2 className="h-4 w-4" />
            </Button>
            <Button onClick={() => setCreateOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">New Project</span>
            </Button>
          </div>
        </div>
      </header>

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />

      {/* Content */}
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Card key={i} className="h-40">
                <div className="p-6 space-y-3">
                  <div className="h-5 w-3/4 bg-muted rounded animate-pulse" />
                  <div className="h-4 w-1/2 bg-muted rounded animate-pulse" />
                  <div className="h-3 w-1/3 bg-muted rounded animate-pulse" />
                </div>
              </Card>
            ))}
          </div>
        ) : projects.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center py-24 text-center"
          >
            <div className="h-20 w-20 rounded-full bg-muted flex items-center justify-center mb-6">
              <FolderOpen className="h-10 w-10 text-muted-foreground" />
            </div>
            <h2 className="text-2xl font-semibold mb-2">No Projects Yet</h2>
            <p className="text-muted-foreground max-w-md mb-6">
              Create your first project to start uploading engineering documents and interacting with them using AI.
            </p>
            <Button onClick={() => setCreateOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Create First Project
            </Button>
          </motion.div>
        ) : (
          <div>
            <div className="mb-6">
              <h2 className="text-2xl font-bold tracking-tight">Your Projects</h2>
              <p className="text-muted-foreground mt-1">{projects.length} project{projects.length !== 1 ? 's' : ''} total</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <AnimatePresence mode="popLayout">
                {projects.map((project, index) => (
                  <motion.div
                    key={project.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ delay: index * 0.05 }}
                  >
                    <Card
                      className="group cursor-pointer hover:shadow-md transition-all duration-200 h-40 flex flex-col"
                      onClick={() => handleOpenProject(project)}
                    >
                      <CardHeader className="pb-2 pt-4 px-4 flex-1 min-h-0">
                        <div className="flex items-start justify-between gap-2">
                          <CardTitle className="text-base font-semibold truncate">{project.name}</CardTitle>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={(e) => { e.stopPropagation(); setEditTarget(project) }}
                              >
                                <Pencil className="h-4 w-4 mr-2" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={(e) => { e.stopPropagation(); setDeleteTarget(project.id) }}
                                className="text-destructive"
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                        {project.description && (
                          <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{project.description}</p>
                        )}
                      </CardHeader>
                      <CardContent className="px-4 pb-3 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className={getDisciplineColor(project.discipline)}>
                            {project.discipline}
                          </Badge>
                        </div>
                        <div className="text-xs text-muted-foreground flex items-center gap-3">
                          <span>{project._count?.documents || 0} doc{project._count?.documents !== 1 ? 's' : ''}</span>
                          <span>{formatRelativeTime(project.updatedAt)}</span>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t py-4 text-center text-sm text-muted-foreground">
        Engine Book &mdash; AI-Powered Engineering Document Assistant
      </footer>

      <CreateProjectDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={handleCreated} />

      <EditProjectDialog project={editTarget} open={!!editTarget} onOpenChange={(o) => { if (!o) setEditTarget(null) }} onUpdated={loadProjects} />

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Project?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this project, all its documents, chat history, and generated outputs. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && handleDeleteProject(deleteTarget)}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}