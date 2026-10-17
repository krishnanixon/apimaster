/**
 * API Studio — Postman/Thunder-Client-style API tester.
 * Shared between renderer (collections UI, request builder) and main
 * process (HTTP execution proxy, test sandbox, AI assist).
 */

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS'

export interface KeyValuePair {
  id: string
  key: string
  value: string
  enabled: boolean
  description?: string
  /**
   * Keep the value on this machine only. In a collection folder the key is written but the value
   * stays in the encrypted local workspace.
   */
  secret?: boolean
}

export type RequestBodyType = 'none' | 'json' | 'text' | 'form-data' | 'x-www-form-urlencoded'

export interface FormDataField {
  id: string
  key: string
  value: string
  enabled: boolean
  type: 'text' | 'file'
  /** Populated only for `type: 'file'` fields — base64-encoded contents. */
  fileName?: string
  fileBase64?: string
  fileContentType?: string
  /** Same as `KeyValuePair.secret`: the value is never written to a collection folder. */
  secret?: boolean
}

export interface RequestBody {
  type: RequestBodyType
  /** Raw text for json/text bodies. */
  content: string
  formData?: FormDataField[]
}

export type AuthType =
  | 'inherit'
  | 'none'
  | 'apiKey'
  | 'bearer'
  | 'jwt'
  | 'basic'
  | 'digest'
  | 'oauth1'
  | 'oauth2'
  | 'aws'
  | 'hawk'

export type OAuth2GrantType = 'authorization_code' | 'client_credentials' | 'password'

export type JwtAlgorithm = 'HS256' | 'HS384' | 'HS512'
export type OAuth1SignatureMethod = 'HMAC-SHA1' | 'HMAC-SHA256' | 'PLAINTEXT'
export type HawkAlgorithm = 'sha256' | 'sha1'

export const SIGNED_AUTH_TYPES = ['jwt', 'digest', 'oauth1', 'aws', 'hawk'] as const

export function isSignedAuthType(type: AuthType): boolean {
  return type === 'jwt' || type === 'digest' || type === 'oauth1' || type === 'aws' || type === 'hawk'
}

export type RequestType = 'http' | 'websocket' | 'graphql'

/** Cached introspection payload for a GraphQL endpoint. */
export interface GraphQLSchemaMetadata {
  /** `data` object from a successful introspection response. */
  introspection?: Record<string, unknown>
  fetchedAt?: string
  /** Endpoint text at fetch time, before environment substitution. */
  endpoint?: string
  error?: string
}

export interface GraphQLRequestConfig {
  query: string
  /** JSON object text. Stored as text so an invalid draft is not discarded. */
  variables: string
  operationName?: string
  schema?: GraphQLSchemaMetadata
}

export interface GraphQLResponseError {
  message: string
  path?: ReadonlyArray<string | number>
  locations?: { line: number; column: number }[]
}

/** Parsed GraphQL envelope. HTTP status stays on the execution result. */
export interface GraphQLResponseInfo {
  data: unknown
  errors: GraphQLResponseError[]
  hasErrors: boolean
  parseError?: string
  hint?: string
}

export interface RequestAuth {
  type: AuthType
  bearerToken?: string
  basicUsername?: string
  basicPassword?: string
  apiKeyName?: string
  apiKeyValue?: string
  apiKeyLocation?: 'header' | 'query'
  /** Vault item used to populate auth credentials. */
  vaultItemId?: string
  jwtAlgorithm?: JwtAlgorithm
  jwtSecret?: string
  jwtPayload?: string
  jwtHeader?: string
  jwtAddTo?: 'header' | 'query'
  jwtQueryParam?: string
  digestUsername?: string
  digestPassword?: string
  digestRealm?: string
  oauth1ConsumerKey?: string
  oauth1ConsumerSecret?: string
  oauth1Token?: string
  oauth1TokenSecret?: string
  oauth1SignatureMethod?: OAuth1SignatureMethod
  oauth1Realm?: string
  oauth1Version?: string
  oauth2GrantType?: OAuth2GrantType
  oauth2AuthUrl?: string
  oauth2TokenUrl?: string
  oauth2ClientId?: string
  oauth2ClientSecret?: string
  oauth2Scope?: string
  oauth2RedirectUri?: string
  oauth2Username?: string
  oauth2Password?: string
  oauth2AccessToken?: string
  oauth2RefreshToken?: string
  awsAccessKey?: string
  awsSecretKey?: string
  awsRegion?: string
  awsService?: string
  awsSessionToken?: string
  hawkId?: string
  hawkKey?: string
  hawkAlgorithm?: HawkAlgorithm
  hawkUser?: string
  hawkNonce?: string
  hawkExt?: string
  hawkApp?: string
}

