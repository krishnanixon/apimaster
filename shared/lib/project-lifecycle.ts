import type { Document, DocumentStatus, DocumentType, KnowledgeBundle } from '../types'

/** Workspace stages shown in the Documents lifecycle navigator. */
export type LifecycleStageId =
  | 'discovery'
  | 'requirements'
  | 'scope'
  | 'product'
  | 'flows'
  | 'ui_ux'
  | 'architecture'
  | 'technical'
  | 'development'
  | 'testing'
  | 'uat'
  | 'deployment'
  | 'release'
  | 'documentation'
  | 'change'

export type ProjectHealthStatus = 'healthy' | 'at_risk' | 'critical'

export interface LifecycleDocumentMeta {
  type: DocumentType
  label: string
  description: string
  category: string
  estimatedPages: number
  complexity: 'Low' | 'Medium' | 'High'
}

export interface LifecycleStage {
  id: LifecycleStageId
  order: number
  label: string
  description: string
  /** Primary documents generated for this stage. */
  documentTypes: DocumentType[]
  /** Knowledge bundle keys that should exist before generating this stage. */
  knowledgeKinds: Array<keyof KnowledgeBundle>
  optional?: boolean
}

export interface StageProgress {
  stage: LifecycleStage
  existing: Array<{ type: DocumentType; id: string; title: string; status: DocumentStatus }>
  missing: DocumentType[]
  approvedCount: number
  draftCount: number
  completionRatio: number
}

export interface HealthFactor {
  id: string
  label: string
  score: number
  weight: number
  note: string
}

export interface ProjectHealth {
  status: ProjectHealthStatus
  score: number
  factors: HealthFactor[]
  reasons: string[]
  currentStageId: LifecycleStageId
  openQuestionCount: number
}

export const OPEN_QUESTION_NOTE_PREFIX = 'OPEN_QUESTION|'

export interface ParsedOpenQuestion {
  id: string
  question: string
  reason: string
  affectedArea: string
  priority: string
  status: string
}

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  discovery: 'Discovery Brief',
  brd: 'Business Requirements (BRD)',
  requirements: 'Requirements',
  functional: 'Functional Requirements',
  non_functional: 'Non-Functional Requirements',
  scope: 'Scope Document',
  product_definition: 'Product Definition',
  prd: 'PRD (Product Requirements)',
  user_stories: 'User Stories',
  ui_ux: 'UI/UX Specification',
  architecture: 'System Architecture',
  system_design: 'System Design Document',
  technical_design: 'Technical Design',
  database_schema: 'Database Schema',
  api_spec: 'API Specification',
  timeline: 'Project Timeline',
  risks: 'Risk Assessment',
  testing: 'Testing Checklist',
  uat: 'UAT Document',
  deployment: 'Deployment Guide',
  release_notes: 'Release Notes',
  user_guide: 'User Guide',
  handover: 'Technical Handover',
  change_request: 'Change Request',
  contract: 'Contract Agreement',
  proposal: 'Client Proposal',
  estimation_report: 'Estimation Report'
}

