export type FlowIssueSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

export type FlowValidationIssueType =
  | 'UNREACHABLE_NODE'
  | 'MISSING_ERROR_PATH'
  | 'INCOMPLETE_DESIGN'
  | 'ORPHAN_NODE'
  | 'DEAD_END'
  | 'MISSING_ENTRY'
  | 'MISSING_EXIT'
  | 'UNSAFE_CYCLE'
  | 'INCOMPLETE_BRANCH'

export interface FlowValidationIssue {
  type: FlowValidationIssueType
  severity: FlowIssueSeverity
  node?: string
  description: string
}

export interface FlowValidationResult {
  validationScore: number
  issues: FlowValidationIssue[]
}

export type MissingFlowCategory =
  | 'authentication'
  | 'authorization'
  | 'error_handling'
  | 'retry_fallback'
  | 'timeout'
  | 'validation'
  | 'async_completion'
  | 'empty_state'
  | 'compensation'

export interface MissingFlowSuggestion {
  category: MissingFlowCategory
  severity: FlowIssueSeverity
  description: string
  suggestedNodes: string[]
}

export type FlowComplexityLevel = 'SIMPLE' | 'MEDIUM' | 'COMPLEX'

export interface FlowComplexityResult {
  complexityScore: number
  level: FlowComplexityLevel
  factors: {
    nodeCount: number
    edgeDensity: number
    branchingFactor: number
    externalDependencies: number
  }
  reasoning: string
}

export interface FlowExplanationSection {
  title: string
  content: string
}

export interface FlowExplanationResult {
  summary: string
  normalFlow: string[]
  alternativeFlows: string[]
  failureFlows: string[]
  decisionPoints: FlowExplanationSection[]
  dataMovement: FlowExplanationSection[]
  externalDependencies: string[]
  executionSequence: string[]
}

export interface FlowApiEndpoint {
  nodeId: string
  name: string
  method: string
  path: string
  description: string
  requiresAuth: boolean
  requestSchema: Record<string, unknown>
  responseSchema: Record<string, unknown>
  errorResponses: Array<{ status: number; description: string }>
}

export interface FlowDatabaseTable {
  name: string
  description: string
  fields: Array<{
    name: string
    type: string
    primaryKey?: boolean
    foreignKey?: string
    indexed?: boolean
    nullable?: boolean
  }>
  relationships: Array<{ table: string; type: string; field: string }>
}

export interface FlowServiceModule {
  name: string
  path: string
  description: string
  dependencies: string[]
}

export interface FlowArchitectureResult {
  apis: FlowApiEndpoint[]
  database: {
    tables: FlowDatabaseTable[]
    indexSuggestions: string[]
  }
  services: {
    controllers: FlowServiceModule[]
    services: FlowServiceModule[]
    repositories: FlowServiceModule[]
    models: FlowServiceModule[]
    utils: FlowServiceModule[]
    asyncJobs: string[]
    eventDriven: string[]
  }
}

export interface FlowAnalysisResult {
  validation: FlowValidationResult
  missingFlows: MissingFlowSuggestion[]
  complexity: FlowComplexityResult
}

export interface AnalyzeFlowInput {
  projectId: string
  flowId: string
  nodes: string
  edges: string
}

export interface GenerateFlowArchitectureInput {
  projectId: string
  flowId: string
  nodes: string
  edges: string
}

export interface ExplainFlowInput {
  projectId: string
  flowId: string
  nodes: string
  edges: string
}

export interface RequirementFlowGap {
  id: string
  title: string
  kind: 'requirement' | 'feature'
  reason: string
  severity: FlowIssueSeverity
}

export interface RequirementCoverageResult {
  totalRequirements: number
  totalFeatures: number
  coveredCount: number
  coveragePercent: number
  uncovered: RequirementFlowGap[]
}

export interface FlowRequirementCoverageInput {
  projectId: string
  flowId: string
  nodes: string
  edges: string
}
