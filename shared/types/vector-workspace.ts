import type { AppScope } from './scope'

/** Vector DB providers (LiteChroma is the primary local engine). */
export type VectorProviderId = 'litechroma' | 'chroma'

export type VectorConnectionHealth = 'unknown' | 'healthy' | 'degraded' | 'offline'

export type VectorDistanceMetric = 'cosine' | 'l2' | 'ip'

export type VectorIndexType = 'flat' | 'hnsw'

export interface VectorConnectionConfig {
  /** Hostname or IP of the LiteChroma HTTP server */
  host: string
  /** HTTP port (default 8000) */
  port: number
  /** Use https instead of http */
  ssl?: boolean
  /** Optional path prefix (rarely needed) */
  basePath?: string
  connectionTimeoutMs?: number
}

export interface VectorConnectionSecrets {
  /** Optional API key — sent as X-Api-Key / Bearer */
  apiKey?: string
}

export interface VectorConnection {
  id: string
  name: string
  provider: VectorProviderId
  scope: AppScope
  projectId: string | null
  config: VectorConnectionConfig
  notes: string
  tags: string[]
  isFavorite: boolean
  health: VectorConnectionHealth
  latencyMs: number | null
  serverVersion: string | null
  lastConnectedAt: string | null
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface CreateVectorConnectionInput {
  name: string
  provider: VectorProviderId
  scope: AppScope
  projectId?: string | null
  config: VectorConnectionConfig
  notes?: string
  tags?: string[]
  secrets?: VectorConnectionSecrets
}

export interface UpdateVectorConnectionInput {
  name?: string
  config?: VectorConnectionConfig
  notes?: string
  tags?: string[]
  isFavorite?: boolean
  secrets?: VectorConnectionSecrets
}

export interface VectorConnectionTestResult {
  success: boolean
  latencyMs: number
  serverVersion: string | null
  serverName: string | null
  message: string
}

export interface VectorCollectionStats {
  uuid: string
  name: string
  dimension: number
  metric: VectorDistanceMetric | string
  index: VectorIndexType | string
  count: number
  created_at: number
  updated_at: number
}

export interface VectorDbStats {
  collections: number
  vectors: number
  details: VectorCollectionStats[]
  memory_mb?: number
}

export interface VectorHealthInfo {
  status: string
  uptime_s: number
}

export interface VectorVersionInfo {
  version: string
  name: string
}

export interface CreateVectorCollectionInput {
  name: string
  dimension: number
  metric?: VectorDistanceMetric
  index?: VectorIndexType
}

export interface VectorUpsertInput {
  collection: string
  ids: string[]
  embeddings: number[][]
  metadatas?: Array<Record<string, unknown> | null>
  documents?: Array<string | null>
}

export interface VectorDeleteInput {
  collection: string
  ids: string[]
}

export interface VectorGetInput {
  collection: string
  ids?: string[]
  where?: Record<string, unknown>
  limit?: number
  offset?: number
  include_embeddings?: boolean
}

export interface VectorGetResult {
  ids: string[]
  metadatas: Array<Record<string, unknown> | null>
  documents: Array<string | null>
  embeddings?: number[][]
  total: number
}

export interface VectorRecord {
  id: string
  metadata: Record<string, unknown> | null
  document: string | null
  embedding: number[] | null
}

export interface VectorSearchInput {
  collection: string
  query_embeddings: number[][]
  top_k?: number
  where?: Record<string, unknown>
  score_threshold?: number | null
  include_metadata?: boolean
  include_documents?: boolean
  include_embeddings?: boolean
  include_distances?: boolean
}

/** Text query → embed via configured RAG models → similarity search. */
export interface VectorTextSearchInput {
  collection: string
  query: string
  top_k?: number
  where?: Record<string, unknown>
  score_threshold?: number | null
  include_metadata?: boolean
  include_documents?: boolean
  include_embeddings?: boolean
  include_distances?: boolean
}

/** Documents → embed → upsert (no precomputed vectors required). */
export interface VectorTextUpsertInput {
  collection: string
  ids: string[]
  documents: string[]
  metadatas?: Array<Record<string, unknown> | null>
}

export interface VectorSearchResult {
  ids: string[][]
  distances?: number[][] | null
  metadatas?: Array<Array<Record<string, unknown> | null>> | null
  documents?: Array<Array<string | null>> | null
  embeddings?: Array<Array<number[] | null>> | null
}

export type VectorExplorerNodeType = 'connection' | 'collection' | 'stats'

export interface VectorExplorerNode {
  id: string
  type: VectorExplorerNodeType
  name: string
  connectionId: string
  collection?: string
  children?: VectorExplorerNode[]
  metadata?: Record<string, unknown>
}

export type VectorWorkspaceTabType = 'collection' | 'search' | 'upsert' | 'stats'

export interface VectorWorkspaceTab {
  id: string
  type: VectorWorkspaceTabType
  title: string
  connectionId: string
  collection?: string
  /** Draft search / upsert JSON kept in the tab */
  draft?: string
  /** Form-mode text query for search tabs */
  queryText?: string
  /** 'form' | 'json' editor mode */
  editorMode?: 'form' | 'json'
  /** Per-tab search results */
  searchResult?: VectorSearchResult | null
  searchError?: string | null
}

/** Which AI stack produces embeddings for RAG indexing / retrieval. */
export type RagEmbeddingProvider = 'auto' | 'openai' | 'ollama'

export interface VectorWorkspaceSettings {
  defaultTopK: number
  defaultMetric: VectorDistanceMetric
  defaultIndex: VectorIndexType
  defaultDimension: number
  includeMetadata: boolean
  includeDocuments: boolean
  includeDistances: boolean
  includeEmbeddings: boolean
  confirmDestructive: boolean
  connectionTimeoutMs: number
  /** When true, project chat retrieves relevant KB chunks instead of dumping the full knowledge base. */
  ragEnabled: boolean
  /** LiteChroma connection used for RAG (falls back to first healthy / first listed). */
  ragConnectionId: string | null
  /** Top-k chunks injected into the chat prompt. */
  ragTopK: number
  /** Embedding provider: auto follows AI mode (openai/ollama/hybrid→openai). */
  ragEmbeddingProvider: RagEmbeddingProvider
  /** OpenAI embedding model (supports dimensions param for text-embedding-3-*). */
  ragOpenAiEmbeddingModel: string
  /** Ollama embedding model (e.g. nomic-embed-text, all-minilm). */
  ragOllamaEmbeddingModel: string
  /** If retrieval fails or returns nothing, fall back to the full brief knowledge dump. */
  ragFallbackToFullContext: boolean
  /**
   * Max cosine/L2 distance for a hit to be kept (LiteChroma: lower is better).
   * Null disables filtering. Typical cosine: 0.55–0.85.
   */
  ragScoreThreshold: number | null
  /** Per-project index fingerprints for staleness detection. */
  ragIndexMeta: Record<string, RagIndexMeta>
}

export interface RagIndexMeta {
  indexedAt: string
  contentHash: string
  chunkCount: number
  connectionId: string
  collection: string
  dimension: number
  embeddingProvider: 'openai' | 'ollama'
  embeddingModel: string
}

export const DEFAULT_VECTOR_WORKSPACE_SETTINGS: VectorWorkspaceSettings = {
  defaultTopK: 10,
  defaultMetric: 'cosine',
  defaultIndex: 'flat',
  defaultDimension: 384,
  includeMetadata: true,
  includeDocuments: true,
  includeDistances: true,
  includeEmbeddings: false,
  confirmDestructive: true,
  connectionTimeoutMs: 10000,
  ragEnabled: false,
  ragConnectionId: null,
  ragTopK: 8,
  ragEmbeddingProvider: 'auto',
  ragOpenAiEmbeddingModel: 'text-embedding-3-small',
  ragOllamaEmbeddingModel: 'all-minilm',
  ragFallbackToFullContext: true,
  ragScoreThreshold: null,
  ragIndexMeta: {}
}

export interface RagIndexResult {
  projectId: string
  collection: string
  connectionId: string
  chunkCount: number
  dimension: number
  embeddingProvider: 'openai' | 'ollama'
  embeddingModel: string
  contentHash: string
  indexedAt: string
}

export interface RagStatus {
  enabled: boolean
  connectionId: string | null
  connectionName: string | null
  collection: string | null
  indexed: boolean
  vectorCount: number
  dimension: number | null
  /** ISO timestamp of last successful index, if known. */
  indexedAt: string | null
  contentHash: string | null
  /** True when live KB fingerprint differs from last index. */
  stale: boolean
  lastError?: string
}

export interface RagRetrieveHit {
  id: string
  document: string
  distance: number | null
  metadata: Record<string, unknown> | null
}

export const VECTOR_PROVIDER_LABELS: Record<VectorProviderId, string> = {
  litechroma: 'LiteChroma',
  chroma: 'Chroma (compat)'
}

export const IMPLEMENTED_VECTOR_PROVIDERS: VectorProviderId[] = ['litechroma']

export function emptyVectorConnectionForm(
  scope: AppScope,
  projectId: string | null
): CreateVectorConnectionInput {
  return {
    name: '',
    provider: 'litechroma',
    scope,
    projectId,
    config: {
      host: '127.0.0.1',
      port: 8000,
      ssl: false,
      connectionTimeoutMs: 10000
    },
    notes: '',
    tags: [],
    secrets: { apiKey: '' }
  }
}

export function buildVectorBaseUrl(config: VectorConnectionConfig): string {
  const protocol = config.ssl ? 'https' : 'http'
  const host = (config.host || '127.0.0.1').trim()
  const port = config.port || 8000
  const basePath = (config.basePath || '').replace(/\/+$/, '')
  return `${protocol}://${host}:${port}${basePath}`
}

export function normalizeVectorConnectionInput(
  input: CreateVectorConnectionInput,
  scope: AppScope,
  projectId: string | null
): CreateVectorConnectionInput {
  const config = { ...input.config }
  config.host = (config.host || '127.0.0.1').trim()
  config.port = Number(config.port) || 8000
  config.basePath = config.basePath?.trim() || undefined
  if (config.connectionTimeoutMs != null) {
    config.connectionTimeoutMs = Number(config.connectionTimeoutMs) || 10000
  }

  return {
    ...input,
    name: input.name.trim(),
    scope,
    projectId: scope === 'PROJECT' ? projectId : null,
    config,
    notes: input.notes?.trim() ?? '',
    tags: input.tags ?? [],
    secrets: { apiKey: input.secrets?.apiKey ?? '' }
  }
}

export function validateVectorConnectionInput(input: CreateVectorConnectionInput): string | null {
  if (!input.name.trim()) return 'Name is required'
  if (input.scope === 'PROJECT' && !input.projectId) {
    return 'A project is required for project-scoped connections'
  }
  if (!input.config.host?.trim()) return 'Host is required'
  if (!input.config.port || Number.isNaN(Number(input.config.port))) return 'Port is required'
  return null
}
