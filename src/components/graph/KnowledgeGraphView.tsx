'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useAppStore, type GraphData, type GraphNode } from '@/store/useAppStore'
import CytoscapeComponent from 'react-cytoscapejs'
import type cytoscape from 'cytoscape'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import {
  ArrowLeft, Network, Loader2, Sparkles, Search, ZoomIn, ZoomOut,
  Maximize, X, FileText, Cpu, Settings2, MapPin, Hash, Boxes,
  Wrench, Gauge, BookMarked,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { loadAISettings } from '@/lib/client-settings'
import { useTheme } from 'next-themes'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Type configuration — colors, icons, labels per node type
// ---------------------------------------------------------------------------

const NODE_CONFIG: Record<string, { color: string; lightBg: string; icon: typeof Cpu; shape: string }> = {
  Equipment:  { color: '#10b981', lightBg: '#10b98120', icon: Cpu,       shape: 'roundrectangle' },
  System:     { color: '#8b5cf6', lightBg: '#8b5cf620', icon: Boxes,     shape: 'diamond' },
  Component:  { color: '#06b6d4', lightBg: '#06b6d420', icon: Wrench,    shape: 'roundrectangle' },
  Spec:       { color: '#f97316', lightBg: '#f9731620', icon: Settings2, shape: 'roundrectangle' },
  Parameter:  { color: '#3b82f6', lightBg: '#3b82f620', icon: Gauge,     shape: 'roundrectangle' },
  Standard:   { color: '#f43f5e', lightBg: '#f43f5e20', icon: BookMarked,shape: 'hexagon' },
  Location:   { color: '#a855f7', lightBg: '#a855f720', icon: MapPin,    shape: 'ellipse' },
  Value:      { color: '#f59e0b', lightBg: '#f59e0b20', icon: Hash,      shape: 'ellipse' },
}

const ALL_TYPES = ['Equipment', 'System', 'Component', 'Spec', 'Parameter', 'Standard', 'Location', 'Value']

const RELATION_LABELS: Record<string, string> = {
  has_spec: 'has spec',
  located_in: 'located in',
  references: 'references',
  rated_at: 'rated at',
  part_of: 'part of',
  connected_to: 'connected to',
  controls: 'controls',
  monitors: 'monitors',
  requires: 'requires',
  supplies: 'supplies',
  returns_from: 'returns from',
  feeds: 'feeds',
  regulated_by: 'regulated by',
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function KnowledgeGraphView() {
  const { currentProject, setViewMode, setGraphData, graphData: storedGraphData } = useAppStore()
  const [loading, setLoading] = useState(false)
  const [graphData, setLocalGraphData] = useState<GraphData | null>(storedGraphData)
  const [activeTypes, setActiveTypes] = useState<Set<string>>(new Set(ALL_TYPES))
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const { toast } = useToast()
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'
  const cyRef = useRef<cytoscape.Core | null>(null)

  // Load stored graph data on mount
  useEffect(() => {
    if (storedGraphData && !graphData) {
      setLocalGraphData(storedGraphData)
    }
  }, [storedGraphData])

  // ---- Generate graph ----
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

  // ---- Compute degree (connection count) per node for sizing ----
  const nodeDegrees = (() => {
    const degrees = new Map<string, number>()
    if (!graphData) return degrees
    for (const edge of graphData.edges) {
      degrees.set(edge.source, (degrees.get(edge.source) || 0) + 1)
      degrees.set(edge.target, (degrees.get(edge.target) || 0) + 1)
    }
    return degrees
  })()

  // ---- Filtered elements for Cytoscape ----
  const filteredElements = (() => {
    if (!graphData) return []

    const searchLower = searchQuery.toLowerCase().trim()
    const searchMatches = searchLower
      ? new Set(
          graphData.nodes
            .filter((n) => n.label.toLowerCase().includes(searchLower))
            .map((n) => n.id)
        )
      : null

    // When searching, also include nodes connected to matches
    let visibleNodeIds: Set<string> | null = null
    if (searchMatches) {
      visibleNodeIds = new Set(searchMatches)
      for (const edge of graphData.edges) {
        if (searchMatches.has(edge.source)) visibleNodeIds.add(edge.target)
        if (searchMatches.has(edge.target)) visibleNodeIds.add(edge.source)
      }
    }

    const nodes = graphData.nodes
      .filter((n) => activeTypes.has(n.type))
      .filter((n) => !visibleNodeIds || visibleNodeIds.has(n.id))
      .map((n) => {
        const degree = nodeDegrees.get(n.id) || 0
        const size = 36 + Math.min(degree * 6, 30) // 36-66px based on connections
        return {
          data: {
            id: n.id,
            label: n.label,
            type: n.type,
            degree,
            size,
            ...(n.properties ? { properties: JSON.stringify(n.properties) } : {}),
            ...(n.document ? { document: n.document } : {}),
          },
        }
      })

    const visibleIdSet = new Set(nodes.map((n) => n.data.id))
    const edges = graphData.edges
      .filter((e) => visibleIdSet.has(e.source) && visibleIdSet.has(e.target))
      .map((e, i) => ({
        data: {
          id: `e${i}`,
          source: e.source,
          target: e.target,
          label: RELATION_LABELS[e.relation] || e.relation,
          weight: e.weight || 1,
        },
      }))

    return [...nodes, ...edges]
  })()

  // ---- Cytoscape stylesheet (dark-mode aware) ----
  const cyStyles = [
    // Base node
    {
      selector: 'node',
      style: {
        'background-color': '#64748b',
        'label': 'data(label)',
        'text-valign': 'bottom',
        'text-halign': 'center',
        'text-margin-y': 6,
        'font-size': '10px',
        'font-family': 'system-ui, sans-serif',
        'color': isDark ? '#cbd5e1' : '#334155',
        'text-wrap': 'wrap',
        'text-max-width': '90px',
        'width': 'data(size)',
        'height': 'data(size)',
        'shape': 'roundrectangle',
        'border-width': 2,
        'border-color': isDark ? '#1e293b' : '#e2e8f0',
        'transition-property': 'background-color, border-color, opacity, width, height',
        'transition-duration': '200ms',
      },
    },
    // Per-type styling
    ...ALL_TYPES.map((type) => ({
      selector: `node[type="${type}"]`,
      style: {
        'background-color': NODE_CONFIG[type].color,
        'shape': NODE_CONFIG[type].shape,
        'border-color': NODE_CONFIG[type].color,
      },
    })),
    // Highlighted (hover) node
    {
      selector: 'node.highlighted',
      style: {
        'border-width': 4,
        'border-color': isDark ? '#f8fafc' : '#0f172a',
        'opacity': 1,
      },
    },
    // Faded (non-connected during hover)
    {
      selector: 'node.faded',
      style: {
        'opacity': 0.2,
      },
    },
    // Selected node
    {
      selector: 'node:selected',
      style: {
        'border-width': 5,
        'border-color': isDark ? '#fbbf24' : '#f59e0b',
      },
    },
    // Edges
    {
      selector: 'edge',
      style: {
        'width': 'mapData(weight, 1, 3, 1.5, 4)',
        'line-color': isDark ? '#334155' : '#cbd5e1',
        'target-arrow-color': isDark ? '#334155' : '#cbd5e1',
        'target-arrow-shape': 'triangle',
        'curve-style': 'bezier',
        'label': 'data(label)',
        'font-size': '8px',
        'font-family': 'system-ui, sans-serif',
        'text-rotation': 'autorotate',
        'text-background-color': isDark ? '#0f172a' : '#f8fafc',
        'text-background-opacity': 0.9,
        'text-background-padding': '2px',
        'text-background-shape': 'roundrectangle',
        'color': isDark ? '#64748b' : '#94a3b8',
        'transition-property': 'line-color, target-arrow-color, opacity, width',
        'transition-duration': '200ms',
      },
    },
    // Highlighted edge (connected to hovered node)
    {
      selector: 'edge.highlighted',
      style: {
        'line-color': '#6366f1',
        'target-arrow-color': '#6366f1',
        'width': 'mapData(weight, 1, 3, 2.5, 5)',
        'opacity': 1,
        'z-index': 10,
      },
    },
    // Faded edge (not connected to hovered node)
    {
      selector: 'edge.faded',
      style: {
        'opacity': 0.08,
      },
    },
  ] as cytoscape.StylesheetStyle[]

  // ---- Hover highlight logic ----
  const setupHoverHandlers = useCallback((cy: cytoscape.Core) => {
    cy.on('mouseover', 'node', (evt) => {
      const node = evt.target
      const connected = node.closedNeighborhood()
      cy.elements().removeClass('highlighted faded')
      connected.addClass('highlighted')
      cy.elements().not(connected).addClass('faded')
    })

    cy.on('mouseout', 'node', () => {
      cy.elements().removeClass('highlighted faded')
    })

    cy.on('tap', 'node', (evt) => {
      const id = evt.target.id()
      const node = graphData?.nodes.find((n) => n.id === id)
      setSelectedNode(node || null)
    })

    cy.on('tap', (evt) => {
      if (evt.target === cy) {
        setSelectedNode(null)
      }
    })
  }, [graphData])

  // ---- Zoom controls ----
  const handleZoomIn = () => {
    const cy = cyRef.current
    if (!cy) return
    cy.zoom(cy.zoom() * 1.3)
  }
  const handleZoomOut = () => {
    const cy = cyRef.current
    if (!cy) return
    cy.zoom(cy.zoom() / 1.3)
  }
  const handleFit = () => cyRef.current?.fit(undefined, 60)

  // ---- Type toggle ----
  const toggleType = (type: string) => {
    setActiveTypes((prev) => {
      const next = new Set(prev)
      if (next.has(type)) {
        next.delete(type)
      } else {
        next.add(type)
      }
      // Don't allow empty — reset to all if last one is removed
      if (next.size === 0) return new Set(ALL_TYPES)
      return next
    })
  }

  const enableAllTypes = () => setActiveTypes(new Set(ALL_TYPES))

  // ---- Stats ----
  const stats = (() => {
    if (!graphData) return { nodes: 0, edges: 0, types: 0 }
    const typesPresent = new Set(graphData.nodes.map((n) => n.type))
    return { nodes: graphData.nodes.length, edges: graphData.edges.length, types: typesPresent.size }
  })()

  // ---- Selected node connections ----
  const selectedConnections = (() => {
    if (!graphData || !selectedNode) return []
    return graphData.edges
      .filter((e) => e.source === selectedNode.id || e.target === selectedNode.id)
      .map((e) => {
        const relatedId = e.source === selectedNode.id ? e.target : e.source
        const related = graphData.nodes.find((n) => n.id === relatedId)
        const direction = e.source === selectedNode.id ? 'outgoing' : 'incoming'
        return related ? { node: related, relation: e.relation, direction } : null
      })
      .filter(Boolean) as { node: GraphNode; relation: string; direction: string }[]
  })()

  // ---- Jump to connected node ----
  const handleJumpToNode = (nodeId: string) => {
    const node = graphData?.nodes.find((n) => n.id === nodeId)
    if (node) {
      setSelectedNode(node)
      cyRef.current?.animate({
        center: { eles: `#${nodeId}` },
        zoom: 1.5,
      }, { duration: 400 })
    }
  }

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="h-12 border-b bg-card/80 backdrop-blur-sm flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setViewMode('workspace')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2">
            <Network className="h-4 w-4 text-violet-500" />
            <h2 className="text-sm font-semibold">Knowledge Graph</h2>
            {graphData && (
              <div className="hidden sm:flex items-center gap-2 ml-2 text-[10px] text-muted-foreground">
                <span>{stats.nodes} entities</span>
                <span>·</span>
                <span>{stats.edges} relations</span>
              </div>
            )}
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
        {/* Mobile: filter bar */}
        <div className="md:hidden border-b bg-card p-2 shrink-0 space-y-2">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search entities..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 pl-8 text-xs"
            />
          </div>
          {/* Type chips */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1">
            {ALL_TYPES.map((type) => {
              const config = NODE_CONFIG[type]
              const isActive = activeTypes.has(type)
              const present = graphData?.nodes.some((n) => n.type === type)
              if (!present) return null
              return (
                <button
                  key={type}
                  onClick={() => toggleType(type)}
                  className={cn(
                    'shrink-0 text-[10px] px-2 py-1 rounded-full transition-all flex items-center gap-1 border',
                    isActive ? 'font-medium' : 'opacity-40'
                  )}
                  style={{
                    backgroundColor: isActive ? config.lightBg : 'transparent',
                    borderColor: isActive ? config.color : 'transparent',
                    color: isActive ? config.color : undefined,
                  }}
                >
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: config.color }} />
                  {type}
                </button>
              )
            })}
            {activeTypes.size < ALL_TYPES.length && (
              <button onClick={enableAllTypes} className="shrink-0 text-[10px] text-muted-foreground underline">
                Show all
              </button>
            )}
          </div>
        </div>

        {/* Desktop sidebar */}
        <div className="hidden md:flex w-60 border-r bg-card flex-col shrink-0">
          {/* Search */}
          <div className="p-3 border-b">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search entities..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 pl-8 text-xs"
              />
            </div>
          </div>

          {/* Type filters */}
          <div className="p-3 border-b">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Entity Types</span>
              {activeTypes.size < ALL_TYPES.length && (
                <button onClick={enableAllTypes} className="text-[10px] text-violet-500 hover:underline">
                  Reset
                </button>
              )}
            </div>
            <div className="space-y-1">
              {ALL_TYPES.map((type) => {
                const config = NODE_CONFIG[type]
                const Icon = config.icon
                const isActive = activeTypes.has(type)
                const count = graphData?.nodes.filter((n) => n.type === type).length || 0
                if (count === 0) return null
                return (
                  <button
                    key={type}
                    onClick={() => toggleType(type)}
                    className={cn(
                      'w-full text-left text-xs px-2.5 py-1.5 rounded-md transition-all flex items-center gap-2',
                      isActive ? 'bg-accent text-accent-foreground' : 'opacity-50 hover:opacity-80'
                    )}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: config.color }} />
                    <span className="flex-1">{type}</span>
                    <span className="text-[10px] text-muted-foreground font-mono">{count}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Legend / stats */}
          {graphData && (
            <div className="p-3 mt-auto border-t">
              <div className="grid grid-cols-2 gap-2 mb-3">
                <div className="rounded-lg border p-2 text-center">
                  <p className="text-lg font-bold">{stats.nodes}</p>
                  <p className="text-[9px] text-muted-foreground uppercase">Entities</p>
                </div>
                <div className="rounded-lg border p-2 text-center">
                  <p className="text-lg font-bold">{stats.edges}</p>
                  <p className="text-[9px] text-muted-foreground uppercase">Relations</p>
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground text-center">
                Hover a node to highlight connections
              </p>
            </div>
          )}
        </div>

        {/* Graph canvas */}
        <div className="flex-1 relative">
          {/* Empty state */}
          {!graphData && !loading && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center space-y-4 max-w-sm">
                <div className="h-16 w-16 rounded-2xl bg-violet-100 dark:bg-violet-900/20 flex items-center justify-center mx-auto">
                  <Network className="h-8 w-8 text-violet-500" />
                </div>
                <div>
                  <p className="text-sm font-medium">Knowledge Graph</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Extract entities, specifications, and relationships from your documents into an interactive graph
                  </p>
                </div>
                <Button onClick={handleGenerate} className="gap-2">
                  <Sparkles className="h-4 w-4" />
                  Generate Graph
                </Button>
              </div>
            </div>
          )}

          {/* Loading overlay */}
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-sm z-20">
              <div className="text-center space-y-3">
                <Loader2 className="h-8 w-8 animate-spin text-violet-500 mx-auto" />
                <div>
                  <p className="text-sm font-medium">Extracting knowledge graph...</p>
                  <p className="text-xs text-muted-foreground mt-1">Analyzing entities and relationships</p>
                </div>
              </div>
            </div>
          )}

          {/* Cytoscape graph */}
          {graphData && !loading && (
            <>
              {filteredElements.length > 0 ? (
                <CytoscapeComponent
                  elements={filteredElements}
                  stylesheet={cyStyles}
                  layout={{
                    name: 'cose',
                    animate: true,
                    animationDuration: 600,
                    nodeRepulsion: () => 8000,
                    idealEdgeLength: () => 120,
                    edgeElasticity: () => 80,
                    gravity: 0.25,
                    numIter: 2000,
                    fit: true,
                    padding: 60,
                  }}
                  style={{ width: '100%', height: '100%' }}
                  cy={(cy) => {
                    cyRef.current = cy
                    setupHoverHandlers(cy)
                  }}
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center space-y-2">
                    <p className="text-sm text-muted-foreground">
                      {searchQuery ? `No entities match "${searchQuery}"` : 'No entities with current filters'}
                    </p>
                    {(searchQuery || activeTypes.size < ALL_TYPES.length) && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => { setSearchQuery(''); enableAllTypes() }}
                      >
                        Clear filters
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {/* Zoom controls */}
              {filteredElements.length > 0 && (
                <div className="absolute bottom-4 right-4 flex flex-col gap-1.5 bg-card border rounded-lg shadow-lg p-1 z-10">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleZoomIn} title="Zoom in">
                    <ZoomIn className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleZoomOut} title="Zoom out">
                    <ZoomOut className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleFit} title="Fit to screen">
                    <Maximize className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Selected node detail panel */}
        <AnimatePresence>
          {selectedNode && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 280, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              className="border-l bg-card overflow-hidden shrink-0"
            >
              <div className="w-[280px] h-full flex flex-col">
                {/* Panel header */}
                <div className="px-4 py-3 border-b flex items-center justify-between shrink-0">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Entity Details</span>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setSelectedNode(null)}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>

                {/* Panel content */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {/* Name + type badge */}
                  <div className="space-y-2">
                    <h3 className="text-base font-semibold leading-tight">{selectedNode.label}</h3>
                    <div className="flex items-center gap-2">
                      {(() => {
                        const config = NODE_CONFIG[selectedNode.type] || NODE_CONFIG.Equipment
                        const Icon = config.icon
                        return (
                          <Badge
                            variant="secondary"
                            className="gap-1.5 text-[10px]"
                            style={{
                              backgroundColor: config.lightBg,
                              color: config.color,
                            }}
                          >
                            <Icon className="h-3 w-3" />
                            {selectedNode.type}
                          </Badge>
                        )
                      })()}
                      <span className="text-[10px] text-muted-foreground">
                        {nodeDegrees.get(selectedNode.id) || 0} connection{(nodeDegrees.get(selectedNode.id) || 0) === 1 ? '' : 's'}
                      </span>
                    </div>
                  </div>

                  {/* Properties */}
                  {selectedNode.properties && Object.keys(selectedNode.properties).length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Properties</p>
                      <div className="space-y-1">
                        {Object.entries(selectedNode.properties).map(([key, value]) => (
                          <div key={key} className="flex items-start gap-2 text-xs rounded-lg bg-muted/50 px-2.5 py-1.5">
                            <span className="text-muted-foreground font-medium shrink-0">{key}:</span>
                            <span className="text-foreground break-words">{value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Source document */}
                  {selectedNode.document && (
                    <div className="space-y-1.5">
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Source</p>
                      <div className="flex items-center gap-1.5 text-xs rounded-lg bg-muted/50 px-2.5 py-1.5">
                        <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="truncate">{selectedNode.document}</span>
                      </div>
                    </div>
                  )}

                  {/* Connections */}
                  {selectedConnections.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                        Connections ({selectedConnections.length})
                      </p>
                      <div className="space-y-1.5">
                        {selectedConnections.map((conn, i) => {
                          const config = NODE_CONFIG[conn.node.type] || NODE_CONFIG.Equipment
                          const Icon = config.icon
                          return (
                            <button
                              key={i}
                              onClick={() => handleJumpToNode(conn.node.id)}
                              className="w-full text-left rounded-lg border p-2 hover:bg-accent transition-colors group"
                            >
                              <div className="flex items-center gap-2">
                                <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: config.color }} />
                                <span className="text-xs font-medium flex-1 truncate group-hover:text-violet-600">
                                  {conn.node.label}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5 ml-5 mt-0.5">
                                <span className="text-[10px] text-muted-foreground">
                                  {conn.direction === 'outgoing' ? RELATION_LABELS[conn.relation] || conn.relation : (RELATION_LABELS[conn.relation] || conn.relation)}
                                </span>
                                <span className="text-[10px] text-muted-foreground/60">·</span>
                                <span className="text-[10px] text-muted-foreground">{conn.node.type}</span>
                              </div>
                            </button>
                          )
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
