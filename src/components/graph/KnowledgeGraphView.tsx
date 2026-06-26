'use client'

import { useState } from 'react'
import { useAppStore, type GraphData, type GraphNode } from '@/store/useAppStore'
import CytoscapeComponent from 'react-cytoscapejs'
import cytoscape from 'cytoscape'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useToast } from '@/hooks/use-toast'
import { ArrowLeft, Network, Loader2, Filter, Sparkles } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { loadAISettings } from '@/lib/client-settings'

const NODE_COLORS: Record<string, string> = {
  Equipment: '#10b981',
  Spec: '#f97316',
  Standard: '#f43f5e',
  Location: '#06b6d4',
  Value: '#f59e0b',
}

const NODE_TYPE_FILTERS = ['All', 'Equipment', 'Spec', 'Standard', 'Location', 'Value']

export function KnowledgeGraphView() {
  const { currentProject, setViewMode, setGraphData } = useAppStore()
  const [loading, setLoading] = useState(false)
  const [graphData, setLocalGraphData] = useState<GraphData | null>(null)
  const [nodeFilter, setNodeFilter] = useState('All')
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null)
  const { toast } = useToast()

  const handleGenerate = async () => {
    if (!currentProject) return
    setLoading(true)
    setSelectedNode(null)

    try {
      const aiSettings = loadAISettings()
      const res = await fetch('/api/graph', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: currentProject.id,
          ...(aiSettings ? { settings: aiSettings } : {}),
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        if (err.needsSettings) {
          toast({ title: 'AI Settings needed', description: 'Add your API key in Settings first.', variant: 'destructive' })
        }
        throw new Error(err.error || 'Failed to generate graph')
      }

      const data = await res.json()
      setLocalGraphData(data)
      setGraphData(data)
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to generate graph',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  const handleNodeClick = (nodeId: string) => {
    const node = graphData?.nodes.find((n) => n.id === nodeId)
    setSelectedNode(node || null)
  }

  const filteredElements = (() => {
    if (!graphData) return []

    const filteredNodeIds = nodeFilter === 'All'
      ? null
      : new Set(graphData.nodes.filter((n) => n.type === nodeFilter).map((n) => n.id))

    const nodes = graphData.nodes
      .filter((n) => !filteredNodeIds || filteredNodeIds.has(n.id))
      .map((n) => ({
        data: {
          id: n.id,
          label: n.label,
          type: n.type,
        },
      }))

    const edges = graphData.edges
      .filter(
        (e) => !filteredNodeIds || (filteredNodeIds.has(e.source) && filteredNodeIds.has(e.target))
      )
      .map((e) => ({
        data: {
          id: `${e.source}-${e.target}`,
          source: e.source,
          target: e.target,
          label: e.relation,
        },
      }))

    return [...nodes, ...edges]
  })()

  const cyStyles: cytoscape.StylesheetStyle[] = [
    {
      selector: 'node',
      style: {
        label: 'data(label)',
        'text-valign': 'center',
        'text-halign': 'center',
        'font-size': '10px',
        'color': '#fff',
        'text-wrap': 'wrap',
        'text-max-width': '80px',
        'background-color': '#888',
        width: 50,
        height: 50,
        'text-outline-color': '#000',
        'text-outline-width': 1,
      },
    },
    {
      selector: 'node[type="Equipment"]',
      style: { 'background-color': NODE_COLORS.Equipment },
    },
    {
      selector: 'node[type="Spec"]',
      style: { 'background-color': NODE_COLORS.Spec },
    },
    {
      selector: 'node[type="Standard"]',
      style: { 'background-color': NODE_COLORS.Standard },
    },
    {
      selector: 'node[type="Location"]',
      style: { 'background-color': NODE_COLORS.Location },
    },
    {
      selector: 'node[type="Value"]',
      style: { 'background-color': NODE_COLORS.Value },
    },
    {
      selector: 'edge',
      style: {
        width: 1.5,
        'line-color': '#999',
        'target-arrow-color': '#999',
        'target-arrow-shape': 'triangle',
        'curve-style': 'bezier',
        label: 'data(label)',
        'font-size': '8px',
        'text-rotation': 'autorotate',
        'text-background-color': '#fff',
        'text-background-opacity': 0.8,
        'color': '#666',
      },
    },
  ]

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <header className="h-12 border-b bg-card/80 backdrop-blur-sm flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setViewMode('workspace')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2">
            <Network className="h-4 w-4 text-emerald-500" />
            <h2 className="text-sm font-semibold">Knowledge Graph</h2>
          </div>
        </div>
        <Button
          onClick={handleGenerate}
          disabled={loading}
          className="gap-2"
          size="sm"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          {graphData ? 'Regenerate' : 'Generate Graph'}
        </Button>
      </header>

      <div className="flex-1 flex min-h-0 flex-col md:flex-row">
        {/* Mobile: horizontal filter bar */}
        <div className="md:hidden border-b bg-card p-2 shrink-0">
          <div className="flex items-center gap-1.5 overflow-x-auto">
            {NODE_TYPE_FILTERS.map((type) => (
              <button
                key={type}
                onClick={() => setNodeFilter(type)}
                className={`shrink-0 text-xs px-2.5 py-1 rounded-full transition-colors flex items-center gap-1.5 ${
                  nodeFilter === type
                    ? 'bg-accent text-accent-foreground font-medium'
                    : 'text-muted-foreground hover:bg-muted border'
                }`}
              >
                {type !== 'All' && (
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: NODE_COLORS[type] }} />
                )}
                {type}
              </button>
            ))}
          </div>
        </div>

        {/* Desktop: sidebar */}
        <div className="hidden md:flex w-56 border-r bg-card p-3 flex-col shrink-0">
          <div className="flex items-center gap-1.5 mb-3">
            <Filter className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">Filter by Type</span>
          </div>
          <div className="space-y-1.5 mb-4">
            {NODE_TYPE_FILTERS.map((type) => (
              <button
                key={type}
                onClick={() => setNodeFilter(type)}
                className={`w-full text-left text-xs px-2.5 py-1.5 rounded-md transition-colors flex items-center gap-2 ${
                  nodeFilter === type
                    ? 'bg-accent text-accent-foreground font-medium'
                    : 'text-muted-foreground hover:bg-muted'
                }`}
              >
                {type !== 'All' && (
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: NODE_COLORS[type] }}
                  />
                )}
                {type}
              </button>
            ))}
          </div>

          {/* Legend */}
          <div className="mt-auto border-t pt-3">
            <p className="text-xs font-medium text-muted-foreground mb-2">Legend</p>
            {Object.entries(NODE_COLORS).map(([type, color]) => (
              <div key={type} className="flex items-center gap-2 mb-1">
                <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: color }} />
                <span className="text-xs text-muted-foreground">{type}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Graph Area */}
        <div className="flex-1 relative">
          {!graphData && !loading && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center space-y-4 max-w-sm">
                <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mx-auto">
                  <Network className="h-8 w-8 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium">Generate Knowledge Graph</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Extract entities and relationships from your uploaded documents
                  </p>
                </div>
                <Button onClick={handleGenerate} className="gap-2">
                  <Sparkles className="h-4 w-4" />
                  Generate Graph
                </Button>
              </div>
            </div>
          )}

          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/50 backdrop-blur-sm">
              <div className="text-center space-y-3">
                <Loader2 className="h-8 w-8 animate-spin text-emerald-500 mx-auto" />
                <p className="text-sm text-muted-foreground">Analyzing documents...</p>
              </div>
            </div>
          )}

          {graphData && !loading && (
            <>
              {filteredElements.length > 0 ? (
                <CytoscapeComponent
                  elements={filteredElements}
                  stylesheet={cyStyles}
                  layout={{ name: 'cose', animate: true, animationDuration: 500 }}
                  style={{ width: '100%', height: '100%' }}
                  cy={(cy) => {
                    cy.on('tap', 'node', (evt) => {
                      handleNodeClick(evt.target.id())
                    })
                  }}
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  <p className="text-sm text-muted-foreground">No entities found with current filter</p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Selected Node Panel */}
        <AnimatePresence>
          {selectedNode && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 220, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              className="border-l bg-card overflow-hidden"
            >
              <div className="p-4">
                <h3 className="text-sm font-semibold mb-2">Selected Entity</h3>
                <div className="space-y-2">
                  <div>
                    <p className="text-xs text-muted-foreground">Name</p>
                    <p className="text-sm font-medium">{selectedNode.label}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Type</p>
                    <Badge
                      variant="secondary"
                      style={{
                        backgroundColor: NODE_COLORS[selectedNode.type] + '20',
                        color: NODE_COLORS[selectedNode.type],
                      }}
                    >
                      {selectedNode.type}
                    </Badge>
                  </div>
                  {graphData && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Related To</p>
                      <div className="space-y-1">
                        {graphData.edges
                          .filter((e) => e.source === selectedNode.id || e.target === selectedNode.id)
                          .map((e, i) => {
                            const relatedId = e.source === selectedNode.id ? e.target : e.source
                            const related = graphData.nodes.find((n) => n.id === relatedId)
                            return related ? (
                              <div key={i} className="text-xs p-1.5 rounded bg-muted">
                                <span className="font-medium">{related.label}</span>
                                <span className="text-muted-foreground ml-1">({e.relation})</span>
                              </div>
                            ) : null
                          })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}