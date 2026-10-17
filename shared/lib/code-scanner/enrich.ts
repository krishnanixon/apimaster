/**
 * Optional AI enrichment of scanned endpoints. Pure functions: building the (redacted) context
 * sent to the model, the prompt, parsing the reply, and merging it back — with guards so the
 * model can only fill in what the code supports and never puts credentials into examples.
 */
import { z } from 'zod'
import type { ApiSpecParameter } from '../../types/ai-engineer'
import type { DetectedEndpoint } from '../../types/code-scanner'
import { isSensitiveKey, REDACTED, redactText } from '../redact-secrets'

export const ENRICH_BATCH_SIZE = 6
/** Output budget per endpoint in a batch; also used for the cost estimate. */
export const ENRICH_OUTPUT_TOKENS_PER_ENDPOINT = 400
/** Enough to include a doc comment or decorators above the route. */
const LINES_BEFORE = 10
const LINES_AFTER = 35
const HELPER_LINES = 25
const SNIPPET_MAX_CHARS = 1800
const CONTEXT_MAX_CHARS = 4200
const NOT_HELPERS = new Set(['if', 'for', 'while', 'switch', 'catch', 'function', 'return', 'require', 'await', 'async', 'json', 'status', 'send', 'next', 'res', 'req', 'print', 'len', 'str', 'int', 'dict', 'list', 'super'])
const MAX_STRING = 200
const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

/** Credential shapes that show up in source code even without a `key = value` form. */
const CODE_SECRETS: RegExp[] = [
  /\b[Bb]earer\s+[\w.~+/-]{8,}=*/g, // Authorization: "Bearer …"
  /\beyJ[\w-]{8,}\.[\w-]{8,}(\.[\w-]+)?/g, // JWTs
  /\b(sk|pk|rk)_(live|test)_[\w]{8,}/g, // Stripe-style keys
  /\bgh[pousr]_[A-Za-z0-9]{20,}/g, // GitHub tokens
  /\bAKIA[0-9A-Z]{16}\b/g, // AWS access key ids
  /\bxox[abprs]-[\w-]{10,}/g, // Slack tokens
  /\bAIza[\w-]{30,}/g, // Google API keys
  /(['"`])(?=[A-Za-z0-9+/_=-]*\d)(?=[A-Za-z0-9+/_=-]*[A-Za-z])[A-Za-z0-9+/_=-]{32,}\1/g // long random-looking literals
]

/**
 * Source-code secret shapes, then `redactText`, applied to every snippet before it can be sent.
 * Shapes go first: `redactText` would replace only the word "Bearer" and leave the token.
 */
export function scrubCode(code: string): string {
  let out = code
  for (const pattern of CODE_SECRETS) {
    out = out.replace(pattern, (_match, quote?: string) =>
      typeof quote === 'string' && /^['"`]$/.test(quote) ? `${quote}${REDACTED}${quote}` : REDACTED
    )
  }
  return redactText(out)
}

export interface EnrichMessage {
  role: 'system' | 'user'
  content: string
}

export interface EndpointContext {
  /** Short id the model echoes back (`e0`, `e1`, …). */
  key: string
  method: string
  path: string
  framework: string
  requiresAuth: boolean
  body?: unknown
  query: string[]
  headers: string[]
  snippets: Array<{ file: string; line: number; code: string }>
}

function dirname(file: string): string {
  const i = file.lastIndexOf('/')
  return i === -1 ? '' : file.slice(0, i)
}

function joinRelative(dir: string, spec: string): string {
  const parts = dir ? dir.split('/') : []
  for (const part of spec.split('/')) {
    if (part === '..') parts.pop()
    else if (part && part !== '.') parts.push(part)
  }
  return parts.join('/')
}

/** Local imports of a file: imported name → candidate files (JS/TS `import`/`require`, Python relative `from`). */
function localImports(file: string, lines: string[]): Map<string, string[]> {
  const out = new Map<string, string[]>()
  const text = lines.join('\n')
  const dir = dirname(file)
  const jsCandidates = (spec: string) => {
    const base = joinRelative(dir, spec.replace(/\.(m|c)?js$/, ''))
    return ['.ts', '.js', '.tsx', '.jsx', '.mjs', '/index.ts', '/index.js', ''].map((ext) => base + ext)
  }
  for (const m of text.matchAll(/import\s+(?:type\s+)?(?:(\w+)\s*,?\s*)?(?:\{([^}]*)\})?\s*from\s+['"](\.[^'"]+)['"]/g)) {
    const names = [m[1], ...(m[2] ?? '').split(',').map((n) => n.trim().split(/\s+as\s+/).pop())].filter((n): n is string => Boolean(n))
    for (const name of names) out.set(name, jsCandidates(m[3]))
  }
  for (const m of text.matchAll(/const\s+\{([^}]*)\}\s*=\s*require\(\s*['"](\.[^'"]+)['"]\s*\)/g)) {
    for (const name of m[1].split(',').map((n) => n.trim().split(':').pop()!.trim())) out.set(name, jsCandidates(m[2]))
  }
  for (const m of text.matchAll(/^from\s+(\.+)([\w.]*)\s+import\s+\(?([^)\n]+)\)?/gm)) {
    let base = dir
    for (let i = 1; i < m[1].length; i++) base = dirname(base)
    const path = joinRelative(base, m[2].replace(/\./g, '/'))
    for (const name of m[3].split(',').map((n) => n.trim().split(/\s+as\s+/).pop()!)) {
      out.set(name, [`${path}.py`, `${path}/__init__.py`])
    }
  }
  return out
}

