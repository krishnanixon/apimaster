export type FlowCategory =
  | 'process'
  | 'architecture'
  | 'api'
  | 'database'
  | 'uml'
  | 'bpmn'
  | 'journey'
  | 'requirements'

export type FlowNodeShape =
  | 'rectangle'
  | 'circle'
  | 'diamond'
  | 'rounded'
  | 'ellipse'
  | 'triangle'
  | 'hexagon'
  | 'parallelogram'
  | 'cylinder'
  | 'document'
  | 'terminal'
  | 'sticky'
  | 'swimlane'
  | 'group'

export type FlowEdgeType = 'straight' | 'smoothstep' | 'step' | 'bezier'

export type FlowLayoutEngine =
  | 'hierarchical'
  | 'vertical'
  | 'horizontal'
  | 'tree'
  | 'dag'

export type FlowTool = 'select' | 'pan' | 'connect' | 'eraser'

export interface FlowNodeMetadata {
  title: string
  description: string
  nodeType: string
  category: string
  color: string
  icon?: string
  status: string
  owner: string
  priority: string
  tags: string[]
  linkedRequirementId?: string
  linkedDocumentId?: string
  linkedEntityType?: string
  linkedEntityId?: string
  estimatedTime: string
  documentation: string
  notes: string
  aiSummary: string
  customFields: Record<string, string>
}

export interface FlowNodeData extends Partial<FlowNodeMetadata> {
  label: string
  shape?: FlowNodeShape
  collapsed?: boolean
  locked?: boolean
  hidden?: boolean
}

export interface FlowViewport {
  x: number
  y: number
  zoom: number
}

export interface FlowPanelLayout {
  leftWidth: number
  rightWidth: number
  leftCollapsed: boolean
  rightCollapsed: boolean
  rightTab: 'properties' | 'ai' | 'layers' | 'validation'
}

export interface FlowDiagram {
  id: string
  projectId: string
  title: string
  description: string
  category: FlowCategory
  nodes: string
  edges: string
  viewport: string
  layoutState: string
  isPinned: boolean
  createdAt: string
  updatedAt: string
}

export interface CreateFlowDiagramInput {
  projectId: string
  title?: string
  description?: string
  category?: FlowCategory
  nodes?: string
  edges?: string
}

export interface UpdateFlowDiagramInput {
  title?: string
  description?: string
  category?: FlowCategory
  nodes?: string
  edges?: string
  viewport?: string
  layoutState?: string
  isPinned?: boolean
}

export interface GenerateFlowInput {
  projectId: string
  prompt: string
  documentId?: string
  category?: FlowCategory
}

export interface ReverseFlowInput {
  projectId: string
  flowId: string
  outputType:
    | 'requirements'
    | 'user_stories'
    | 'acceptance_criteria'
    | 'api_spec'
    | 'database'
    | 'test_cases'
    | 'business_rules'
}

export interface FlowAIActionInput {
  projectId: string
  flowId: string
  action:
    | 'explain'
    | 'improve'
    | 'optimize'
    | 'bottlenecks'
    | 'missing_steps'
    | 'alternatives'
    | 'automation'
    | 'apis'
    | 'database'
    | 'complexity'
    | 'documentation'
  nodes: string
  edges: string
}

export interface GeneratedFlowResult {
  nodes: string
  edges: string
  summary?: string
}
