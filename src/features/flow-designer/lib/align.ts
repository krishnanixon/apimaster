import type { Node } from '@xyflow/react'

const DEFAULT_W = 150
const DEFAULT_H = 64

function nodeSize(node: Node): { w: number; h: number } {
  if (node.type === 'swimlane' || node.type === 'group') {
    return {
      w: Number(node.style?.width) || 400,
      h: Number(node.style?.height) || 200
    }
  }
  if (node.data?.shape === 'circle') return { w: 120, h: 120 }
  if (node.data?.shape === 'diamond') return { w: 148, h: 148 }
  return { w: DEFAULT_W, h: DEFAULT_H }
}

export type AlignMode = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'
export type DistributeAxis = 'horizontal' | 'vertical'

export function alignNodes(nodes: Node[], selectedIds: string[], mode: AlignMode): Node[] {
  if (selectedIds.length < 2) return nodes
  const selected = nodes.filter((n) => selectedIds.includes(n.id))
  const bounds = selected.map((n) => {
    const { w, h } = nodeSize(n)
    return {
      id: n.id,
      left: n.position.x,
      right: n.position.x + w,
      top: n.position.y,
      bottom: n.position.y + h,
      cx: n.position.x + w / 2,
      cy: n.position.y + h / 2
    }
  })

  const minLeft = Math.min(...bounds.map((b) => b.left))
  const maxRight = Math.max(...bounds.map((b) => b.right))
  const minTop = Math.min(...bounds.map((b) => b.top))
  const maxBottom = Math.max(...bounds.map((b) => b.bottom))
  const centerX = (minLeft + maxRight) / 2
  const centerY = (minTop + maxBottom) / 2

  const posById = new Map<string, { x: number; y: number }>()

  for (const node of selected) {
    const { w, h } = nodeSize(node)
    let x = node.position.x
    let y = node.position.y
    if (mode === 'left') x = minLeft
    else if (mode === 'right') x = maxRight - w
    else if (mode === 'center') x = centerX - w / 2
    else if (mode === 'top') y = minTop
    else if (mode === 'bottom') y = maxBottom - h
    else if (mode === 'middle') y = centerY - h / 2
    posById.set(node.id, { x, y })
  }

  return nodes.map((n) => {
    const pos = posById.get(n.id)
    return pos ? { ...n, position: pos } : n
  })
}

export function distributeNodes(
  nodes: Node[],
  selectedIds: string[],
  axis: DistributeAxis
): Node[] {
  if (selectedIds.length < 3) return nodes
  const selected = [...nodes.filter((n) => selectedIds.includes(n.id))].sort((a, b) =>
    axis === 'horizontal' ? a.position.x - b.position.x : a.position.y - b.position.y
  )

  const first = selected[0]
  const last = selected[selected.length - 1]
  const { w: wL, h: hL } = nodeSize(last)

  const start = axis === 'horizontal' ? first.position.x : first.position.y
  const end =
    axis === 'horizontal'
      ? last.position.x + wL
      : last.position.y + hL
  const span = end - start
  const step = span / (selected.length - 1)

  const posById = new Map<string, { x: number; y: number }>()
  selected.forEach((node, i) => {
    const { w, h } = nodeSize(node)
    if (axis === 'horizontal') {
      posById.set(node.id, { x: start + step * i - (i === selected.length - 1 ? w : w / 2), y: node.position.y })
    } else {
      posById.set(node.id, { x: node.position.x, y: start + step * i - (i === selected.length - 1 ? h : h / 2) })
    }
  })

  return nodes.map((n) => {
    const pos = posById.get(n.id)
    return pos ? { ...n, position: pos } : n
  })
}
