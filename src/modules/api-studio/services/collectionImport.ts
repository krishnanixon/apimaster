import { v4 as uuidv4 } from 'uuid'
import {
  NoteList,
  detectImportFormat,
  importBruno,
  importHar,
  importInsomnia,
  importOpenApi,
  summarize,
  type BrunoSourceFile,
  type ImportFormat,
  type ImportResult
} from '@shared/lib/importers'
import type { ApiCollection, ApiRequest } from '../types/api.types'
import { normalizeStoredRequest } from './graphql/model'
import { looksLikeCurl, validateCurl } from './curlParser'
import { importPostmanCollection } from './postman'

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isNativeCollection(value: unknown): value is ApiCollection {
  if (!isRecord(value) || typeof value.name !== 'string' || !Array.isArray(value.requests)) return false
  if (isRecord(value.info) && Array.isArray(value.item)) return false
  if (typeof value.openapi === 'string') return false
  return Array.isArray(value.folders) || value.requests.length === 0
}

function importNativeCollection(value: ApiCollection): ApiCollection {
  const now = new Date().toISOString()
  return {
    ...value,
    id: typeof value.id === 'string' && value.id ? value.id : uuidv4(),
    name: value.name,
    description: value.description ?? '',
    folders: Array.isArray(value.folders) ? value.folders : [],
    requests: value.requests.map((request) => normalizeStoredRequest(request as ApiRequest)),
    createdAt: value.createdAt || now,
    updatedAt: value.updatedAt || now
  }
}

function single(format: ImportFormat, collection: ApiCollection, warnings: string[]): ImportResult {
  const notes = new NoteList()
  warnings.forEach((w) => notes.add(w))
  return { collections: [collection], environments: [], summary: summarize(format, [collection], [], new NoteList(), notes) }
}

export interface ImportTextOptions {
  /** HAR only: leave out images, CSS, JS and fonts (default true). */
  skipStaticAssets?: boolean
}

/**
 * Imports a pasted or dropped export, working out the format first: Shurikly backup, Postman,
 * Insomnia (v4 JSON/YAML, v5 YAML), HAR or OpenAPI. cURL is handled by `importCurlAsTab`.
 */
export function importFromText(text: string, options: ImportTextOptions = {}): ImportResult {
  const format = detectImportFormat(text)
  switch (format) {
    case 'insomnia':
      return importInsomnia(text)
    case 'har':
      return importHar(text, { skipStaticAssets: options.skipStaticAssets })
    case 'openapi':
      return importOpenApi(text)
    case 'shurikly':
      if (isNativeCollection(JSON.parse(text))) return single('shurikly', importNativeCollection(JSON.parse(text) as ApiCollection), [])
      break
    case 'postman': {
      const { collection, warnings } = importPostmanCollection(text)
      return single('postman', collection, warnings)
    }
    case 'curl':
      throw new Error('cURL commands open as a request tab')
  }
  throw new Error('Unrecognised format. Supported: Postman, Insomnia, Bruno, HAR, OpenAPI, cURL and Shurikly backups')
}

export function importBrunoFolder(files: BrunoSourceFile[]): ImportResult {
  return importBruno(files)
}

/** Imports a Shurikly backup or a Postman collection without dropping GraphQL fields. */
export function importCollectionJson(json: string): { collection: ApiCollection; warnings: string[] } {
  const parsed = JSON.parse(json) as unknown
  if (isNativeCollection(parsed)) {
    return { collection: importNativeCollection(parsed), warnings: [] }
  }
  const format = detectImportFormat(json)
  if (format === 'insomnia' || format === 'har' || format === 'openapi') {
    // Only the first collection fits this single-collection API (used by the MCP tool).
    const result = importFromText(json)
    if (!result.collections[0]) throw new Error('Nothing to import')
    return { collection: result.collections[0], warnings: [...result.summary.skipped, ...result.summary.warnings] }
  }
  return importPostmanCollection(json)
}

export interface RequestImport {
  requests: ApiRequest[]
  /** What the text was recognised as, e.g. "cURL" or "Postman". */
  formatLabel: string
  warnings: string[]
}

const FORMAT_LABELS: Record<ImportFormat, string> = {
  shurikly: 'Shurikly',
  postman: 'Postman',
  insomnia: 'Insomnia',
  bruno: 'Bruno',
  har: 'HAR',
  openapi: 'OpenAPI',
  curl: 'cURL'
}

function looksLikeStoredRequest(value: unknown): value is ApiRequest {
  return (
    isRecord(value) &&
    typeof value.method === 'string' &&
    typeof value.url === 'string' &&
    Array.isArray(value.headers) &&
    isRecord(value.body)
  )
}

/**
 * Reads one or a few requests out of pasted text or a file: a cURL command, a single
 * Postman item, a Shurikly request, or any collection format (its requests, flattened).
 * Throws with a readable message when nothing usable is found.
 */
export function importRequestsFromText(text: string): RequestImport {
  const trimmed = text.trim()
  if (!trimmed) throw new Error('Paste a cURL command or a request file')

  if (looksLikeCurl(trimmed)) {
    const result = validateCurl(trimmed)
    if (!result.ok) throw new Error(result.error)
    return { requests: [result.request], formatLabel: 'cURL', warnings: result.warnings }
  }

  let parsed: unknown = undefined
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    // YAML (Insomnia / OpenAPI) is handled by importFromText below.
  }

  if (looksLikeStoredRequest(parsed)) {
    const request = normalizeStoredRequest({ ...parsed, id: uuidv4(), folderId: null, updatedAt: new Date().toISOString() })
    return { requests: [request], formatLabel: 'Shurikly request', warnings: [] }
  }

  // A single Postman item ({ name, request }) copied out of a collection file.
  if (isRecord(parsed) && isRecord(parsed.request) && !parsed.info && !parsed.item) {
    const wrapped = JSON.stringify({
      info: { name: String(parsed.name ?? 'Request'), schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
      item: [parsed]
    })
    const { collection, warnings } = importPostmanCollection(wrapped)
    return { requests: collection.requests.map((r) => ({ ...r, folderId: null })), formatLabel: 'Postman request', warnings }
  }

  const format = detectImportFormat(trimmed)
  if (!format) throw new Error('Not recognised. Paste a cURL command, or a Postman, HAR, Insomnia or Shurikly export.')
  const result = importFromText(trimmed, { skipStaticAssets: true })
  const requests = result.collections.flatMap((c) => c.requests).map((r) => ({ ...r, id: uuidv4(), folderId: null }))
  if (requests.length === 0) throw new Error(`No requests found in this ${FORMAT_LABELS[format]} file`)
  return { requests, formatLabel: FORMAT_LABELS[format], warnings: [...result.summary.skipped, ...result.summary.warnings] }
}
