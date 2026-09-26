import dagre from 'dagre'
import type { Edge, Node } from '@xyflow/react'
import type { FlowLayoutEngine } from '@shared/types'

const NODE_WIDTH = 180
const NODE_HEIGHT = 64

export function applyAutoLayout(
  nodes: Node[],
  edges: Edge[],
  engine: FlowLayoutEngine = 'hierarchical'
): Node[] {
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))

  const rankdir =
    engine === 'horizontal' || engine === 'dag'
      ? 'LR'
      : engine === 'vertical' || engine === 'tree'
        ? 'TB'
        : 'TB'

  const ranksep = engine === 'tree' ? 50 : 80
  const nodesep = engine === 'tree' ? 40 : 60

  g.setGraph({ rankdir, nodesep, ranksep, marginx: 40, marginy: 40 })

  nodes.forEach((node) => {
    if (node.type === 'swimlane' || node.type === 'group') {
      g.setNode(node.id, {
        width: Number(node.style?.width) || 400,
        height: Number(node.style?.height) || 200
      })
    } else {
      g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT })
    }
  })

  edges.forEach((edge) => {
    g.setEdge(edge.source, edge.target)
  })

  dagre.layout(g)

  return nodes.map((node) => {
    const pos = g.node(node.id)
    if (!pos) return node
    const width =
      node.type === 'swimlane' || node.type === 'group'
        ? Number(node.style?.width) || 400
        : NODE_WIDTH
    const height =
      node.type === 'swimlane' || node.type === 'group'
        ? Number(node.style?.height) || 200
        : NODE_HEIGHT

    return {
      ...node,
      position: {
        x: pos.x - width / 2,
        y: pos.y - height / 2
      }
    }
  })
}