export interface ApiRequest {
  id: string
  name: string
  method: HttpMethod
  url: string
  headers: KeyValuePair[]
  queryParams: KeyValuePair[]
  /** Values for `:id` / `{id}` tokens in the URL path. */
  pathParams?: KeyValuePair[]
  body: RequestBody
  auth: RequestAuth
  /** Optional pm.test-style script, run against the response. */
  tests?: string
  /** Optional pm-style script run before the request (can mutate env vars). */
  preRequestScript?: string
  /** Free-form notes / description remembered with the request. */
  description?: string
  requestType?: RequestType
  /** Present when `requestType` is `graphql`. Ignored for HTTP and WebSocket execution. */
  graphql?: GraphQLRequestConfig
  folderId?: string | null
  /** Per-request timeout; defaults to 30s when omitted. */
  timeoutMs?: number
  /**
   * Set on requests created by the Code Scanner: which endpoint it came from (`key`) and a
   * fingerprint of the structure it was generated with, so a re-scan can tell code changes from edits.
   */
  scan?: {
    key: string
    structure: string
    /** Where the route is defined (paths relative to the collection's `source.rootPath`). */
    sources?: Array<{ file: string; line: number }>
  }
  updatedAt: string
}

export interface ApiFolder {
  id: string
  name: string
  /** Parent folder id; `null` / omitted means top-level under the collection. */
  parentId?: string | null
  /**
   * Authorization inherited by child folders/requests when they use `auth.type: 'inherit'`.
   * Defaults to inherit (walk up to the collection).
   */
  auth?: RequestAuth
  /** Extra headers merged into child requests (child keys override). */
  headers?: KeyValuePair[]
  /** Runs before each request in this folder (after parent scripts, before the request script). */
  preRequestScript?: string
}

export interface ApiCollection {
  id: string
  name: string
  description: string
  folders: ApiFolder[]
  requests: ApiRequest[]
  /**
   * Authorization inherited by folders/requests that use `auth.type: 'inherit'`.
   * Defaults to no auth.
   */
  auth?: RequestAuth
  /** Extra headers merged into every request (folder/request keys override). */
  headers?: KeyValuePair[]
  /** Runs before each request in this collection (before folder/request scripts). */
  preRequestScript?: string
  /** Set when the Code Scanner generated this collection; re-scans of `rootPath` can update it. */
  source?: { kind: 'code-scanner'; rootPath: string; scannedAt: string }
  /** Set when the collection lives as files in a folder (see docs/COLLECTION_FILES.md). */
  folder?: { path: string }
  createdAt: string
  updatedAt: string
}

/** A named set of `{{variable}}` substitutions (e.g. "Local", "Staging", "Production"). */
export interface ApiEnvironment {
  id: string
  name: string
  variables: KeyValuePair[]
  /** Set when the environment belongs to a folder-linked collection and is saved under its `environments/`. */
  collectionId?: string
  createdAt: string
  updatedAt: string
}

export interface ApiExecutionResult {
  ok: boolean
  status: number
  statusText: string
  headers: Record<string, string>
  /** Response body decoded as text (json/text/html) — empty when binary. */
  data: string
  /** Base64 payload when the response is not safely text-decodable. */
  dataBase64?: string
  isBinary: boolean
  contentType: string
  timeMs: number
  sizeBytes: number
  error?: string
  aborted?: boolean
  /** Set for GraphQL calls so HTTP status and GraphQL errors stay distinct. */
  graphql?: GraphQLResponseInfo
}

/** Fully resolved request (simple auth already merged; signed auth applied in main). */
export interface ResolvedHttpRequest {
  clientRequestId: string
  method: HttpMethod
  url: string
  headers: Record<string, string>
  params: Record<string, string>
  body: RequestBody
  timeoutMs?: number
  /**
   * Present for auth types that must be signed (or challenged) in the main
   * process: JWT, Digest, OAuth 1.0, AWS Signature, Hawk.
   */
  auth?: RequestAuth
}

export interface ApiTestResult {
  name: string
  passed: boolean
  error?: string
}

export interface RunApiTestsInput {
  script: string
  request: ApiRequest
  response: ApiExecutionResult
  /** Environment the script can read and change with `pm.environment` (e.g. save a login token). */
  variables?: Record<string, string>
  /** `pm.collectionVariables`; returned (possibly changed) only when passed in. */
  collectionVariables?: Record<string, string>
  /** `pm.globals`; returned (possibly changed) only when passed in. */
  globals?: Record<string, string>
}

/** One `console.log/info/warn/error` call made by a script. */
export interface ScriptLogEntry {
  level: 'log' | 'info' | 'warn' | 'error'
  message: string
}

