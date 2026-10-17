import yaml from 'js-yaml'
import { buildCollectionFromEndpoints } from '../code-scanner/spec-to-collection'
import { extractOpenApi } from '../code-scanner/extractors/openapi'
import { NoteList, environment, isRecord, kv, str, summarize, type ImportResult } from './common'

export function isOpenApiDocument(value: unknown): boolean {
  return isRecord(value) && isRecord(value.paths) && (typeof value.openapi === 'string' || typeof value.swagger === 'string')
}

/** OpenAPI 3 / Swagger 2 (JSON or YAML), built the same way the Code Scanner builds collections. */
export function importOpenApi(text: string, now = new Date().toISOString()): ImportResult {
  const isJsonText = text.trim().startsWith('{')
  const doc = isJsonText ? (JSON.parse(text) as unknown) : yaml.load(text)
  if (!isOpenApiDocument(doc)) throw new Error('Not an OpenAPI document')
  const extraction = extractOpenApi(isJsonText ? 'openapi.json' : 'openapi.yaml', text)
  if (!extraction) throw new Error('Could not read the OpenAPI document')
  const info = isRecord((doc as Record<string, unknown>).info) ? ((doc as Record<string, unknown>).info as Record<string, unknown>) : {}
  const name = str(info.title) || 'OpenAPI import'
  const built = buildCollectionFromEndpoints(
    extraction.endpoints.map((e) => ({ ...e, sources: [] })),
    { name, baseUrl: extraction.baseUrl ?? 'http://localhost:3000', auth: extraction.authScheme, description: str(info.description), now }
  )
  // Imported specs are not tied to a scanned folder, so drop the re-scan bookkeeping.
  for (const request of built.collection.requests) delete request.scan
  const skipped = new NoteList()
  const warnings = new NoteList()
  if (!extraction.baseUrl) warnings.add('The document declares no server; set baseUrl in the environment')
  const environments = built.environmentVariables.length
    ? [environment(`${name} (local)`, built.environmentVariables.map((v) => kv(v.key, v.value)), now)]
    : []
  return { collections: [built.collection], environments, summary: summarize('openapi', [built.collection], environments, skipped, warnings) }
}
