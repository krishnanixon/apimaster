/**
 * Code Scanner — reads a project folder, finds API endpoints in source code
 * (and any OpenAPI files it ships), and turns them into a Shurikly collection.
 * Shared between the main-process scanner and the renderer review/import UI.
 */

import type { ApiSpecEndpoint } from './ai-engineer'

/** Where an endpoint was discovered. `frontend` is reserved for client-code scanning. */
export type CodeScanOrigin = 'backend' | 'frontend' | 'openapi'

export type CodeScanConfidence = 'high' | 'medium' | 'low'

/** How protected endpoints expect credentials. */
export type AuthScheme =
  | { type: 'bearer'; prefix?: string }
  | { type: 'apiKey'; name: string; in: 'header' | 'query' }
  | { type: 'basic' }

/** A position in the scanned project. `file` is relative to the scan root, `/`-separated. */
export interface CodeLocation {
  file: string
  line: number
}

export interface DetectedEndpoint extends ApiSpecEndpoint {
  origin: CodeScanOrigin
  /** Extractor that produced it, e.g. `express`, `fastify`, `openapi`. */
  framework: string
  confidence: CodeScanConfidence
  /** Every place this method + path was found (duplicates are merged). */
  sources: CodeLocation[]
  /** Frontend code that calls this endpoint. */
  callers?: CodeLocation[]
  /** Origin of a third-party API the frontend calls directly (e.g. `https://api.github.com`). */
  host?: string
  /** Set for GraphQL operations found in frontend code; sent as a GraphQL request. */
  graphql?: { query: string; operationName?: string }
  /**
   * Backend ↔ frontend comparison, set when the scan found both:
   * `called` (route used by the frontend), `not-called` (no frontend call found),
   * `no-backend` (frontend calls a route the backend doesn't define).
   */
  crossCheck?: 'called' | 'not-called' | 'no-backend'
  /** Credential scheme found for this endpoint (API key header, Basic auth, …). */
  authScheme?: AuthScheme
  /** Example success response (AI enrichment). */
  responseExample?: unknown
  /** What the optional AI pass filled in, e.g. `['summary', 'body', 'response']`. */
  aiEnriched?: string[]
}

export interface DetectedFramework {
  id: string
  label: string
  /** Whether this version of the scanner extracts routes for it. */
  supported: boolean
  /** Where it was detected, e.g. `package.json`. */
  evidence: string
}

export interface CodeScanWarning {
  message: string
  file?: string
  line?: number
}

export interface CodeScanStats {
  filesScanned: number
  filesSkipped: number
  durationMs: number
  /** True when the file limit was hit and part of the project was not read. */
  truncated: boolean
}

export interface CodeScanResult {
  scanId: string
  rootPath: string
  projectName: string
  frameworks: DetectedFramework[]
  endpoints: DetectedEndpoint[]
  /** Best guess at where the API runs, e.g. `http://localhost:3000`. */
  baseUrl: string
  /** Credential scheme for the collection (`bearer` unless the code shows otherwise). */
  auth?: AuthScheme
  warnings: CodeScanWarning[]
  stats: CodeScanStats
  scannedAt: string
}

export interface CodeScanInput {
  /** Chosen by the renderer so it can cancel and match progress events before the result arrives. */
  scanId: string
  rootPath: string
}

export type CodeScanPhase = 'walking' | 'parsing' | 'done'

export interface CodeScanEnrichInput {
  /** Identifies the run so it can be cancelled and progress matched. */
  enrichId: string
  rootPath: string
  endpoints: DetectedEndpoint[]
}

/** Shown before an enrichment run so the user knows what it costs and where data goes. */
export interface CodeScanEnrichEstimate {
  endpoints: number
  batches: number
  approxTokens: number
  /** Provider(s) the requests are routed to — the same routing rules as the real run. */
  provider: string | null
  model: string | null
  /** Used if the primary provider fails (Settings → AI → fallback). */
  fallbackProvider: string | null
  /** Any provider that may receive the code is a cloud one (data leaves the machine). */
  cloud: boolean
  ready: boolean
  /** Why enrichment can't run, when `ready` is false. */
  reason?: string
}

export interface CodeScanEnrichProgress {
  enrichId: string
  done: number
  total: number
}

export interface CodeScanEnrichResult {
  endpoints: DetectedEndpoint[]
  enriched: number
  failedBatches: number
  tokens: number
  model: string | null
  /** Set when the run stopped early (e.g. the daily token budget was reached). */
  error?: string
}

export interface CodeScanProgress {
  scanId: string
  phase: CodeScanPhase
  filesDone: number
  filesTotal: number
  currentFile?: string
}