export interface ApiTestRun {
  results: ApiTestResult[]
  /** Variables after the script ran; set only when `variables` was passed in. */
  variables?: Record<string, string>
  collectionVariables?: Record<string, string>
  globals?: Record<string, string>
  /** Console output, in call order; omitted when the script logged nothing. */
  logs?: ScriptLogEntry[]
}

export interface ApiHistoryEntry {
  id: string
  timestamp: string
  request: ApiRequest
  response: Pick<ApiExecutionResult, 'ok' | 'status' | 'statusText' | 'sizeBytes' | 'timeMs' | 'error'>
  durationMs: number
}

export interface GeneratedApiRequestResult {
  request: {
    name: string
    method: HttpMethod
    url: string
    headers: { key: string; value: string }[]
    queryParams: { key: string; value: string }[]
    body: { type: RequestBodyType; content: string }
    auth: RequestAuth
  }
  notes?: string
}

export interface GenerateApiRequestInput {
  prompt: string
  projectId?: string | null
  /** Current draft — used as context so generated fields stay consistent. */
  currentRequest?: ApiRequest
  environmentKeys?: string[]
}

export type ApiStudioEnhanceAction = 'complete' | 'body' | 'script' | 'review' | 'variables'

export interface EnhanceApiRequestInput {
  action: ApiStudioEnhanceAction
  request: ApiRequest
  response?: ApiExecutionResult
  prompt?: string
  environmentName?: string | null
  environmentKeys?: string[]
  projectId?: string | null
}

export interface EnhanceApiRequestResult {
  request?: GeneratedApiRequestResult['request']
  notes?: string
  body?: { type: RequestBodyType; content: string }
  script?: string
  review?: string
  variables?: { key: string; value: string }[]
}

export interface ExplainApiResponseInput {
  request: ApiRequest
  response: ApiExecutionResult
  projectId?: string | null
}

export interface GenerateApiTestsInput {
  request: ApiRequest
  response: ApiExecutionResult
  projectId?: string | null
}

/** Generate a short description/notes for a request from its URL, auth, and body. */
export interface DescribeApiRequestInput {
  request: ApiRequest
  projectId?: string | null
}

export interface FixApiRequestInput {
  request: ApiRequest
  response?: ApiExecutionResult
  errorMessage?: string
  environmentKeys?: string[]
  projectId?: string | null
}

export interface GenerateCollectionDocumentInput {
  /** Compact JSON summary of the collection (secrets already redacted). */
  collectionSummary: string
  collectionName: string
  /** Optional deterministic markdown to refine rather than invent from scratch. */
  baseMarkdown?: string
  projectId?: string | null
}

export interface PostmanImportResult {
  collection: ApiCollection
  warnings: string[]
}

export interface RunPreRequestScriptInput {
  script: string
  variables: Record<string, string>
  /** `pm.collectionVariables`; returned (possibly changed) only when passed in. */
  collectionVariables?: Record<string, string>
  /** `pm.globals`; returned (possibly changed) only when passed in. */
  globals?: Record<string, string>
}

export interface PreRequestScriptResult {
  variables: Record<string, string>
  collectionVariables?: Record<string, string>
  globals?: Record<string, string>
  error?: string
  /** Console output, in call order; omitted when the script logged nothing. */
  logs?: ScriptLogEntry[]
}

export interface CollectionRunnerOptions {
  delayMs: number
  stopOnFail: boolean
}

export interface CollectionRunnerItemResult {
  requestId: string
  requestName: string
  method: HttpMethod
  url: string
  ok: boolean
  status: number
  timeMs: number
  error?: string
  testResults: ApiTestResult[]
}

export interface CollectionRunnerReport {
  collectionName: string
  scopeLabel: string
  total: number
  passed: number
  failed: number
  durationMs: number
  results: CollectionRunnerItemResult[]
  stoppedEarly: boolean
}

export interface OAuth2AuthorizeInput {
  authUrl: string
  clientId: string
  redirectUri: string
  scope?: string
  state?: string
}

export interface OAuth2TokenInput {
  tokenUrl: string
  clientId: string
  clientSecret?: string
  grantType?: OAuth2GrantType
  code?: string
  redirectUri?: string
  username?: string
  password?: string
  scope?: string
}

export interface OAuth2TokenResult {
  accessToken: string
  refreshToken?: string
  expiresIn?: number
  tokenType?: string
}

export interface SaveResponseFileInput {
  defaultName: string
  content: string
  isBase64?: boolean
  contentType?: string
}

export interface ExportCollectionFileInput {
  defaultName: string
  content: string
  title?: string
  filters?: { name: string; extensions: string[] }[]
}