export const LIFECYCLE_STAGES: LifecycleStage[] = [
  {
    id: 'discovery',
    order: 1,
    label: 'Discovery',
    description: 'Understand the problem, users, and constraints before writing requirements.',
    documentTypes: ['discovery', 'proposal'],
    knowledgeKinds: ['overview', 'stakeholders', 'roles']
  },
  {
    id: 'requirements',
    order: 2,
    label: 'Requirements',
    description: 'Capture business, functional, and non-functional requirements with traceability.',
    documentTypes: ['brd', 'requirements', 'functional', 'non_functional'],
    knowledgeKinds: ['requirements', 'businessRules', 'assumptions']
  },
  {
    id: 'scope',
    order: 3,
    label: 'Scope',
    description: 'Lock in-scope, out-of-scope, phases, and commercial estimates.',
    documentTypes: ['scope', 'estimation_report'],
    knowledgeKinds: ['overview', 'modules', 'features']
  },
  {
    id: 'product',
    order: 4,
    label: 'Product',
    description: 'Define platforms, roles, modules, features, and user stories.',
    documentTypes: ['prd', 'product_definition', 'user_stories'],
    knowledgeKinds: ['roles', 'modules', 'features']
  },
  {
    id: 'flows',
    order: 5,
    label: 'Flows',
    description: 'User journeys and business processes. Use the Flow Designer, then document them here.',
    documentTypes: ['user_stories'],
    knowledgeKinds: ['workflows', 'features'],
    optional: true
  },
  {
    id: 'ui_ux',
    order: 6,
    label: 'UI/UX',
    description: 'Screen inventory, states, and interaction notes — not a specific UI framework.',
    documentTypes: ['ui_ux'],
    knowledgeKinds: ['modules', 'features', 'roles']
  },
  {
    id: 'architecture',
    order: 7,
    label: 'Architecture',
    description: 'System context, components, and quality-attribute decisions.',
    documentTypes: ['architecture', 'system_design'],
    knowledgeKinds: ['modules', 'integrations', 'decisions', 'workflows']
  },
  {
    id: 'technical',
    order: 8,
    label: 'Technical Design',
    description: 'Technology choices, database, APIs, and integrations as reusable entities.',
    documentTypes: ['technical_design', 'database_schema', 'api_spec', 'system_design'],
    knowledgeKinds: ['entities', 'apiEndpoints', 'integrations']
  },
  {
    id: 'development',
    order: 9,
    label: 'Development',
    description: 'Delivery plan, phases, and effort — tasks stay linked to features and requirements.',
    documentTypes: ['timeline'],
    knowledgeKinds: ['modules', 'features']
  },
  {
    id: 'testing',
    order: 10,
    label: 'Testing',
    description: 'Test strategy and cases traced back to requirements and features.',
    documentTypes: ['testing', 'risks'],
    knowledgeKinds: ['requirements', 'features', 'risks']
  },
  {
    id: 'uat',
    order: 11,
    label: 'UAT',
    description: 'Acceptance scenarios, sign-off, and client validation.',
    documentTypes: ['uat'],
    knowledgeKinds: ['requirements', 'features']
  },
  {
    id: 'deployment',
    order: 12,
    label: 'Deployment',
    description: 'Environments and release mechanics. Never include secrets.',
    documentTypes: ['deployment'],
    knowledgeKinds: ['integrations', 'decisions']
  },
  {
    id: 'release',
    order: 13,
    label: 'Release',
    description: 'Versioned release notes covering features, fixes, and known issues.',
    documentTypes: ['release_notes'],
    knowledgeKinds: ['features', 'modules']
  },
  {
    id: 'documentation',
    order: 14,
    label: 'Documentation',
    description: 'User guides and technical handover generated from approved project data.',
    documentTypes: ['user_guide', 'handover'],
    knowledgeKinds: ['modules', 'features', 'apiEndpoints']
  },
  {
    id: 'change',
    order: 15,
    label: 'Change Requests',
    description: 'Controlled scope changes with impact across requirements, APIs, and tests.',
    documentTypes: ['change_request', 'contract'],
    knowledgeKinds: ['requirements', 'modules', 'features'],
    optional: true
  }
]

const TYPE_TO_STAGE = new Map<DocumentType, LifecycleStageId>()
for (const stage of LIFECYCLE_STAGES) {
  for (const type of stage.documentTypes) {
    if (!TYPE_TO_STAGE.has(type)) TYPE_TO_STAGE.set(type, stage.id)
  }
}

export function getStageForDocumentType(type: DocumentType): LifecycleStage | undefined {
  const id = TYPE_TO_STAGE.get(type)
  return id ? LIFECYCLE_STAGES.find((s) => s.id === id) : undefined
}

export function getStageById(id: LifecycleStageId): LifecycleStage | undefined {
  return LIFECYCLE_STAGES.find((s) => s.id === id)
}

export function isOpenQuestionAssumption(notes: string): boolean {
  return notes.startsWith(OPEN_QUESTION_NOTE_PREFIX)
}

export function serializeOpenQuestionNotes(input: {
  affectedArea: string
  priority: string
  status: string
}): string {
  return `${OPEN_QUESTION_NOTE_PREFIX}${input.affectedArea}|${input.priority}|${input.status}`
}

export function parseOpenQuestionFromAssumption(item: {
  id: string
  title: string
  description: string
  notes: string
}): ParsedOpenQuestion | null {
  if (!isOpenQuestionAssumption(item.notes)) return null
  const parts = item.notes.slice(OPEN_QUESTION_NOTE_PREFIX.length).split('|')
  return {
    id: item.id,
    question: item.title,
    reason: item.description,
    affectedArea: parts[0] || 'general',
    priority: parts[1] || 'medium',
    status: parts[2] || 'open'
  }
}

export function listOpenQuestions(bundle: KnowledgeBundle | null | undefined): ParsedOpenQuestion[] {
  if (!bundle) return []
  return (bundle.assumptions ?? [])
    .filter((a) => !a.deletedAt)
    .map(parseOpenQuestionFromAssumption)
    .filter((q): q is ParsedOpenQuestion => q !== null && q.status !== 'answered')
}

export function computeStageProgress(
  documents: Array<Pick<Document, 'id' | 'title' | 'type' | 'status'>>,
  stage: LifecycleStage
): StageProgress {
  const existing = documents
    .filter((d) => stage.documentTypes.includes(d.type))
    .map((d) => ({ type: d.type, id: d.id, title: d.title, status: d.status }))
  const present = new Set(existing.map((d) => d.type))
  const missing = stage.documentTypes.filter((t) => !present.has(t))
  const approvedCount = existing.filter((d) => d.status === 'approved').length
  const draftCount = existing.filter((d) => d.status === 'draft' || d.status === 'review').length
  const completionRatio =
    stage.documentTypes.length === 0 ? 1 : (stage.documentTypes.length - missing.length) / stage.documentTypes.length
  return { stage, existing, missing, approvedCount, draftCount, completionRatio }
}