/** Definition of the first project function the route code calls, if it's imported from a local file. */
function helperSnippet(
  file: string,
  code: string,
  readLines: (file: string) => string[] | null
): { file: string; line: number; code: string } | null {
  const lines = readLines(file)
  if (!lines) return null
  const imports = localImports(file, lines)
  const called = [...new Set([...code.matchAll(/\b([A-Za-z_]\w*)\s*\(/g)].map((m) => m[1]))].filter((n) => !NOT_HELPERS.has(n))
  for (const name of called) {
    for (const candidate of imports.get(name) ?? []) {
      const target = readLines(candidate)
      if (!target) continue
      const definition = new RegExp(`(function\\s+${name}\\b|\\b${name}\\s*[:=]\\s*(async\\s*)?(\\(|function|\\w+\\s*=>)|def\\s+${name}\\s*\\(|^\\s*(async\\s+)?${name}\\s*\\()`)
      const index = target.findIndex((l) => definition.test(l))
      if (index === -1) continue
      return { file: candidate, line: index + 1, code: target.slice(index, index + HELPER_LINES).join('\n') }
    }
  }
  return null
}

/** Enrichment applies to REST endpoints; GraphQL operations already carry their query. */
export function canEnrich(endpoint: DetectedEndpoint): boolean {
  return !endpoint.graphql
}

/**
 * Method, path, what we already know, and up to ~40 lines of code around where the route is
 * defined (and one place it is called), with credentials redacted.
 */
export function buildEndpointContext(
  endpoint: DetectedEndpoint,
  key: string,
  readLines: (file: string) => string[] | null
): EndpointContext {
  const callers = endpoint.callers ?? []
  const isCaller = (loc: { file: string; line: number }) => callers.some((c) => c.file === loc.file && c.line === loc.line)
  const locations = [...endpoint.sources.filter((s) => !isCaller(s)).slice(0, 2), ...callers.slice(0, 1)]

  const snippets: EndpointContext['snippets'] = []
  let total = 0
  const add = (file: string, line: number, raw: string) => {
    const code = scrubCode(raw).slice(0, SNIPPET_MAX_CHARS)
    if (total + code.length > CONTEXT_MAX_CHARS && snippets.length > 0) return false
    total += code.length
    snippets.push({ file, line, code })
    return true
  }
  for (const loc of locations) {
    const lines = readLines(loc.file)
    if (!lines) continue
    const from = Math.max(0, loc.line - 1 - LINES_BEFORE)
    const to = Math.min(lines.length, loc.line - 1 + LINES_AFTER)
    if (!add(loc.file, from + 1, lines.slice(from, to).join('\n'))) break
  }
  // The handler often passes the body straight to a service (`createArticle(req.body.article)`),
  // whose code shows the real field names.
  const primary = locations.find((l) => !isCaller(l))
  const helper = primary ? helperSnippet(primary.file, snippets[0]?.code ?? '', readLines) : null
  if (helper) add(helper.file, helper.line, helper.code)

  return {
    key,
    method: endpoint.method,
    path: endpoint.path,
    framework: endpoint.framework,
    requiresAuth: endpoint.securityRequired,
    body: endpoint.requestBody?.example,
    query: endpoint.parameters.filter((p) => p.in === 'query').map((p) => p.name),
    headers: endpoint.parameters.filter((p) => p.in === 'header').map((p) => p.name),
    snippets
  }
}

const SYSTEM_PROMPT = `You document HTTP API endpoints that were extracted from source code.
For each endpoint you get: method, path, framework, the request fields already detected, and code snippets.
Return JSON only, in this exact shape:
{"endpoints":[{"id":"e0","summary":"...","description":"...","requestBody":{...},"query":[{"name":"...","example":"...","description":"..."}],"headers":[{"name":"...","example":"...","description":"..."}],"response":{"status":200,"example":{...}}}]}
Rules:
- Use only what the code shows. Never invent fields, parameters or behaviour that are not in the snippets or the detected fields.
- Keep detected field names exactly as given. Give each field a realistic example value of the right type (emails, names, ISO dates, ids).
- Never output real secrets. For passwords, tokens and keys use placeholders like "<password>" or "<token>".
- summary: at most 8 words, imperative ("Create a user"). description: at most 2 sentences.
- response: the success status and an example body when the code shows what is returned; otherwise omit it.
- Omit any key you cannot determine. Do not wrap the JSON in markdown.`

export function buildEnrichMessages(contexts: EndpointContext[]): EnrichMessage[] {
  const payload = contexts.map(({ key, ...rest }) => ({ id: key, ...rest }))
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: JSON.stringify({ endpoints: payload }, null, 1) }
  ]
}

