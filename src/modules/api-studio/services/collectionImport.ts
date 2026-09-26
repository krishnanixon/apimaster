import { v4 as uuidv4 } from 'uuid'
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

/** Imports an APIMaster backup or a Postman collection without dropping GraphQL fields. */
export function importCollectionJson(json: string): { collection: ApiCollection; warnings: string[] } {
  const parsed = JSON.parse(json) as unknown
  if (isNativeCollection(parsed)) {
    return { collection: importNativeCollection(parsed), warnings: [] }
  }
  return importPostmanCollection(json)
}
