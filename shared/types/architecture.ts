/**
 * Architecture Designer — domain model.
 *
 * The model is the source of truth, not the canvas. Every diagram view is a
 * projection of this structure, which is what lets one architecture render as a
 * context diagram, a deployment diagram or an ER diagram without duplicating
 * data — and lets the AI reason over typed entities instead of coordinates.
 */

/* ------------------------------------------------------------------ taxonomy */

export type ArchComponentCategory =
  | 'application'
  | 'backend'
  | 'database'
  | 'infrastructure'
  | 'integration'
  | 'ai'

/** Concrete component kinds, grouped by `ArchComponentCategory`. */
export type ArchComponentKind =
  // application
  | 'web-app'
  | 'mobile-app'
  | 'desktop-app'
  | 'admin-panel'
  | 'client-app'
  // backend
  | 'api-gateway'
  | 'backend-service'
  | 'microservice'
  | 'monolith'
  | 'worker'
  | 'background-job'
  | 'scheduler'
  | 'serverless-function'
  // database
  | 'postgresql'
  | 'mysql'
  | 'mongodb'
  | 'redis'
  | 'elasticsearch'
  | 'vector-db'
  | 'object-storage'
  // infrastructure
  | 'server'
  | 'vps'
  | 'aws'
  | 'cloudflare'
  | 'cdn'
  | 'load-balancer'
  | 'kubernetes'
  | 'docker'
  | 'container'
  | 'queue'
  // integration
  | 'payment-gateway'
  | 'email-service'
  | 'sms-service'
  | 'notification-service'
  | 'auth-provider'
  | 'third-party-api'
  | 'sap'
  | 'crm'
  | 'erp'
  | 'ai-provider'
  // ai
  | 'llm'
  | 'ai-agent'
  | 'embedding-model'
  | 'vector-store'
  | 'rag-pipeline'
  | 'ai-gateway'

export type ArchConnectionKind =
  | 'http'
  | 'https'
  | 'rest'
  | 'graphql'
  | 'websocket'
  | 'tcp'
  | 'grpc'
  | 'database'
  | 'event'
  | 'message-queue'
  | 'auth'
  | 'data-flow'
  | 'dependency'

/** Diagram views. Each is a filtered projection of the same model. */
export type ArchViewId =
  | 'system-context'
  | 'container'
  | 'component'
  | 'application'
  | 'backend'
  | 'database'
  | 'api'
  | 'data-flow'
  | 'infrastructure'
  | 'deployment'
  | 'security'
  | 'cloud'
  | 'integration'
  | 'sequence'
  | 'er'

/** Left-rail workspace sections. */
export type ArchSectionId =
  | 'overview'
  | 'requirements'
  | 'ai-architect'
  | 'architecture'
  | 'components'
  | 'services'
  | 'data-flow'
  | 'api'
  | 'database'
  | 'integrations'
  | 'security'
  | 'infrastructure'
  | 'deployment'
  | 'environments'
  | 'validation'
  | 'documentation'
  | 'versions'

export type ArchSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info'

/* ---------------------------------------------------------------- structures */

export interface ArchPosition {
  x: number
  y: number
}

export interface ArchApiEndpoint {
  id: string
  method: string
  path: string
  description?: string
  auth?: string
}

export interface ArchComponentSecurity {
  authentication?: string
  authorization?: string
  encryption?: string
  notes?: string
}

export interface ArchComponent {
  id: string
  name: string
  kind: ArchComponentKind
  category: ArchComponentCategory
  description: string
  technology: string
  responsibilities: string[]
  inputs: string[]
  outputs: string[]
  /** Component ids this one depends on. Derived edges are kept in `connections`. */
  dependencies: string[]
  apis: ArchApiEndpoint[]
  datastores: string[]
  security: ArchComponentSecurity
  environments: string[]
  config: Record<string, string>
  tags: string[]
  notes: string
  groupId?: string
  /** Which views this component appears in. Empty means "all applicable". */
  views: ArchViewId[]
  /** Per-view canvas placement — presentation only, never semantics. */
  layout: Partial<Record<ArchViewId, ArchPosition>>
}

export interface ArchConnection {
  id: string
  from: string
  to: string
  kind: ArchConnectionKind
  label: string
  description: string
  protocol: string
  /** Synchronous request/response vs fire-and-forget. */
  async: boolean
  bidirectional: boolean
  auth: string
  dataShape: string
  views: ArchViewId[]
}

export interface ArchGroup {
  id: string
  name: string
  description: string
  /** e.g. "vpc", "cluster", "layer", "boundary" */
  kind: string
  color?: string
  collapsed?: boolean
}

export interface ArchTechnology {
  id: string
  layer: string
  name: string
  rationale: string
  /** AI proposals start as 'suggested' until the user accepts one. */
  status: 'suggested' | 'accepted' | 'rejected'
  alternatives: string[]
}

export interface ArchEnvironment {
  id: string
  name: string
  description: string
  variables: Record<string, string>
}

export interface ArchDecision {
  id: string
  title: string
  context: string
  decision: string
  consequences: string
  createdAt: string
}

export interface ArchModelMetadata {
  name: string
  systemType: string
  description: string
  requirements: string
  /** Project documents linked as source material for AI generation. */
  linkedDocumentIds: string[]
  /** System Design Document generated from this architecture (if any). */
  linkedSddDocumentId?: string
  updatedAt: string
}