/** Rough token cost of enriching these contexts (≈4 characters per token plus the output budget). */
export function estimateEnrichTokens(contexts: EndpointContext[]): number {
  let total = 0
  for (let i = 0; i < contexts.length; i += ENRICH_BATCH_SIZE) {
    const batch = contexts.slice(i, i + ENRICH_BATCH_SIZE)
    const chars = buildEnrichMessages(batch).reduce((n, m) => n + m.content.length, 0)
    total += Math.ceil(chars / 4) + batch.length * ENRICH_OUTPUT_TOKENS_PER_ENDPOINT
  }
  return total
}

const primitive = z.union([z.string(), z.number(), z.boolean()])
const aiParamSchema = z.object({
  name: z.string().min(1).max(100),
  example: primitive.optional(),
  description: z.string().max(500).optional()
})
const aiEndpointSchema = z.object({
  id: z.string(),
  summary: z.string().max(200).optional(),
  description: z.string().max(1000).optional(),
  requestBody: z.unknown().optional(),
  query: z.array(aiParamSchema).optional(),
  headers: z.array(aiParamSchema).optional(),
  response: z
    .object({
      status: z.number().int().min(100).max(599).optional(),
      example: z.unknown().optional()
    })
    .optional()
})
export type AiEndpointEnrichment = z.infer<typeof aiEndpointSchema>

/** Parses the model's reply; tolerates a markdown fence or a bare array. Invalid items are dropped. */
export function parseEnrichResponse(text: string): AiEndpointEnrichment[] {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  let raw: unknown
  try {
    raw = JSON.parse((fenced ? fenced[1] : text).trim())
  } catch {
    return []
  }
  // Validate item by item so one malformed entry doesn't discard the whole batch.
  const list = Array.isArray(raw) ? raw : isPlainObject(raw) && Array.isArray(raw.endpoints) ? raw.endpoints : []
  return list.flatMap((item) => {
    const parsed = aiEndpointSchema.safeParse(item)
    return parsed.success ? [parsed.data] : []
  })
}

// ── Merging ─────────────────────────────────────────────────────────────────

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

/** Clips strings, blanks credential-named fields, and limits nesting. */
function sanitize(key: string, value: unknown, depth = 0): unknown {
  if (isSensitiveKey(key)) return typeof value === 'string' ? '' : value
  // Placeholders like "<EMAIL>" on ordinary fields: use a realistic value instead.
  if (typeof value === 'string' && /^<[^<>]{1,40}>$/.test(value.trim())) return /e-?mail/i.test(key) ? 'user@example.com' : ''
  if (typeof value === 'string') return value.slice(0, MAX_STRING)
  if (depth > 4) return Array.isArray(value) ? [] : isPlainObject(value) ? {} : value
  if (Array.isArray(value)) return value.slice(0, 3).map((v) => sanitize(key, v, depth + 1))
  if (isPlainObject(value)) return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, sanitize(k, v, depth + 1)]))
  return value
}

