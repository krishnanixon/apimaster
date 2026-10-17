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
