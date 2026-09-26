export type ContextSourceKind =
  | 'selection'
  | 'current_file'
  | 'open_tab'
  | 'dependency'
  | 'symbol'
  | 'file'
  | 'vector'
  | 'git_diff'
  | 'attachment'
  | 'knowledge'
  | 'project_rules'
  | 'pinned'
  | 'diagnostics'

export interface ContextChunk {
  id: string
  source: ContextSourceKind
  path?: string
  title: string
  content: string
  /** Retrieval score in 0..1 (1 = most relevant). */
  score: number
  startLine?: number
}

export interface TokenBudget {
  modelContextLimit: number
  outputReserve: number
  systemReserve: number
  conversationTokens: number
  packCap: number
  availableForContext: number
}

export interface ContextSourceUsage {
  kind: ContextSourceKind
  count: number
  tokens: number
}

export interface ContextPackSummary {
  files: string[]
  chunkCount: number
  promptTokens: number
  /** Maximum context-pack tokens allocated for this request. */
  budgetTokens: number
  estimatedCostUsd: number
  trimmed: boolean
  sources: ContextSourceUsage[]
  model: string
}

export interface ContextEngineResult {
  formatted: string
  summary: ContextPackSummary
  chunks: ContextChunk[]
}

export interface RankedRetrievalHit {
  id: string
  score: number
}
