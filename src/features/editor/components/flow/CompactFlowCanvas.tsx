import { memo, useCallback, useEffect, useRef } from 'react'
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Handle,
  Position,
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
  ReactFlowProvider
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { v4 as uuidv4 } from 'uuid'
import type { FlowNodeData } from '@shared/types'
import {
  NODE_LIBRARY,
  createFlowNodeFromItem,
  type NodeLibraryItem
} from '@/features/flow-designer/lib/node-definitions'
import { cn } from '@/shared/lib/utils'

const CompactFlowNode = memo(function CompactFlowNode({ data, selected }: NodeProps) {
  const d = data as unknown as FlowNodeData
  const color = d.color || '#6366f1'

  return (
    <div
      className={cn(
        'min-w-[110px] rounded-lg border-2 bg-background px-3 py-2 text-center shadow-sm',
        selected && 'ring-2 ring-primary/40'
      )}
      style={{ borderColor: `${color}99` }}
    >
      <Handle type="target" position={Position.Top} className="!h-2 !w-2" />
      <div className="text-[11px] font-medium leading-tight">{d.label || 'Node'}</div>
      {d.nodeType && (
        <div className="mt-0.5 text-[9px] uppercase tracking-wide text-muted-foreground">
          {d.nodeType}
        </div>
      )}
      <Handle type="source" position={Position.Bottom} className="!h-2 !w-2" />
    </div>
  )
})

const compactNodeTypes = { flowNode: CompactFlowNode, default: CompactFlowNode }

const PALETTE_ITEMS: NodeLibraryItem[] = [
  ...(NODE_LIBRARY.find((c) => c.id === 'flowchart')?.items ?? []),
  ...(NODE_LIBRARY.find((c) => c.id === 'architecture')?.items.slice(0, 4) ?? [])
]

function CompactFlowCanvasInner({
  initialNodes,
  initialEdges,
  onChange,
  height
}: {
  initialNodes: Node[]
  initialEdges: Edge[]
  onChange: (nodes: Node[], edges: Edge[]) => void
  height: number
}) {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
  const ready = useRef(false)

  useEffect(() => {
    ready.current = true
  }, [])

  useEffect(() => {
    if (!ready.current) return
    onChange(nodes, edges)
  }, [nodes, edges, onChange])

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) =>
        addEdge(
          {
            ...connection,
            id: `e-${uuidv4()}`,
            type: 'smoothstep'
          },
          eds
        )
      )
    },
    [setEdges]
  )

  const onDoubleClickNode = useCallback(
    (_: React.MouseEvent, node: Node) => {
      const nextLabel = window.prompt(
        'Node label',
        String((node.data as unknown as FlowNodeData)?.label ?? '')
      )
      if (nextLabel == null) return
      setNodes((nds) =>
        nds.map((n) =>
          n.id === node.id
            ? {
                ...n,
                data: {
                  ...n.data,
                  label: nextLabel.trim() || (n.data as unknown as FlowNodeData).label
                }
              }
            : n
        )
      )
    },
    [setNodes]
  )

  const addItem = (item: NodeLibraryItem) => {
    const created = createFlowNodeFromItem(
      item,
      {
        x: 80 + Math.random() * 180,
        y: 60 + Math.random() * 120
      },
      `node-${uuidv4()}`
    )
    setNodes((nds) => [
      ...nds.map((n) => ({ ...n, selected: false })),
      { ...created, type: 'flowNode', selected: true }
    ])
  }

  return (
    <div className="flex h-full min-h-0 flex-col" onMouseDown={(e) => e.stopPropagation()}>
      <div className="flex flex-wrap gap-1 border-b border-border/60 bg-muted/20 px-2 py-1.5">
        {PALETTE_ITEMS.map((item) => (
          <button
            key={item.id}
            type="button"
            className="rounded border border-border/60 bg-background px-1.5 py-0.5 text-[10px] hover:bg-muted"
            onClick={() => addItem(item)}
            title={item.description || item.label}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1" style={{ height: Math.max(220, height - 40) }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeDoubleClick={onDoubleClickNode}
          nodeTypes={compactNodeTypes}
          fitView
          proOptions={{ hideAttribution: true }}
          deleteKeyCode={['Backspace', 'Delete']}
        >
          <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
          <Controls showInteractive={false} />
          <MiniMap pannable zoomable className="!scale-75" />
        </ReactFlow>
      </div>
    </div>
  )
}

export function CompactFlowCanvas(props: {
  initialNodes: Node[]
  initialEdges: Edge[]
  onChange: (nodes: Node[], edges: Edge[]) => void
  height: number
}) {
  return (
    <ReactFlowProvider>
      <CompactFlowCanvasInner {...props} />
    </ReactFlowProvider>
  )
}
