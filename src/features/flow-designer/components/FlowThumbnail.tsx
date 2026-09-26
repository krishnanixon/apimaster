import { useMemo } from 'react'
import type { FlowDiagram } from '@shared/types'
import { cn } from '@/shared/lib/utils'

interface PreviewNode {
  id: string
  position: { x: number; y: number }
  width?: number
  height?: number
  data?: Record<string, unknown>
}

interface PreviewEdge {
  source: string
  target: string
}

const DEFAULT_COLOR = '#6366f1'
const NODE_W = 150
const NODE_H = 52

/** Dot-grid backdrop that mirrors the flow canvas aesthetic. */
const DOT_GRID_STYLE: React.CSSProperties = {
  backgroundImage:
    'radial-gradient(circle, hsl(var(--muted-foreground) / 0.35) 1px, transparent 1.4px)',
  backgroundSize: '11px 11px'
}

function computePreview(nodes: PreviewNode[], edges: PreviewEdge[]) {
  if (nodes.length === 0) return null

  const xs = nodes.map((n) => n.position.x)
  const ys = nodes.map((n) => n.position.y)
  const widths = nodes.map((n) => n.width ?? NODE_W)
  const heights = nodes.map((n) => n.height ?? NODE_H)
  const pad = 28
  const minX = Math.min(...xs) - pad
  const minY = Math.min(...ys) - pad
  const maxX = Math.max(...nodes.map((n, i) => n.position.x + widths[i])) + pad
  const maxY = Math.max(...nodes.map((n, i) => n.position.y + heights[i])) + pad
  const w = maxX - minX || 1
  const h = maxY - minY || 1

  const nodeById = new Map(nodes.map((n) => [n.id, n]))

  // When a template ships without explicit edges, connect nodes sequentially
  // so the preview still reads as a flow.
  const effectiveEdges =
    edges.length > 0
      ? edges
      : nodes.slice(0, -1).map((node, i) => ({ source: node.id, target: nodes[i + 1].id }))

  const lines = effectiveEdges
    .map((edge) => {
      const s = nodeById.get(edge.source)
      const t = nodeById.get(edge.target)
      if (!s || !t) return null
      const sw = s.width ?? NODE_W
      const sh = s.height ?? NODE_H
      const tw = t.width ?? NODE_W
      const th = t.height ?? NODE_H
      return {
        x1: s.position.x + sw / 2,
        y1: s.position.y + sh / 2,
        x2: t.position.x + tw / 2,
        y2: t.position.y + th / 2
      }
    })
    .filter(Boolean) as { x1: number; y1: number; x2: number; y2: number }[]

  return { viewBox: `${minX} ${minY} ${w} ${h}`, lines, strokeScale: Math.max(w, h) / 320 }
}

function NodeShape({ node, scale }: { node: PreviewNode; scale: number }) {
  const color = (node.data?.color as string | undefined) ?? DEFAULT_COLOR
  const w = node.width ?? NODE_W
  const h = node.height ?? NODE_H
  const x = node.position.x
  const y = node.position.y
  const shape = node.data?.shape as string | undefined
  const sw = Math.max(1.5, 2 * scale)
  const common = {
    fill: `${color}26`,
    stroke: color,
    strokeWidth: sw,
    strokeOpacity: 0.75
  }

  if (shape === 'circle' || shape === 'ellipse') {
    return <ellipse cx={x + w / 2} cy={y + h / 2} rx={w / 2} ry={h / 2} {...common} />
  }

  if (shape === 'diamond') {
    const cx = x + w / 2
    const cy = y + h / 2
    const points = `${cx},${y} ${x + w},${cy} ${cx},${y + h} ${x},${cy}`
    return <polygon points={points} {...common} />
  }

  return <rect x={x} y={y} width={w} height={h} rx={10 * scale} {...common} />
}

/** Renders a lightweight, canvas-like SVG preview from raw nodes/edges. */
export function MiniFlowPreview({
  nodes,
  edges = [],
  className
}: {
  nodes: PreviewNode[]
  edges?: PreviewEdge[]
  className?: string
}) {
  const preview = useMemo(() => computePreview(nodes, edges), [nodes, edges])

  return (
    <div
      className={cn(
        'relative w-full overflow-hidden rounded-lg border border-border/60 bg-gradient-to-br from-muted/40 to-muted/10',
        className
      )}
    >
      <div className="absolute inset-0 opacity-60" style={DOT_GRID_STYLE} />
      {preview ? (
        <svg
          viewBox={preview.viewBox}
          className="relative h-full w-full"
          preserveAspectRatio="xMidYMid meet"
        >
          {preview.lines.map((e, i) => (
            <line
              key={i}
              x1={e.x1}
              y1={e.y1}
              x2={e.x2}
              y2={e.y2}
              stroke="hsl(var(--muted-foreground))"
              strokeWidth={2 * preview.strokeScale}
              strokeOpacity={0.4}
              strokeLinecap="round"
            />
          ))}
          {nodes.map((n) => (
            <NodeShape key={n.id} node={n} scale={preview.strokeScale} />
          ))}
        </svg>
      ) : (
        <div className="flex h-full w-full items-center justify-center text-[11px] font-medium text-muted-foreground/70">
          Empty canvas
        </div>
      )}
    </div>
  )
}

interface FlowThumbnailProps {
  flow: FlowDiagram
  className?: string
}

export function FlowThumbnail({ flow, className }: FlowThumbnailProps) {
  const { nodes, edges } = useMemo(() => {
    try {
      return {
        nodes: JSON.parse(flow.nodes || '[]') as PreviewNode[],
        edges: JSON.parse(flow.edges || '[]') as PreviewEdge[]
      }
    } catch {
      return { nodes: [] as PreviewNode[], edges: [] as PreviewEdge[] }
    }
  }, [flow.nodes, flow.edges])

  return <MiniFlowPreview nodes={nodes} edges={edges} className={cn('h-28', className)} />
}
