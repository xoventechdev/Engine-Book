'use client'

import { useAppStore } from '@/store/useAppStore'
import { Dashboard } from '@/components/dashboard/Dashboard'
import { ProjectWorkspace } from '@/components/workspace/ProjectWorkspace'
import { KnowledgeGraphView } from '@/components/graph/KnowledgeGraphView'
import { CompareView } from '@/components/compare/CompareView'
import { ReportBuilder } from '@/components/report/ReportBuilder'
import { AnimatePresence, motion } from 'framer-motion'

export default function Home() {
  const viewMode = useAppStore((s) => s.viewMode)

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={viewMode}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.15 }}
        className="h-full"
      >
        {viewMode === 'dashboard' && <Dashboard />}
        {viewMode === 'workspace' && <ProjectWorkspace />}
        {viewMode === 'graph' && <KnowledgeGraphView />}
        {viewMode === 'compare' && <CompareView />}
        {viewMode === 'report' && <ReportBuilder />}
      </motion.div>
    </AnimatePresence>
  )
}