export interface ArchitectureModel {
  /** Bumped when the model shape changes so old records can be migrated. */
  version: number
  metadata: ArchModelMetadata
  components: ArchComponent[]
  connections: ArchConnection[]
  groups: ArchGroup[]
  technologies: ArchTechnology[]
  environments: ArchEnvironment[]
  decisions: ArchDecision[]
}

/* -------------------------------------------------------- validation & score */

export interface ArchIssue {
  id: string
  severity: ArchSeverity
  title: string
  /** Why this matters, in plain language. */
  impact: string
  componentIds: string[]
  recommendation: string
  /** Actions that resolve the issue when applied. */
  fix?: ArchitectureAction[]
}

export interface ArchScore {
  overall: number
  scalability: number
  security: number
  performance: number
  reliability: number
  maintainability: number
  costEfficiency: number
}

export interface ArchValidationResult {
  issues: ArchIssue[]
  score: ArchScore
  checkedAt: string
}

/* ------------------------------------------------------------ action system */

/**
 * Every mutation — manual or AI — is expressed as one of these. Keeping them
 * data rather than imperative calls is what makes AI changes previewable,
 * approvable and reversible.
 */
export type ArchitectureAction =
  | { type: 'ADD_COMPONENT'; component: Partial<ArchComponent> & { name: string; kind: ArchComponentKind } }
  | { type: 'REMOVE_COMPONENT'; componentId: string }
  | { type: 'UPDATE_COMPONENT'; componentId: string; patch: Partial<ArchComponent> }
  | { type: 'MOVE_COMPONENT'; componentId: string; view: ArchViewId; position: ArchPosition }
  | { type: 'CONNECT_COMPONENTS'; connection: Partial<ArchConnection> & { from: string; to: string } }
  | { type: 'DISCONNECT_COMPONENTS'; connectionId: string }
  | { type: 'UPDATE_CONNECTION'; connectionId: string; patch: Partial<ArchConnection> }
  | { type: 'ADD_GROUP'; group: Partial<ArchGroup> & { name: string } }
  | { type: 'REMOVE_GROUP'; groupId: string }
  | { type: 'GROUP_COMPONENTS'; groupId: string; componentIds: string[] }
  | { type: 'CHANGE_TECHNOLOGY'; componentId: string; technology: string }
  | { type: 'ADD_TECHNOLOGY'; technology: Partial<ArchTechnology> & { layer: string; name: string } }
  | { type: 'UPDATE_TECHNOLOGY'; technologyId: string; patch: Partial<ArchTechnology> }
  | { type: 'ADD_API'; componentId: string; api: Partial<ArchApiEndpoint> & { method: string; path: string } }
  | { type: 'REMOVE_API'; componentId: string; apiId: string }
  | { type: 'ADD_ENVIRONMENT'; environment: Partial<ArchEnvironment> & { name: string } }
  | { type: 'REMOVE_ENVIRONMENT'; environmentId: string }
  | { type: 'ADD_DECISION'; decision: Partial<ArchDecision> & { title: string } }
  | { type: 'UPDATE_METADATA'; patch: Partial<ArchModelMetadata> }

export type ArchitectureActionType = ArchitectureAction['type']

/** An AI proposal the user can inspect before it touches the model. */
export interface ArchActionProposal {
  id: string
  summary: string
  rationale: string
  actions: ArchitectureAction[]
}

/* --------------------------------------------------------------- persistence */

export interface ArchitectureDiagram {
  id: string
  projectId: string
  title: string
  description: string
  systemType: string
  /** Serialized `ArchitectureModel`. */
  model: string
  /** Serialized editor view state (active view, panel widths). */
  viewState: string
  /** Serialized `ArchitectureVersion[]`. */
  versions: string
  isPinned: boolean
  createdAt: string
  updatedAt: string
}

export interface ArchitectureVersion {
  id: string
  label: string
  createdAt: string
  summary: string
  model: ArchitectureModel
}

export interface CreateArchitectureDiagramInput {
  projectId: string
  title?: string
  description?: string
  systemType?: string
  model?: string
}

export interface UpdateArchitectureDiagramInput {
  title?: string
  description?: string
  systemType?: string
  model?: string
  viewState?: string
  versions?: string
  isPinned?: boolean
}

/* ------------------------------------------------------------------- AI I/O */

export interface GenerateArchitectureInput {
  projectId: string
  prompt: string
  systemType?: string
  /** Project documents to read as source material. */
  documentIds?: string[]
  /** Pull the project knowledge base in alongside the documents. */
  includeKnowledge?: boolean
}

export interface GeneratedArchitectureResult {
  /** Serialized `ArchitectureModel`. */
  model: string
  summary: string
  /** Titles of the documents that were actually read, for display. */
  sources: string[]
}

export interface ArchitectureAssistantInput {
  projectId: string
  instruction: string
  /** Serialized `ArchitectureModel` the AI should reason about. */
  model: string
  documentIds?: string[]
  includeKnowledge?: boolean
}

export interface ArchitectureAssistantResult {
  summary: string
  rationale: string
  /** Serialized `ArchitectureAction[]` awaiting user approval. */
  actions: string
}
