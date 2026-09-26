import { useCallback, useEffect, useRef, useState } from 'react'
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react'
import {
  ExternalLink,
  GitBranch,
  Loader2,
  Maximize2,
  Minimize2,
  Pencil,
  Trash2
} from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import type { Edge, Node } from '@xyflow/react'
import { FlowThumbnail } from '@/features/flow-designer/components/FlowThumbnail'
import { CompactFlowCanvas } from '@/features/editor/components/flow/CompactFlowCanvas'
import { Button } from '@/shared/components/ui/button'
import { cn } from '@/shared/lib/utils'
import type { FlowDiagram } from '@shared/types'

function parseGraph(flow: FlowDiagram | null): { nodes: Node[]; edges: Edge[] } {
  if (!flow) return { nodes: [], edges: [] }
  try {
    const nodes = JSON.parse(flow.nodes || '[]') as Node[]
    const edges = JSON.parse(flow.edges || '[]') as Edge[]
    return {
      nodes: Array.isArray(nodes) ? nodes : [],
      edges: Array.isArray(edges) ? edges : []
    }
  } catch {
    return { nodes: [], edges: [] }
  }
}

export function FlowBlockNodeView({ node, updateAttributes, selected, deleteNode }: NodeViewProps) {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const { flowId, title, height } = node.attrs as {
    flowId: string
    title: string
    height: number
    slotKey?: string
  }

  const [editing, setEditing] = useState(false)
  const [loading, setLoading] = useState(false)
  const [flow, setFlow] = useState<FlowDiagram | null>(null)
  const [graph, setGraph] = useState<{ nodes: Node[]; edges: Edge[] }>({ nodes: [], edges: [] })
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const loadFlow = useCallback(async (id: string) => {
    if (!id || !window.electronAPI?.flows) {
      setFlow(null)
      setGraph({ nodes: [], edges: [] })
      return
    }
    setLoading(true)
    try {
      const result = await window.electronAPI.flows.get(id)
      if (result.success && result.data) {
        setFlow(result.data)
        setGraph(parseGraph(result.data))
      } else {
        setFlow(null)
        setGraph({ nodes: [], edges: [] })
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadFlow(flowId)
  }, [flowId, loadFlow])

  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    },
    []
  )

  const persistGraph = useCallback(
    (nodes: Node[], edges: Edge[]) => {
      setGraph({ nodes, edges })
      setFlow((prev) =>
        prev
          ? {
              ...prev,
              nodes: JSON.stringify(nodes),
              edges: JSON.stringify(edges)
            }
          : prev
      )
      if (!flowId || !window.electronAPI?.flows) return
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => {
        void window.electronAPI.flows.update(flowId, {
          nodes: JSON.stringify(nodes),
          edges: JSON.stringify(edges)
        })
      }, 600)
    },
    [flowId]
  )

  const ensureFlow = async (): Promise<string | null> => {
    if (flowId) return flowId
    if (!projectId || !window.electronAPI?.flows) {
      toast.error('Cannot create flowchart without a project')
      return null
    }
    const result = await window.electronAPI.flows.create({
      projectId,
      title: title || 'Document flowchart',
      description: 'Embedded in System Design Document',
      category: 'process'
    })
    if (!result.success || !result.data) {
      toast.error(result.error ?? 'Failed to create flowchart')
      return null
    }
    updateAttributes({ flowId: result.data.id })
    setFlow(result.data)
    setGraph(parseGraph(result.data))
    return result.data.id
  }

  const startEditing = async () => {
    const id = await ensureFlow()
    if (!id) return
    setEditing(true)
  }

  const openInDesigner = async () => {
    const id = (await ensureFlow()) || flowId
    if (!id || !projectId) return
    navigate(`/project/${projectId}/flows/${id}`)
  }

  const blockHeight = Math.max(240, Number(height) || 360)

  return (
    <NodeViewWrapper
      as="div"
      className={cn(
        'doc-flow-block my-3 overflow-hidden rounded-lg border border-border/70 bg-card',
        selected && 'ring-2 ring-primary/30'
      )}
      data-type="flow-block"
      data-flow-id={flowId}
      data-title={title}
      data-height={String(blockHeight)}
      contentEditable={false}
    >
      <div className="flex items-center gap-2 border-b border-border/60 bg-muted/30 px-2 py-1.5">
        <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
        <input
          className="min-w-0 flex-1 bg-transparent text-[12px] font-medium outline-none"
          value={title}
          onChange={(e) => updateAttributes({ title: e.target.value })}
          onMouseDown={(e) => e.stopPropagation()}
        />
        <div className="flex items-center gap-0.5">
          {editing ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-[11px]"
              onClick={() => setEditing(false)}
            >
              <Minimize2 className="h-3.5 w-3.5" />
              Done
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-[11px]"
              onClick={() => void startEditing()}
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-[11px]"
            onClick={() => void openInDesigner()}
            title="Open in Flow Designer"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-[11px]"
            onClick={() => updateAttributes({ height: editing ? blockHeight + 80 : blockHeight })}
            title="Taller canvas"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-[11px] text-destructive"
            onClick={() => deleteNode()}
            title="Remove from document"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div style={{ height: blockHeight }} className="relative bg-background">
        {loading ? (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : editing ? (
          <CompactFlowCanvas
            initialNodes={graph.nodes}
            initialEdges={graph.edges}
            onChange={persistGraph}
            height={blockHeight}
          />
        ) : graph.nodes.length === 0 ? (
          <button
            type="button"
            className="flex h-full w-full flex-col items-center justify-center gap-2 text-[12px] text-muted-foreground hover:bg-muted/20"
            onClick={() => void startEditing()}
          >
            <GitBranch className="h-6 w-6 opacity-50" />
            <span>Click Edit to design this flowchart in the document</span>
          </button>
        ) : flow ? (
          <div className="h-full p-2">
            <FlowThumbnail flow={flow} className="h-full w-full" />
          </div>
        ) : null}
      </div>
    </NodeViewWrapper>
  )
}
