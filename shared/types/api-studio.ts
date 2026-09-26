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

export type RequestType = 'http' | 'websocket'

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
  folderId?: string | null
  /** Per-request timeout; defaults to 30s when omitted. */
  timeoutMs?: number
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
  createdAt: string
  updatedAt: string
}

/** A named set of `{{variable}}` substitutions (e.g. "Local", "Staging", "Production"). */
export interface ApiEnvironment {
  id: string
  name: string
  variables: KeyValuePair[]
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
}

export interface PreRequestScriptResult {
  variables: Record<string, string>
  error?: string
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
