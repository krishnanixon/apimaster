import type { Edge, Node, Viewport } from '@xyflow/react'
import type { FlowCategory } from '@shared/types'
import { v4 as uuidv4 } from 'uuid'

export interface FlowTemplate {
  id: string
  title: string
  description: string
  category: FlowCategory
  nodes: Node[]
  edges: Edge[]
}

function n(
  label: string,
  x: number,
  y: number,
  shape = 'rounded',
  nodeType = 'process',
  category = 'flowchart',
  color = '#6366f1'
): Node {
  return {
    id: uuidv4(),
    type: 'flowNode',
    position: { x, y },
    data: { label, shape, nodeType, category, color, status: 'draft', priority: 'medium', tags: [] }
  }
}

function e(source: string, target: string, label = ''): Edge {
  return {
    id: uuidv4(),
    source,
    target,
    type: 'labeled',
    data: { label }
  }
}

function build(
  nodes: Node[],
  links: Array<[number, number, string?]>
): { nodes: Node[]; edges: Edge[] } {
  return {
    nodes,
    edges: links.map(([from, to, label]) => e(nodes[from].id, nodes[to].id, label ?? ''))
  }
}

const auth = (() => {
  const nodes = [
    n('Start', 0, 80, 'circle', 'start', 'flowchart', '#22c55e'),
    n('Login', 220, 80),
    n('Validate credentials', 440, 80),
    n('Valid?', 660, 80, 'diamond', 'decision', 'flowchart', '#f59e0b'),
    n('Create session', 900, 0),
    n('Show error', 900, 180, 'rounded', 'process', 'flowchart', '#ef4444'),
    n('End', 1120, 80, 'circle', 'end', 'flowchart', '#ef4444')
  ]
  return build(nodes, [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 4, 'Yes'],
    [3, 5, 'No'],
    [4, 6],
    [5, 1, 'Retry']
  ])
})()

const checkout = (() => {
  const nodes = [
    n('Browse products', 0, 80),
    n('Add to cart', 220, 80),
    n('Checkout', 440, 80),
    n('Payment', 660, 80),
    n('Payment ok?', 880, 80, 'diamond', 'decision', 'flowchart', '#f59e0b'),
    n('Confirm order', 1100, 0, 'rounded', 'process', 'flowchart', '#22c55e'),
    n('Payment failed', 1100, 180, 'rounded', 'process', 'flowchart', '#ef4444'),
    n('Notify customer', 1320, 0)
  ]
  return build(nodes, [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 4],
    [4, 5, 'Success'],
    [4, 6, 'Failure'],
    [5, 7]
  ])
})()

const microservices = (() => {
  const nodes = [
    n('Client', 0, 120, 'rounded', 'actor', 'uml', '#8b5cf6'),
    n('API gateway', 240, 120, 'diamond', 'gateway', 'api', '#8b5cf6'),
    n('Auth service', 500, 0, 'rounded', 'service', 'api', '#6366f1'),
    n('Order service', 500, 120, 'rounded', 'service', 'api', '#6366f1'),
    n('Payment service', 500, 240, 'rounded', 'service', 'api', '#6366f1'),
    n('Message queue', 760, 120, 'rounded', 'queue', 'api', '#64748b'),
    n('Database', 1000, 120, 'cylinder', 'database', 'database', '#0891b2')
  ]
  return build(nodes, [
    [0, 1],
    [1, 2],
    [1, 3],
    [1, 4],
    [3, 5],
    [4, 5],
    [3, 6],
    [4, 6]
  ])
})()

const registration = (() => {
  const nodes = [
    n('Registration form', 0, 80),
    n('Validate input', 240, 80),
    n('Valid?', 480, 80, 'diamond', 'decision', 'flowchart', '#f59e0b'),
    n('Create account', 720, 0),
    n('Show errors', 720, 180, 'rounded', 'process', 'flowchart', '#ef4444'),
    n('Send verification', 960, 0),
    n('Activate account', 1200, 0, 'rounded', 'process', 'flowchart', '#22c55e')
  ]
  return build(nodes, [
    [0, 1],
    [1, 2],
    [2, 3, 'Yes'],
    [2, 4, 'No'],
    [3, 5],
    [5, 6]
  ])
})()

const crm = (() => {
  const nodes = [
    n('Lead capture', 0, 80),
    n('Qualify lead', 240, 80),
    n('Qualified?', 480, 80, 'diamond', 'decision', 'flowchart', '#f59e0b'),
    n('Assign sales rep', 720, 0),
    n('Nurture / archive', 720, 180, 'rounded', 'process', 'flowchart', '#64748b'),
    n('Follow up', 960, 0),
    n('Convert to customer', 1200, 0, 'rounded', 'process', 'flowchart', '#22c55e')
  ]
  return build(nodes, [
    [0, 1],
    [1, 2],
    [2, 3, 'Yes'],
    [2, 4, 'No'],
    [3, 5],
    [5, 6]
  ])
})()

const journey = (() => {
  const nodes = [
    n('Discover', 0, 80, 'rounded', 'process', 'flowchart', '#8b5cf6'),
    n('Sign up', 220, 80),
    n('First value', 440, 80, 'rounded', 'process', 'flowchart', '#6366f1'),
    n('Habit loop', 660, 80),
    n('Upgrade?', 880, 80, 'diamond', 'decision', 'flowchart', '#f59e0b'),
    n('Paid plan', 1100, 0, 'rounded', 'process', 'flowchart', '#22c55e'),
    n('Stay free', 1100, 180, 'rounded', 'process', 'flowchart', '#64748b')
  ]
  return build(nodes, [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 4],
    [4, 5, 'Yes'],
    [4, 6, 'Later']
  ])
})()

export const FLOW_TEMPLATES: FlowTemplate[] = [
  {
    id: 'auth-flow',
    title: 'Authentication',
    description: 'Login, validation, retry, and session',
    category: 'process',
    ...auth
  },
  {
    id: 'ecommerce-checkout',
    title: 'Checkout',
    description: 'Cart through payment success and failure',
    category: 'process',
    ...checkout
  },
  {
    id: 'microservices',
    title: 'Microservices',
    description: 'Gateway, services, queue, and database',
    category: 'architecture',
    ...microservices
  },
  {
    id: 'user-registration',
    title: 'Registration',
    description: 'Sign up with validation and verification',
    category: 'process',
    ...registration
  },
  {
    id: 'crm-lead',
    title: 'Lead management',
    description: 'Capture, qualify, and convert',
    category: 'process',
    ...crm
  },
  {
    id: 'user-journey',
    title: 'User journey',
    description: 'Discover, activate, and convert',
    category: 'journey',
    ...journey
  }
]

export function getTemplateById(id: string): FlowTemplate | undefined {
  return FLOW_TEMPLATES.find((t) => t.id === id)
}

export function templateToPayload(template: FlowTemplate): {
  nodes: Node[]
  edges: Edge[]
  viewport: Viewport
} {
  const nodes = template.nodes.map((node) => ({ ...node, id: uuidv4() }))
  const idMap = new Map(template.nodes.map((orig, i) => [orig.id, nodes[i].id]))

  const edges = template.edges.map((edge) => ({
    ...edge,
    id: uuidv4(),
    source: idMap.get(edge.source) ?? edge.source,
    target: idMap.get(edge.target) ?? edge.target
  }))

  return { nodes, edges, viewport: { x: 0, y: 0, zoom: 1 } }
}
