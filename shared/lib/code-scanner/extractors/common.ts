/** Building blocks every extractor uses to describe what a handler reads and to emit endpoints. */
import { v4 as uuidv4 } from 'uuid'
import type { HttpMethod } from '../../../types/api-studio'
import type { ApiSpecParameter, BodySchema } from '../../../types/ai-engineer'
import { hasRules, schemaOf } from '../../body-schema'
import type { AuthScheme, CodeScanConfidence, CodeScanOrigin, DetectedEndpoint } from '../../../types/code-scanner'

/** Headers / query parameters that carry an API key rather than request data. */
const API_KEY_HEADER = /^(x-)?api[-_]?key$|^x-(auth|access)-token$|^x-api-token$/i
const API_KEY_QUERY = /^(api[-_]?key|apikey|access_token)$/i
import { pathParamNames, tagForPath } from '../paths'

/** What a handler reads from the incoming request. */
export interface RequestInputs {
  body: string[]
  query: string[]
  headers: string[]
  /** The handler checks the `Authorization` header itself. */
  readsAuthorization: boolean
}

const MAX_FIELDS = 30
const IGNORED_HEADERS = new Set([
  'content-type',
  'content-length',
  'user-agent',
  'host',
  'accept',
  'cookie',
  'origin',
  'referer'
])

export function emptyInputs(): RequestInputs {
  return { body: [], query: [], headers: [], readsAuthorization: false }
}

export function addInput(inputs: RequestInputs, section: 'body' | 'query' | 'headers', name: string): void {
  let value = name.trim()
  if (section === 'headers') {
    value = value.toLowerCase()
    if (value === 'authorization') {
      inputs.readsAuthorization = true
      return
    }
    if (IGNORED_HEADERS.has(value)) return
  }
  const list = inputs[section]
  if (value && list.length < MAX_FIELDS && !list.includes(value)) list.push(value)
}

/** `getUserById` / `get_user_by_id` → `Get user by id`. */
export function humanize(name: string): string {
  const words = name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase()
  return words ? words[0].toUpperCase() + words.slice(1) : name
}

export interface EndpointDraft {
  method: HttpMethod
  path: string
  file: string
  line: number
  framework: string
  confidence: CodeScanConfidence
  auth: boolean
  inputs?: RequestInputs
  /** Structured example (from a DTO/model, possibly a list); wins over the flat field list in `inputs.body`. */
  bodyExample?: unknown
  /** Validation rules for the body; defaults to the rules attached to `bodyExample`. */
  bodySchema?: BodySchema
  operationId?: string
  summary?: string
  description?: string
  origin?: CodeScanOrigin
  /** Scheme the extractor saw directly (e.g. a `basicAuth()` middleware). */
  authScheme?: AuthScheme
}

export function makeEndpoint(draft: EndpointDraft): DetectedEndpoint {
  const raw = draft.inputs ?? emptyInputs()
  // An API key read by the handler is authentication, not a parameter to fill in by hand.
  const keyHeader = raw.headers.find((h) => API_KEY_HEADER.test(h))
  const keyQuery = raw.query.find((q) => API_KEY_QUERY.test(q))
  const authScheme: AuthScheme | undefined =
    draft.authScheme ??
    (keyHeader ? { type: 'apiKey', name: keyHeader, in: 'header' } : keyQuery ? { type: 'apiKey', name: keyQuery, in: 'query' } : undefined)
  const inputs: RequestInputs = {
    ...raw,
    headers: raw.headers.filter((h) => h !== keyHeader),
    query: raw.query.filter((q) => q !== keyQuery)
  }
  const pathParams = pathParamNames(draft.path)
  const parameters: ApiSpecParameter[] = [
    ...pathParams.map((name): ApiSpecParameter => ({ name, in: 'path', required: true })),
    ...inputs.query
      .filter((name) => !pathParams.includes(name))
      .map((name): ApiSpecParameter => ({ name, in: 'query', required: false })),
    ...inputs.headers.map((name): ApiSpecParameter => ({ name, in: 'header', required: false }))
  ]
  const hasStructured =
    Array.isArray(draft.bodyExample) ||
    (typeof draft.bodyExample === 'object' && draft.bodyExample !== null && Object.keys(draft.bodyExample).length > 0)
  const example = hasStructured
    ? draft.bodyExample
    : inputs.body.length > 0
        ? Object.fromEntries(inputs.body.map((field) => [field, '']))
        : undefined
  const schema = draft.bodySchema ?? schemaOf(draft.bodyExample)
  return {
    id: uuidv4(),
    method: draft.method,
    path: draft.path,
    operationId: draft.operationId,
    summary: draft.summary ?? (draft.operationId ? humanize(draft.operationId) : undefined),
    description: draft.description,
    parameters,
    requestBody: example ? { required: true, contentTypes: ['application/json'], example, ...(hasRules(schema) ? { schema } : {}) } : undefined,
    responses: [],
    securityRequired: draft.auth || inputs.readsAuthorization || Boolean(authScheme),
    ...(authScheme ? { authScheme } : {}),
    tags: [tagForPath(draft.path)],
    origin: draft.origin ?? 'backend',
    framework: draft.framework,
    confidence: draft.confidence,
    sources: [{ file: draft.file, line: draft.line }]
  }
}
