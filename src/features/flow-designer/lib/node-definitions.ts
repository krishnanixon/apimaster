import type { Node } from '@xyflow/react'
import type { FlowNodeShape } from '@shared/types'

export interface NodeLibraryItem {
  id: string
  label: string
  category: string
  nodeType: string
  shape: FlowNodeShape
  icon: string
  color: string
  description?: string
}

export interface NodeLibraryCategory {
  id: string
  label: string
  items: NodeLibraryItem[]
}

const item = (
  id: string,
  label: string,
  category: string,
  nodeType: string,
  shape: FlowNodeShape,
  icon: string,
  color: string,
  description?: string
): NodeLibraryItem => ({ id, label, category, nodeType, shape, icon, color, description })

export const NODE_LIBRARY: NodeLibraryCategory[] = [
  {
    id: 'basic',
    label: 'Shapes',
    items: [
      item('rect', 'Rectangle', 'basic', 'rectangle', 'rectangle', 'Square', '#64748b'),
      item('circle', 'Circle', 'basic', 'circle', 'circle', 'Circle', '#64748b'),
      item('diamond', 'Diamond', 'basic', 'diamond', 'diamond', 'Diamond', '#64748b'),
      item('rounded', 'Rounded', 'basic', 'rounded', 'rounded', 'Square', '#64748b'),
      item('ellipse', 'Ellipse', 'basic', 'ellipse', 'ellipse', 'Circle', '#64748b'),
      item('sticky', 'Sticky note', 'basic', 'sticky', 'sticky', 'StickyNote', '#fbbf24', 'Annotation on the canvas'),
      item('text', 'Text', 'basic', 'text', 'rectangle', 'Type', '#94a3b8', 'Free-form label'),
      item('group', 'Sub flow', 'basic', 'group', 'group', 'Layers', '#6366f1', 'Group nodes into a container')
    ]
  },
  {
    id: 'flowchart',
    label: 'Flowchart',
    items: [
      item('start', 'Start', 'flowchart', 'start', 'circle', 'Play', '#22c55e'),
      item('end', 'End', 'flowchart', 'end', 'circle', 'Square', '#ef4444'),
      item('process', 'Process', 'flowchart', 'process', 'rounded', 'Cog', '#6366f1'),
      item('decision', 'Decision', 'flowchart', 'decision', 'diamond', 'GitBranch', '#f59e0b'),
      item('subprocess', 'Sub process', 'flowchart', 'subprocess', 'rounded', 'Workflow', '#6366f1'),
      item('manual', 'Manual input', 'flowchart', 'manual', 'parallelogram', 'Keyboard', '#8b5cf6'),
      item('document', 'Document', 'flowchart', 'document', 'document', 'FileText', '#64748b'),
      item('database', 'Database', 'flowchart', 'database', 'cylinder', 'Database', '#0891b2'),
      item('delay', 'Delay', 'flowchart', 'delay', 'rounded', 'Clock', '#64748b'),
      item('connector', 'Connector', 'flowchart', 'connector', 'circle', 'Link', '#64748b')
    ]
  },
  {
    id: 'architecture',
    label: 'Architecture',
    items: [
      item('api-endpoint', 'API endpoint', 'api', 'endpoint', 'rounded', 'Globe', '#8b5cf6'),
      item('api-service', 'Service', 'api', 'service', 'rounded', 'Server', '#8b5cf6'),
      item('api-gateway', 'Gateway', 'api', 'gateway', 'diamond', 'Network', '#8b5cf6'),
      item('api-queue', 'Queue', 'api', 'queue', 'rounded', 'List', '#8b5cf6'),
      item('api-cache', 'Cache', 'api', 'cache', 'rounded', 'HardDrive', '#8b5cf6'),
      item('api-auth', 'Auth', 'api', 'auth', 'rounded', 'Shield', '#8b5cf6'),
      item('api-external', 'External', 'api', 'external', 'rounded', 'ExternalLink', '#8b5cf6'),
      item('api-lb', 'Load balancer', 'api', 'loadBalancer', 'rounded', 'Scale', '#8b5cf6')
    ]
  },
  {
    id: 'requirements',
    label: 'Requirements',
    items: [
      item('req-functional', 'Functional', 'requirements', 'functionalRequirement', 'rounded', 'CheckCircle', '#059669'),
      item('req-nfr', 'Non-functional', 'requirements', 'nonFunctionalRequirement', 'rounded', 'Gauge', '#059669'),
      item('req-feature', 'Feature', 'requirements', 'feature', 'rounded', 'Sparkles', '#059669'),
      item('req-story', 'User story', 'requirements', 'userStory', 'rounded', 'BookOpen', '#059669'),
      item('req-decision', 'Decision', 'requirements', 'decision', 'diamond', 'GitBranch', '#6366f1'),
      item('req-risk', 'Risk', 'requirements', 'risk', 'diamond', 'AlertTriangle', '#f59e0b')
    ]
  }
]

export const DEFAULT_NODE_DATA = {
  status: 'draft',
  owner: '',
  priority: 'medium',
  tags: [] as string[],
  estimatedTime: '',
  documentation: '',
  notes: '',
  aiSummary: '',
  customFields: {} as Record<string, string>
}

export const LIBRARY_ORDER_BY_FLOW: Record<string, string[]> = {
  process: ['flowchart', 'basic', 'architecture', 'requirements'],
  journey: ['flowchart', 'basic', 'requirements', 'architecture'],
  architecture: ['architecture', 'flowchart', 'basic', 'requirements'],
  api: ['architecture', 'flowchart', 'basic', 'requirements'],
  database: ['architecture', 'flowchart', 'basic', 'requirements'],
  requirements: ['requirements', 'flowchart', 'basic', 'architecture'],
  uml: ['architecture', 'flowchart', 'basic', 'requirements'],
  bpmn: ['flowchart', 'basic', 'architecture', 'requirements']
}

export function createFlowNodeFromItem(
  item: Pick<NodeLibraryItem, 'label' | 'nodeType' | 'category' | 'shape' | 'icon' | 'color'>,
  position: { x: number; y: number },
  id = `node-${Date.now()}`
): Node {
  const isGroup = item.nodeType === 'group' || item.nodeType === 'container' || item.shape === 'group'
  const isSwimlane = item.shape === 'swimlane' || item.nodeType === 'pool' || item.nodeType === 'lane'
  const isText = item.nodeType === 'text'

  return {
    id,
    type: isSwimlane ? 'swimlane' : isGroup ? 'group' : isText ? 'text' : 'flowNode',
    position,
    selected: true,
    data: {
      label: item.label,
      nodeType: item.nodeType,
      category: item.category,
      shape: item.shape,
      icon: item.icon,
      color: item.color,
      ...DEFAULT_NODE_DATA
    },
    ...(isSwimlane || isGroup ? { style: { width: 400, height: 200 }, zIndex: -1 } : {})
  }
}