export function computeLifecycleProgress(
  documents: Array<Pick<Document, 'id' | 'title' | 'type' | 'status'>>
): StageProgress[] {
  return LIFECYCLE_STAGES.map((stage) => computeStageProgress(documents, stage))
}

/** First incomplete required stage; last stage if everything has at least one document. */
export function inferCurrentStage(
  documents: Array<Pick<Document, 'id' | 'title' | 'type' | 'status'>>
): LifecycleStageId {
  const progress = computeLifecycleProgress(documents)
  const firstIncomplete = progress.find((p) => !p.stage.optional && p.missing.length > 0)
  return firstIncomplete?.stage.id ?? LIFECYCLE_STAGES[LIFECYCLE_STAGES.length - 1].id
}

function knowledgeCount(bundle: KnowledgeBundle | null | undefined, kind: keyof KnowledgeBundle): number {
  if (!bundle) return 0
  const value = bundle[kind]
  if (Array.isArray(value)) return value.filter((item) => !('deletedAt' in item && item.deletedAt)).length
  if (kind === 'overview') return bundle.overview?.projectSummary?.trim() ? 1 : 0
  return 0
}

export function computeProjectHealth(
  documents: Array<Pick<Document, 'id' | 'title' | 'type' | 'status'>>,
  bundle: KnowledgeBundle | null | undefined
): ProjectHealth {
  const openQuestions = listOpenQuestions(bundle)
  const progress = computeLifecycleProgress(documents)
  const required = progress.filter((p) => !p.stage.optional)
  const stagesWithDocs = required.filter((p) => p.missing.length < p.stage.documentTypes.length).length
  const approvedDocs = documents.filter((d) => d.status === 'approved').length
  const reqCount = knowledgeCount(bundle, 'requirements')
  const featureCount = knowledgeCount(bundle, 'features')
  const moduleCount = knowledgeCount(bundle, 'modules')
  const hasTesting = documents.some((d) => d.type === 'testing' || d.type === 'uat')
  const hasProduct = moduleCount > 0 && featureCount > 0

  const factors: HealthFactor[] = [
    {
      id: 'knowledge',
      label: 'Structured knowledge',
      score: hasProduct ? (reqCount > 0 ? 1 : 0.6) : moduleCount > 0 ? 0.35 : 0,
      weight: 0.25,
      note: hasProduct
        ? `${moduleCount} modules, ${featureCount} features, ${reqCount} requirements`
        : 'Modules and features are the source of truth — add them before generating late-stage docs.'
    },
    {
      id: 'lifecycle',
      label: 'Lifecycle coverage',
      score: required.length === 0 ? 0 : stagesWithDocs / required.length,
      weight: 0.25,
      note: `${stagesWithDocs} of ${required.length} required stages have at least one document.`
    },
    {
      id: 'approval',
      label: 'Approved artifacts',
      score: documents.length === 0 ? 0 : Math.min(1, approvedDocs / Math.max(1, Math.ceil(documents.length * 0.5))),
      weight: 0.15,
      note:
        documents.length === 0
          ? 'No documents yet.'
          : `${approvedDocs} approved of ${documents.length} documents. Health does not treat drafts as complete.`
    },
    {
      id: 'questions',
      label: 'Open questions',
      score: openQuestions.length === 0 ? 1 : openQuestions.length >= 5 ? 0.2 : openQuestions.length >= 2 ? 0.5 : 0.75,
      weight: 0.2,
      note:
        openQuestions.length === 0
          ? 'No unanswered analysis questions.'
          : `${openQuestions.length} open question${openQuestions.length === 1 ? '' : 's'} — do not invent answers.`
    },
    {
      id: 'validation',
      label: 'Validation readiness',
      score: reqCount === 0 ? 0 : hasTesting ? 1 : documents.some((d) => d.type === 'requirements') ? 0.4 : 0.2,
      weight: 0.15,
      note: hasTesting
        ? 'Test or UAT documentation exists for requirement coverage.'
        : 'Requirements without a test/UAT document are treated as unvalidated.'
    }
  ]

  const score = factors.reduce((sum, f) => sum + f.score * f.weight, 0)
  const reasons = factors.filter((f) => f.score < 0.6).map((f) => `${f.label}: ${f.note}`)
  const status: ProjectHealthStatus = score >= 0.75 ? 'healthy' : score >= 0.45 ? 'at_risk' : 'critical'

  if (status === 'healthy' && reasons.length === 0) {
    reasons.push('Knowledge, lifecycle coverage, and open questions are within healthy bounds.')
  }

  return {
    status,
    score,
    factors,
    reasons,
    currentStageId: inferCurrentStage(documents),
    openQuestionCount: openQuestions.length
  }
}

/** Recommended first pack after analyzing a raw requirement. */
export const ANALYSIS_STARTER_PACK: DocumentType[] = [
  'discovery',
  'brd',
  'scope',
  'prd',
  'requirements'
]
