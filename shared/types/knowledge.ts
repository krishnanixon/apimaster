export type KnowledgeSection =
  | 'overview'
  | 'business'
  | 'stakeholders'
  | 'roles'
  | 'modules'
  | 'features'
  | 'requirements'
  | 'nfr'
  | 'business-rules'
  | 'workflows'
  | 'database'
  | 'apis'
  | 'integrations'
  | 'reports'
  | 'risks'
  | 'assumptions'
  | 'decisions'
  | 'documents'

export type RequirementType = 'functional' | 'non_functional'

export interface RequirementKnowledge {
  id: string
  projectId: string
  projectSummary: string
  businessType: string
  industry: string
  targetUsers: string
  goals: string
  scope: string
  outOfScope: string
  vision: string
  objectives: string
  notes: string
  createdAt: string
  updatedAt: string
}

export interface Stakeholder {
  id: string
  projectId: string
  name: string
  role: string
  responsibilities: string
  contactNotes: string
  sortOrder: number
  notes: string
  deletedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface KnowledgeModule {
  id: string
  projectId: string
  title: string
  description: string
  priority: string
  status: string
  sortOrder: number
  notes: string
  deletedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface KnowledgeFeature {
  id: string
  projectId: string
  moduleId: string | null
  title: string
  description: string
  complexity: string
  priority: string
  status: string
  sortOrder: number
  notes: string
  deletedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface KnowledgeRequirement {
  id: string
  projectId: string
  code: string
  title: string
  description: string
  type: RequirementType
  moduleId: string | null
  featureId: string | null
  priority: string
  acceptanceCriteria: string
  dependencies: string
  tags: string
  status: string
  nfrCategory: string
  sortOrder: number
  notes: string
  deletedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface BusinessRule {
  id: string
  projectId: string
  title: string
  description: string
  moduleId: string | null
  sortOrder: number
  notes: string
  deletedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface Workflow {
  id: string
  projectId: string
  title: string
  description: string
  flowData: string
  moduleId: string | null
  sortOrder: number
  notes: string
  deletedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface DatabaseEntity {
  id: string
  projectId: string
  name: string
  fields: string
  relationships: string
  indexes: string
  sortOrder: number
  notes: string
  deletedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface APIEndpoint {
  id: string
  projectId: string
  method: string
  path: string
  description: string
  request: string
  response: string
  authentication: string
  validation: string
  sortOrder: number
  notes: string
  deletedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface KnowledgeRole {
  id: string
  projectId: string
  name: string
  description: string
  permissions: string
  modules: string
  restrictions: string
  sortOrder: number
  notes: string
  deletedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface Integration {
  id: string
  projectId: string
  name: string
  description: string
  type: string
  config: string
  sortOrder: number
  notes: string
  deletedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface KnowledgeReport {
  id: string
  projectId: string
  title: string
  description: string
  moduleId: string | null
  sortOrder: number
  notes: string
  deletedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface Risk {
  id: string
  projectId: string
  title: string
  description: string
  severity: string
  likelihood: string
  mitigation: string
  sortOrder: number
  notes: string
  deletedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface Assumption {
  id: string
  projectId: string
  title: string
  description: string
  sortOrder: number
  notes: string
  deletedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface Decision {
  id: string
  projectId: string
  title: string
  decision: string
  reason: string
  category: string
  sortOrder: number
  notes: string
  deletedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface KnowledgeLink {
  id: string
  projectId: string
  sourceType: string
  sourceId: string
  targetType: string
  targetId: string
  relationType: string
  createdAt: string
}

export interface KnowledgeBundle {
  overview: RequirementKnowledge | null
  stakeholders: Stakeholder[]
  roles: KnowledgeRole[]
  modules: KnowledgeModule[]
  features: KnowledgeFeature[]
  requirements: KnowledgeRequirement[]
  businessRules: BusinessRule[]
  workflows: Workflow[]
  entities: DatabaseEntity[]
  apiEndpoints: APIEndpoint[]
  integrations: Integration[]
  reports: KnowledgeReport[]
  risks: Risk[]
  assumptions: Assumption[]
  decisions: Decision[]
}

export interface KnowledgeStats {
  modules: number
  features: number
  requirements: number
  functionalRequirements: number
  nonFunctionalRequirements: number
  apiEndpoints: number
  entities: number
  reports: number
  risks: number
  roles: number
  businessRules: number
  completionPercent: number
}

export interface KnowledgeSuggestion {
  id: string
  type: 'warning' | 'info' | 'tip'
  title: string
  description: string
  section?: KnowledgeSection
}

export interface KnowledgeSearchResult {
  id: string
  entityType: string
  entityId: string
  title: string
  snippet: string
  section: KnowledgeSection
}

export interface KnowledgeContext {
  businessSummary: string
  modules: string
  features: string
  requirements: string
  roles: string
  database: string
  apis: string
  risks: string
  businessRules: string
  constraints: string
  assumptions: string
  integrations: string
  decisions: string
  formatted: string
}

export interface ExtractKnowledgeInput {
  projectId: string
  text: string
}

export interface ExtractKnowledgeResult {
  modules: number
  features: number
  requirements: number
  roles: number
  apiEndpoints: number
  entities: number
  businessRules: number
  risks: number
  assumptions: number
  openQuestions: number
  integrations: number
}

export interface KnowledgeSeedResult {
  itemsCreated: number
  skipped: boolean
  message: string
}
