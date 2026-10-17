import type { HttpMethod } from './api-studio'

export type AiFindingSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info'
export type AiFindingConfidence = 'confirmed' | 'high' | 'medium' | 'low'
export type AiTestRiskLevel = 'low' | 'medium' | 'high'
export type AiTestCategory = 'functional' | 'edge' | 'auth' | 'regression'
export type AiTestRunStatus = 'passed' | 'failed' | 'error' | 'skipped'
export type AiSpecSource = 'collection' | 'openapi'

export interface AiEngineerConfig {
  /** When false, only structural analysis runs locally; AI enrichment is skipped. */
  sendApiDataToAi: boolean
  /** Automatically run GET/HEAD/OPTIONS tests marked low risk. */
  autoExecuteSafeMethods: boolean
  /** Require explicit user approval before POST/PUT/PATCH/DELETE tests. */
  requireApprovalForMutations: boolean
  maxTestsPerEndpoint: number
}

export const DEFAULT_AI_ENGINEER_CONFIG: AiEngineerConfig = {
  sendApiDataToAi: false,
  autoExecuteSafeMethods: true,
  requireApprovalForMutations: true,
  maxTestsPerEndpoint: 12
}

export interface ApiSpecParameter {
  name: string
  in: 'path' | 'query' | 'header' | 'cookie'
  required: boolean
  schemaType?: string
  description?: string
  /** Example value (from a spec or AI enrichment), used to prefill the request. */
  example?: string
}

/**
 * The validation rules a request body is known to have — a small, resolved JSON Schema subset
 * (no `$ref`s). Read from OpenAPI documents and validators in code (zod, joi, class-validator, …).
 */
export interface BodySchema {
  type?: 'object' | 'array' | 'string' | 'number' | 'integer' | 'boolean'
  properties?: Record<string, BodySchema>
  /** Fields that must be present; omitted when the source doesn't say. */
  required?: string[]
  items?: BodySchema
  format?: string
  enum?: unknown[]
  minLength?: number
  maxLength?: number
  minimum?: number
  maximum?: number
}

export interface ApiSpecRequestBody {
  required: boolean
  contentTypes: string[]
  schemaSummary?: string
  example?: unknown
  /** Validation rules, when the scanner or spec knows them (used to generate validation tests). */
  schema?: BodySchema
}

export interface ApiSpecResponse {
  status: string
  description?: string
  schemaSummary?: string
}

export interface ApiSpecEndpoint {
  id: string
  method: HttpMethod
  path: string
  operationId?: string
  summary?: string
  description?: string
  parameters: ApiSpecParameter[]
  requestBody?: ApiSpecRequestBody
  responses: ApiSpecResponse[]
  securityRequired: boolean
  tags: string[]
}

export interface ApiSpec {
  id: string
  name: string
  version?: string
  baseUrl: string
  endpoints: ApiSpecEndpoint[]
  analyzedAt: string
  source: AiSpecSource
  endpointCount: number
  authEndpointCount: number
  protectedEndpointCount: number
}

export interface ApiAnalysisRecord {
  id: string
  spec: ApiSpec
  collectionId?: string
  collectionName?: string
  aiEnriched: boolean
  aiSummary?: string
  createdAt: string
}

export type AiAssertion =
  | { type: 'status'; values: number[] }
  | { type: 'jsonPath'; path: string; operator: 'exists' | 'equals' | 'type'; value?: unknown }
  | { type: 'header'; name: string; operator: 'exists' | 'equals'; value?: string }
  | { type: 'bodyContains'; value: string }

export interface AiGeneratedTest {
  id: string
  analysisId: string
  endpointId?: string
  name: string
  method: HttpMethod
  url: string
  headers: Record<string, string>
  query: Record<string, string>
  body?: string
  bodyType: 'none' | 'json' | 'text'
  expectedStatus: number[]
  assertions: AiAssertion[]
  reason: string
  riskLevel: AiTestRiskLevel
  category: AiTestCategory
  requiresApproval: boolean
  aiGenerated: boolean
}

export interface AiTestSuite {
  id: string
  analysisId: string
  name: string
  tests: AiGeneratedTest[]
  createdAt: string
  aiGenerated: boolean
}

export interface AiAssertionResult {
  assertion: AiAssertion
  passed: boolean
  message: string
}

export interface AiTestEvidence {
  kind: 'request' | 'response' | 'assertion'
  label: string
  value: string
}

export interface AiTestResult {
  testId: string
  testName: string
  status: AiTestRunStatus
  statusCode: number
  durationMs: number
  assertionsPassed: number
  assertionsFailed: number
  assertionResults: AiAssertionResult[]
  evidence: AiTestEvidence[]
  error?: string
  skipReason?: string
}

export interface AiFailureAnalysis {
  testId: string
  title: string
  observedBehavior: string
  expectedBehavior: string
  likelyExplanation: string
  category: string
  suggestedNextStep: string
  aiGenerated: boolean
}

export interface AiTestRun {
  id: string
  suiteId: string
  analysisId: string
  name: string
  startedAt: string
  finishedAt?: string
  status: 'running' | 'completed' | 'cancelled' | 'error'
  total: number
  passed: number
  failed: number
  skipped: number
  errors: number
  results: AiTestResult[]
  failureAnalyses: AiFailureAnalysis[]
  approvedMutations: boolean
}

export interface AiFinding {
  id: string
  title: string
  severity: AiFindingSeverity
  confidence: AiFindingConfidence
  category: string
  endpoint: string
  method: HttpMethod
  description: string
  observedBehavior: string
  expectedBehavior: string
  evidence: AiTestEvidence[]
  recommendation: string
  testRunId?: string
  testId?: string
  createdAt: string
}

export interface AiEngineerDocument {
  version: 1
  config: AiEngineerConfig
  analyses: ApiAnalysisRecord[]
  suites: AiTestSuite[]
  runs: AiTestRun[]
  findings: AiFinding[]
}

export interface AnalyzeApiInput {
  collection?: unknown
  collectionId?: string
  collectionName?: string
  openApiJson?: string
  enrichWithAi?: boolean
}

export interface GenerateAiTestsInput {
  analysisId: string
  scope?: 'all' | 'endpoint'
  endpointId?: string
  categories?: AiTestCategory[]
}

export interface RunAiTestSuiteInput {
  suiteId: string
  variables?: Record<string, string>
  approvedMutations: boolean
  testIds?: string[]
}

export interface AnalyzeAiFailureInput {
  runId: string
  testId: string
  test: AiGeneratedTest
  result: AiTestResult
}