/** Keeps the detected shape and types; fills values; adds only fields the code mentions. */
function mergeValue(key: string, current: unknown, proposed: unknown, grounded: (name: string) => boolean): unknown {
  if (proposed === undefined || proposed === null) return current
  if (isPlainObject(current)) return isPlainObject(proposed) ? mergeObject(current, proposed, grounded) : current
  if (Array.isArray(current)) {
    if (!Array.isArray(proposed) || proposed.length === 0) return current
    const [first] = current
    return isPlainObject(first) && isPlainObject(proposed[0])
      ? [mergeObject(first, proposed[0], grounded)]
      : proposed.slice(0, 3).map((v) => sanitize(key, v))
  }
  // '' is the scanner's "type unknown" placeholder: a primitive may replace it, and so may an
  // object — but only with field names the code mentions.
  if (current === '' || current === undefined) {
    if (isPlainObject(proposed)) {
      const kept = Object.entries(proposed).filter(([k]) => grounded(k))
      return kept.length ? Object.fromEntries(kept.map(([k, v]) => [k, sanitize(k, v)])) : current
    }
    if (Array.isArray(proposed)) return proposed.every((v) => !isPlainObject(v)) ? proposed.slice(0, 3).map((v) => sanitize(key, v)) : current
    return sanitize(key, proposed)
  }
  return typeof proposed === typeof current ? sanitize(key, proposed) : current
}

function mergeObject(
  current: Record<string, unknown>,
  proposed: Record<string, unknown>,
  grounded: (name: string) => boolean
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...current }
  for (const [key, value] of Object.entries(proposed)) {
    if (key in current) out[key] = mergeValue(key, current[key], value, grounded)
    else if (grounded(key)) out[key] = sanitize(key, value)
  }
  return out
}

function oneLine(text: string, max: number): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, max)
}

/**
 * Applies one AI answer to an endpoint. `groundText` is the code that was sent; a field or
 * parameter the model adds must appear in it, so it can't invent API surface.
 */
export function applyEnrichment(endpoint: DetectedEndpoint, ai: AiEndpointEnrichment, groundText: string): DetectedEndpoint {
  const grounded = (name: string) =>
    name.length > 0 && new RegExp(`(^|[^\\w-])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^\\w-]|$)`).test(groundText)
  const next: DetectedEndpoint = { ...endpoint, parameters: endpoint.parameters.map((p) => ({ ...p })) }
  const filled = new Set<string>()

  if (ai.summary?.trim() && !(endpoint.origin === 'openapi' && endpoint.summary)) {
    next.summary = oneLine(ai.summary, 80)
    filled.add('summary')
  }
  if (ai.description?.trim()) {
    const text = oneLine(ai.description, 400)
    next.description = endpoint.description ? `${text}\n\n${endpoint.description}` : text
    filled.add('description')
  }

  if (BODY_METHODS.has(endpoint.method) && ai.requestBody !== undefined) {
    const current = endpoint.requestBody?.example
    let body: unknown
    if (current !== undefined) {
      body = mergeValue('body', current, ai.requestBody, grounded)
    } else if (endpoint.method !== 'DELETE' && isPlainObject(ai.requestBody)) {
      const kept = Object.entries(ai.requestBody).filter(([k]) => grounded(k))
      body = kept.length ? Object.fromEntries(kept.map(([k, v]) => [k, sanitize(k, v)])) : undefined
    }
    if (body !== undefined && JSON.stringify(body) !== JSON.stringify(current)) {
      next.requestBody = { required: true, contentTypes: endpoint.requestBody?.contentTypes ?? ['application/json'], ...endpoint.requestBody, example: body }
      filled.add('body')
    }
  }

  const mergeParams = (location: 'query' | 'header', proposed: AiEndpointEnrichment['query']) => {
    for (const param of proposed ?? []) {
      const name = location === 'header' ? param.name.toLowerCase() : param.name
      if (location === 'header' && name === 'authorization') continue
      let existing = next.parameters.find((p) => p.in === location && p.name.toLowerCase() === name.toLowerCase())
      if (!existing) {
        if (!grounded(param.name)) continue
        existing = { name, in: location, required: false } satisfies ApiSpecParameter
        next.parameters.push(existing)
      }
      if (param.description) existing.description = oneLine(param.description, 200)
      if (param.example !== undefined && !isSensitiveKey(name)) existing.example = String(param.example).slice(0, MAX_STRING)
      filled.add(location === 'query' ? 'query' : 'headers')
    }
  }
  mergeParams('query', ai.query)
  mergeParams('header', ai.headers)

  if (ai.response?.example !== undefined && ai.response.example !== null) {
    next.responseExample = sanitize('response', ai.response.example)
    if (next.responses.length === 0) {
      next.responses = [{ status: String(ai.response.status ?? 200), description: 'Example response' }]
    }
    filled.add('response')
  }

  if (filled.size === 0) return endpoint
  next.aiEnriched = [...new Set([...(endpoint.aiEnriched ?? []), ...filled])]
  return next
}
