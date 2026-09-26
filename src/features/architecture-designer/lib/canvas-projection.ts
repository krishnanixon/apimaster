import { MarkerType, type Edge, type Node } from '@xyflow/react'
import type { ArchComponent, ArchViewId, ArchitectureModel } from '@shared/types/architecture'
import { getComponentKindMeta, getConnectionKindMeta } from '@shared/lib/architecture-catalog'
import { componentsForView, connectionsForView, ensureLayout } from '@shared/lib/architecture-model'

export const ARCH_NODE_TYPE = 'archComponent'

export interface ArchNodeData extends Record<string, unknown> {
  name: string
  kind: ArchComponent['kind']
  category: ArchComponent['category']
  technology: string
  description: string
  color: string
  icon: string
}

export function projectArchitectureCanvas(
  model: ArchitectureModel,
  view: ArchViewId,
  selectedComponentIds: string[],
  selectedConnectionId: string | null
): { nodes: Node<ArchNodeData>[]; edges: Edge[] } {
  const components = componentsForView(model, view)
  const positions = ensureLayout(components, view)
  const selected = new Set(selectedComponentIds)

  const nodes: Node<ArchNodeData>[] = components.map((component) => {
    const meta = getComponentKindMeta(component.kind)
    const color = meta?.color ?? '#64748b'
    return {
      id: component.id,
      type: ARCH_NODE_TYPE,
      position: positions.get(component.id) ?? { x: 80, y: 80 },
      selected: selected.has(component.id),
      data: {
        name: component.name,
        kind: component.kind,
        category: component.category,
        technology: component.technology,
        description: component.description,
        color,
        icon: meta?.icon ?? 'Box'
      }
    }
  })

  const edges: Edge[] = connectionsForView(model, view).map((connection) => {
    const meta = getConnectionKindMeta(connection.kind)
    const color = meta?.color ?? '#94a3b8'
    return {
      id: connection.id,
      source: connection.from,
      target: connection.to,
      type: 'smoothstep',
      selected: connection.id === selectedConnectionId,
      label: connection.label || meta?.label || connection.kind,
      animated: connection.async || Boolean(meta?.async),
      style: {
        stroke: color,
        strokeWidth: connection.id === selectedConnectionId ? 2.5 : 1.6,
        strokeDasharray: meta?.dashed ? '6 4' : undefined
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color,
        width: 16,
        height: 16
      }
    }
  })

  return { nodes, edges }
}
