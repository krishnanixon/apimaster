import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Node,
  type Edge,
  type ReactFlowInstance,
  BackgroundVariant
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { DbErDiagram } from '@shared/types/database-workspace'
import { Spinner } from '@/shared/components/ui/spinner'
import { useDbWorkspaceStore } from '../../stores/dbWorkspace.store'
import { ErTableNode, tableColorIndex } from '../er/ErTableNode'
import { ErTableDetailModal } from '../er/ErTableDetailModal'

interface ErDiagramTabViewProps {
  connectionId: string
  database: string
  schema: string
}

const nodeTypes = { erTable: ErTableNode }

const EDGE_COLORS = ['#0ea5e9', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444', '#06b6d4']

/** Tables stay expanded unless the user explicitly collapses them */
function isTableExpanded(expandedMap: Record<string, boolean>, table: string): boolean {
  return expandedMap[table] !== false
}

export function ErDiagramTabView({ connectionId, database, schema }: ErDiagramTabViewProps) {
  const [diagram, setDiagram] = useState<DbErDiagram | null>(null)
  const [loading, setLoading] = useState(true)
  const [expandedMap, setExpandedMap] = useState<Record<string, boolean>>({})
  const [detailTable, setDetailTable] = useState<string | null>(null)
  const [selectedTable, setSelectedTable] = useState<string | null>(null)
  const rfInstance = useRef<ReactFlowInstance | null>(null)
  const fitApplied = useRef(false)

  const openTableTab = useDbWorkspaceStore((s) => s.openTableTab)
  const openQueryTab = useDbWorkspaceStore((s) => s.openQueryTab)

  useEffect(() => {
    void (async () => {
      setLoading(true)
      fitApplied.current = false
      const res = await window.electronAPI.dbWorkspace.generateErDiagram(connectionId, database, schema)
      if (res.success && res.data) {
        setDiagram(res.data)
        setExpandedMap({})
      }
      setLoading(false)
    })()
  }, [connectionId, database, schema])

  useEffect(() => {
    if (diagram && rfInstance.current && !fitApplied.current) {
      rfInstance.current.fitView({ padding: 0.15, duration: 300 })
      fitApplied.current = true
    }
  }, [diagram])

  const handleToggleExpand = useCallback((table: string) => {
    setExpandedMap((prev) => ({
      ...prev,
      [table]: !isTableExpanded(prev, table)
    }))
  }, [])

  const handleShowDetails = useCallback((table: string) => {
    setDetailTable(table)
    setSelectedTable(table)
  }, [])

  const { nodes, edges } = useMemo(() => {
    if (!diagram) return { nodes: [] as Node[], edges: [] as Edge[] }

    const nodes: Node[] = diagram.nodes.map((n) => ({
      id: n.id,
      type: 'erTable',
      position: { x: n.x, y: n.y },
      draggable: true,
      data: {
        table: n.table,
        columns: n.columns,
        colorIndex: tableColorIndex(n.table),
        expanded: isTableExpanded(expandedMap, n.table),
        onToggleExpand: handleToggleExpand,
        onShowDetails: handleShowDetails
      },
      selected: selectedTable === n.table
    }))

    const edges: Edge[] = diagram.edges.map((e, i) => ({
      id: e.id,
      source: diagram.nodes.find((n) => n.table === e.sourceTable)?.id ?? e.sourceTable,
      target: diagram.nodes.find((n) => n.table === e.targetTable)?.id ?? e.targetTable,
      label: e.label ?? `${e.sourceColumn} → ${e.targetColumn}`,
      animated: true,
      style: { stroke: EDGE_COLORS[i % EDGE_COLORS.length], strokeWidth: 2 },
      labelStyle: { fill: 'hsl(var(--foreground))', fontSize: 10 },
      labelBgStyle: { fill: 'hsl(var(--background))', fillOpacity: 0.85 }
    }))

    return { nodes, edges }
  }, [diagram, expandedMap, handleToggleExpand, handleShowDetails, selectedTable])

  const detailColorIndex = detailTable ? tableColorIndex(detailTable) : 0

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    )
  }

  if (!diagram) {
    return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">No diagram data</div>
  }

  return (
    <div className="relative h-full w-full bg-muted/10">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        minZoom={0.15}
        maxZoom={1.5}
        proOptions={{ hideAttribution: true }}
        nodesConnectable={false}
        elementsSelectable
        onInit={(instance) => {
          rfInstance.current = instance
        }}
        onNodeClick={(_, node) => {
          const table = (node.data as { table?: string }).table
          if (table) setSelectedTable(table)
        }}
        onPaneClick={() => setSelectedTable(null)}
      >
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="hsl(var(--border))" />
        <Controls showInteractive={false} />
        <MiniMap
          nodeColor={(n) => {
            const idx = (n.data as { colorIndex?: number })?.colorIndex ?? 0
            return ['#0ea5e9', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444', '#06b6d4', '#6366f1', '#84cc16'][idx % 8]
          }}
          maskColor="hsl(var(--background) / 0.7)"
        />
      </ReactFlow>

      <div className="pointer-events-none absolute bottom-3 left-3 rounded-lg border border-border bg-background/95 px-3 py-2 text-xs shadow-md backdrop-blur">
        <span className="text-muted-foreground">Click table name or </span>
        <span className="font-medium">+N more columns</span>
        <span className="text-muted-foreground"> for full details · Chevron to collapse</span>
      </div>

      <ErTableDetailModal
        open={detailTable != null}
        onOpenChange={(open) => {
          if (!open) setDetailTable(null)
        }}
        connectionId={connectionId}
        database={database}
        schema={schema}
        table={detailTable}
        colorIndex={detailColorIndex}
        onOpenData={
          detailTable
            ? () => openTableTab(connectionId, database, schema, detailTable)
            : undefined
        }
        onOpenQuery={(sql) => openQueryTab(connectionId, sql, `${detailTable} — query`)}
      />
    </div>
  )
}
