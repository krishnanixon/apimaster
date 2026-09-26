import type { AppScope } from './scope'

export type RagTrainingCategory =
  | 'guideline'
  | 'example'
  | 'domain'
  | 'style'
  | 'faq'
  | 'other'

export interface RagTrainingDocument {
  id: string
  scope: AppScope
  projectId: string | null
  title: string
  source: string
  /** What this teaches the model / why it exists */
  purpose: string
  category: RagTrainingCategory
  tags: string[]
  content: string
  contentHash: string
  enabled: boolean
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface CreateRagTrainingDocumentInput {
  scope: AppScope
  projectId?: string | null
  title: string
  source?: string
  purpose?: string
  category?: RagTrainingCategory
  tags?: string[]
  content: string
  enabled?: boolean
}

export interface UpdateRagTrainingDocumentInput {
  title?: string
  source?: string
  purpose?: string
  category?: RagTrainingCategory
  tags?: string[]
  content?: string
  enabled?: boolean
  sortOrder?: number
}

/** Profile / instructions applied to the assistant when RAG training is active. */
export interface RagModelProfile {
  displayName: string
  domain: string
  tone: string
  systemInstructions: string
  preferredTopics: string[]
}

export interface RagTrainingSettings {
  /** Include training corpus in retrieval when Vector RAG is enabled. */
  includeInRag: boolean
  trainingTopK: number
  modelProfile: RagModelProfile
  /** Per-scope index fingerprints: key = `global` | projectId */
  indexMeta: Record<string, RagTrainingIndexMeta>
}

export interface RagTrainingIndexMeta {
  indexedAt: string
  contentHash: string
  chunkCount: number
  collection: string
  connectionId: string
}

export interface RagTrainingIndexResult {
  scopeKey: string
  collection: string
  connectionId: string
  chunkCount: number
  documentCount: number
  contentHash: string
  indexedAt: string
}

export interface RagTrainingIndexStatus {
  scopeKey: string
  collection: string
  indexed: boolean
  vectorCount: number
  documentCount: number
  stale: boolean
  indexedAt: string | null
  lastError?: string
}

export const DEFAULT_RAG_MODEL_PROFILE: RagModelProfile = {
  displayName: '',
  domain: '',
  tone: '',
  systemInstructions: '',
  preferredTopics: []
}

export const DEFAULT_RAG_TRAINING_SETTINGS: RagTrainingSettings = {
  includeInRag: true,
  trainingTopK: 4,
  modelProfile: { ...DEFAULT_RAG_MODEL_PROFILE },
  indexMeta: {}
}

export const RAG_TRAINING_CATEGORY_LABELS: Record<RagTrainingCategory, string> = {
  guideline: 'Guideline',
  example: 'Example',
  domain: 'Domain knowledge',
  style: 'Style / voice',
  faq: 'FAQ',
  other: 'Other'
}
