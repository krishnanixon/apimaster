import { toPng, toSvg } from 'html-to-image'
import type { Edge, Node, Viewport } from '@xyflow/react'

export async function exportFlowToPng(element: HTMLElement, filename: string): Promise<void> {
  const dataUrl = await toPng(element, {
    backgroundColor: '#ffffff',
    pixelRatio: 2
  })
  downloadDataUrl(dataUrl, `${filename}.png`)
}

export async function exportFlowToSvg(element: HTMLElement, filename: string): Promise<void> {
  const dataUrl = await toSvg(element, { backgroundColor: '#ffffff' })
  downloadDataUrl(dataUrl, `${filename}.svg`)
}

export function exportFlowToJson(
  nodes: Node[],
  edges: Edge[],
  viewport: Viewport,
  filename: string
): void {
  const payload = { nodes, edges, viewport }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  downloadBlob(blob, `${filename}.json`)
}

export function exportFlowToMermaid(nodes: Node[], edges: Edge[]): string {
  const lines = ['flowchart TD']
  nodes.forEach((node) => {
    const label = String(node.data?.label ?? node.id).replace(/"/g, "'")
    const shape = node.data?.shape
    if (shape === 'diamond') {
      lines.push(`  ${sanitizeId(node.id)}{"${label}"}`)
    } else if (shape === 'circle') {
      lines.push(`  ${sanitizeId(node.id)}(("${label}"))`)
    } else {
      lines.push(`  ${sanitizeId(node.id)}["${label}"]`)
    }
  })
  edges.forEach((edge) => {
    const label = edge.data?.label ? `|${edge.data.label}|` : ''
    lines.push(`  ${sanitizeId(edge.source)} -->${label} ${sanitizeId(edge.target)}`)
  })
  return lines.join('\n')
}

export function importFlowFromJson(json: string): {
  nodes: Node[]
  edges: Edge[]
  viewport: Viewport
} {
  const parsed = JSON.parse(json) as {
    nodes: Node[]
    edges: Edge[]
    viewport?: Viewport
  }
  return {
    nodes: parsed.nodes ?? [],
    edges: parsed.edges ?? [],
    viewport: parsed.viewport ?? { x: 0, y: 0, zoom: 1 }
  }
}

function sanitizeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_]/g, '_')
}

function downloadDataUrl(dataUrl: string, filename: string): void {
  const link = document.createElement('a')
  link.download = filename
  link.href = dataUrl
  link.click()
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.download = filename
  link.href = url
  link.click()
  URL.revokeObjectURL(url)
}

export function printFlow(element: HTMLElement): void {
  const win = window.open('', '_blank')
  if (!win) return
  win.document.write(`<html><head><title>Print Flow</title></head><body>${element.outerHTML}</body></html>`)
  win.document.close()
  win.print()
}
