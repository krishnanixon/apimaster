/**
 * Server-safe SVG snapshot of a flow graph for document export.
 * Mirrors FlowThumbnail geometry without React.
 */

export interface FlowExportNode {
  id: string
  position: { x: number; y: number }
  width?: number
  height?: number
  data?: Record<string, unknown>
}

export interface FlowExportEdge {
  source: string
  target: string
  data?: { label?: string }
}

const NODE_W = 150
const NODE_H = 52

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function buildFlowDiagramSvg(
  nodes: FlowExportNode[],
  edges: FlowExportEdge[],
  title?: string
): string {
  if (nodes.length === 0) {
    const label = escapeXml(title || 'Empty flowchart')
    return `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="160" viewBox="0 0 640 160">
  <rect width="640" height="160" fill="#f8fafc" stroke="#e2e8f0"/>
  <text x="320" y="84" text-anchor="middle" fill="#94a3b8" font-family="Segoe UI, sans-serif" font-size="14">${label}</text>
</svg>`
  }

  const widths = nodes.map((n) => n.width ?? NODE_W)
  const heights = nodes.map((n) => n.height ?? NODE_H)
  const pad = 40
  const minX = Math.min(...nodes.map((n) => n.position.x)) - pad
  const minY = Math.min(...nodes.map((n) => n.position.y)) - pad
  const maxX = Math.max(...nodes.map((n, i) => n.position.x + widths[i])) + pad
  const maxY = Math.max(...nodes.map((n, i) => n.position.y + heights[i])) + pad
  const w = Math.max(320, maxX - minX)
  const h = Math.max(180, maxY - minY)
  const byId = new Map(nodes.map((n) => [n.id, n]))

  const effectiveEdges =
    edges.length > 0
      ? edges
      : nodes.slice(0, -1).map((node, i) => ({ source: node.id, target: nodes[i + 1].id }))

  const lines = effectiveEdges
    .map((edge) => {
      const s = byId.get(edge.source)
      const t = byId.get(edge.target)
      if (!s || !t) return ''
      const sw = s.width ?? NODE_W
      const sh = s.height ?? NODE_H
      const tw = t.width ?? NODE_W
      const th = t.height ?? NODE_H
      const x1 = s.position.x + sw / 2
      const y1 = s.position.y + sh / 2
      const x2 = t.position.x + tw / 2
      const y2 = t.position.y + th / 2
      return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#94a3b8" stroke-width="2" stroke-linecap="round"/>`
    })
    .join('\n')

  const rects = nodes
    .map((n, i) => {
      const color = String(n.data?.color ?? '#6366f1')
      const label = escapeXml(String(n.data?.label ?? n.id))
      const nw = widths[i]
      const nh = heights[i]
      return `<g>
  <rect x="${n.position.x}" y="${n.position.y}" width="${nw}" height="${nh}" rx="8" fill="#ffffff" stroke="${escapeXml(color)}" stroke-width="2"/>
  <text x="${n.position.x + nw / 2}" y="${n.position.y + nh / 2 + 4}" text-anchor="middle" fill="#0f172a" font-family="Segoe UI, sans-serif" font-size="12">${label}</text>
</g>`
    })
    .join('\n')

  const titleBar = title
    ? `<text x="${minX + 8}" y="${minY + 18}" fill="#64748b" font-family="Segoe UI, sans-serif" font-size="12">${escapeXml(title)}</text>`
    : ''

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(w)}" height="${Math.round(h)}" viewBox="${minX} ${minY} ${w} ${h}">
  <rect x="${minX}" y="${minY}" width="${w}" height="${h}" fill="#ffffff"/>
  ${titleBar}
  ${lines}
  ${rects}
</svg>`
}

export function flowSvgToDataUrl(svg: string): string {
  const base64 =
    typeof Buffer !== 'undefined'
      ? Buffer.from(svg, 'utf8').toString('base64')
      : typeof btoa === 'function'
        ? btoa(unescape(encodeURIComponent(svg)))
        : ''
  return `data:image/svg+xml;base64,${base64}`
}
