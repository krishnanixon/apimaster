import { v4 as uuidv4 } from 'uuid'
import type {
  ApiCollection,
  ApiEnvironment,
  ApiFolder,
  ApiRequest,
  HttpMethod,
  KeyValuePair,
  RequestAuth,
  RequestBody
} from '../../types/api-studio'

export type ImportFormat = 'shurikly' | 'postman' | 'insomnia' | 'bruno' | 'har' | 'openapi' | 'curl'

export const IMPORT_FORMAT_LABELS: Record<ImportFormat, string> = {
  shurikly: 'Shurikly backup',
  postman: 'Postman collection',
  insomnia: 'Insomnia export',
  bruno: 'Bruno collection',
  har: 'HAR archive',
  openapi: 'OpenAPI document',
  curl: 'cURL command'
}

/** What an import produced and what it had to leave out, shown to the user afterwards. */
export interface ImportSummary {
  format: ImportFormat
  requests: number
  folders: number
  environments: number
  /** Things that were not imported (unsupported auth, static assets, template tags…). */
  skipped: string[]
  /** Imported, but worth a look (translated scripts, guessed body types…). */
  warnings: string[]
}

export type ImportedEnvironment = Omit<ApiEnvironment, 'id'>

export interface ImportResult {
  /** One collection per Insomnia workspace / Bruno collection / HAR file. */
  collections: ApiCollection[]
  environments: ImportedEnvironment[]
  summary: ImportSummary
}

const METHODS = new Set<HttpMethod>(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'])

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function str(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return fallback
}

export function toMethod(value: unknown): HttpMethod | null {
  const method = str(value).trim().toUpperCase() as HttpMethod
  return METHODS.has(method) ? method : null
}

export function kv(key: string, value = '', enabled = true, description?: string): KeyValuePair {
  return { id: uuidv4(), key, value, enabled, ...(description ? { description } : {}) }
}

export function newId(): string {
  return uuidv4()
}

export function folder(name: string, parentId: string | null, extra: Partial<ApiFolder> = {}): ApiFolder {
  return { id: uuidv4(), name: name || 'Folder', parentId, ...extra }
}

export function request(fields: Partial<ApiRequest> & Pick<ApiRequest, 'name' | 'method' | 'url'>, now: string): ApiRequest {
  const built: ApiRequest = {
    id: uuidv4(),
    headers: [],
    queryParams: [],
    body: { type: 'none', content: '' },
    auth: { type: 'inherit' },
    requestType: 'http',
    folderId: null,
    ...fields,
    updatedAt: now
  }
  // Like `createEmptyRequest`: the key/value tables start with a blank row to type into.
  if (built.headers.length === 0) built.headers = [kv('')]
  if (built.queryParams.length === 0) built.queryParams = [kv('')]
  return built
}

export function collection(name: string, now: string, extra: Partial<ApiCollection> = {}): ApiCollection {
  return {
    id: uuidv4(),
    name: name || 'Imported Collection',
    description: '',
    folders: [],
    requests: [],
    createdAt: now,
    updatedAt: now,
    ...extra
  }
}

export function environment(name: string, variables: KeyValuePair[], now: string): ImportedEnvironment {
  return { name: name || 'Imported Environment', variables, createdAt: now, updatedAt: now }
}

/** `{ a: 1, b: { c: 2 } }` → `a=1`, `b.c=2` — Insomnia environments nest, ours are flat. */
export function flattenVariables(data: unknown, prefix = ''): KeyValuePair[] {
  if (!isRecord(data)) return []
  const out: KeyValuePair[] = []
  for (const [key, value] of Object.entries(data)) {
    const name = prefix ? `${prefix}.${key}` : key
    if (isRecord(value)) out.push(...flattenVariables(value, name))
    else if (Array.isArray(value)) out.push(kv(name, JSON.stringify(value)))
    else out.push(kv(name, value === null || value === undefined ? '' : str(value)))
  }
  return out
}

/** Merges `override` over `base` by key (sub-environments inherit the base environment). */
export function mergeVariables(base: KeyValuePair[], override: KeyValuePair[]): KeyValuePair[] {
  const keys = new Set(override.map((v) => v.key))
  return [...base.filter((v) => !keys.has(v.key)).map((v) => kv(v.key, v.value, v.enabled)), ...override]
}

/** Splits `https://x/y?a=1&b` into the URL without its query string and enabled params. */
export function splitQuery(url: string): { base: string; params: KeyValuePair[] } {
  const index = url.indexOf('?')
  if (index === -1) return { base: url, params: [] }
  const query = url.slice(index + 1).split('#')[0]
  const params = query
    .split('&')
    .filter(Boolean)
    .map((part) => {
      const eq = part.indexOf('=')
      const rawKey = eq === -1 ? part : part.slice(0, eq)
      const rawValue = eq === -1 ? '' : part.slice(eq + 1)
      return kv(safeDecode(rawKey), safeDecode(rawValue))
    })
  return { base: url.slice(0, index), params }
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, ' '))
  } catch {
    return value
  }
}

/** `:id` and `{id}` path tokens, matching what the request builder shows as path params. */
export function pathParams(url: string, values: Record<string, string> = {}): KeyValuePair[] | undefined {
  // Same token rules as `extractPathParamKeys` in the request builder.
  const path = url.split('?')[0]
  const keys = new Set<string>()
  for (const match of path.matchAll(/(?<=\/):([A-Za-z_]\w*)/g)) keys.add(match[1])
  for (const match of path.matchAll(/(?<!\{)\{([A-Za-z_]\w*)\}(?!\})/g)) keys.add(match[1])
  if (keys.size === 0) return undefined
  return [...keys].map((key) => kv(key, values[key] ?? ''))
}

export function jsonOrText(content: string, mime = ''): RequestBody {
  if (mime.includes('json')) return { type: 'json', content }
  if (!mime) {
    const trimmed = content.trim()
    if ((trimmed.startsWith('{') || trimmed.startsWith('[')) && isJson(trimmed)) return { type: 'json', content }
  }
  return { type: 'text', content }
}

export function isJson(text: string): boolean {
  try {
    JSON.parse(text)
    return true
  } catch {
    return false
  }
}

/** Url-encoded bodies are stored as `key=value` lines (see `parseUrlEncoded`). */
export function urlEncodedBody(pairs: Array<{ key: string; value: string; enabled?: boolean }>): RequestBody {
  const lines = pairs.filter((p) => p.enabled !== false && p.key).map((p) => `${p.key}=${p.value}`)
  return { type: 'x-www-form-urlencoded', content: lines.join('\n') }
}

export function noAuth(): RequestAuth {
  return { type: 'none' }
}

/** Adds a skipped/warning note once, keeping the summary readable on big imports. */
export class NoteList {
  private readonly counts = new Map<string, number>()

  add(note: string): void {
    this.counts.set(note, (this.counts.get(note) ?? 0) + 1)
  }

  list(): string[] {
    return [...this.counts].map(([note, count]) => (count > 1 ? `${note} (×${count})` : note))
  }
}

export function summarize(
  format: ImportFormat,
  collections: ApiCollection[],
  environments: ImportedEnvironment[],
  skipped: NoteList,
  warnings: NoteList
): ImportSummary {
  return {
    format,
    requests: collections.reduce((n, c) => n + c.requests.length, 0),
    folders: collections.reduce((n, c) => n + c.folders.length, 0),
    environments: environments.length,
    skipped: skipped.list(),
    warnings: warnings.list()
  }
}
