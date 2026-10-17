import yaml from 'js-yaml'
import type { AuthScheme, DetectedEndpoint } from '../../../types/code-scanner'
import { parseOpenApiDocument } from '../../ai-engineer/openapi-import'
import { joinRoutePaths } from '../paths'

/** Placeholder `parseOpenApiDocument` returns when a document has no `servers`. */
const PLACEHOLDER_BASE_URL = 'https://api.example.com'

export function isOpenApiCandidate(path: string): boolean {
  return /(^|\/)(openapi|swagger)[^/]*\.(json|ya?ml)$/i.test(path) || /(^|\/)api-docs?\.(json|ya?ml)$/i.test(path)
}

export interface OpenApiExtraction {
  endpoints: DetectedEndpoint[]
  /** Server URL declared by the document, when it declares a real one. */
  baseUrl?: string
  /** First security scheme the document declares (`components.securitySchemes` / `securityDefinitions`). */
  authScheme?: AuthScheme
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v)
}

/** Swagger 2 has `host` + `basePath` instead of `servers`. */
function swagger2BaseUrl(doc: Record<string, unknown>): string | undefined {
  if (typeof doc.host !== 'string' || !doc.host) return undefined
  const scheme = Array.isArray(doc.schemes) && typeof doc.schemes[0] === 'string' ? doc.schemes[0] : 'http'
  const basePath = typeof doc.basePath === 'string' ? doc.basePath : ''
  return `${scheme}://${doc.host}${basePath}`.replace(/\/$/, '')
}

function securityScheme(doc: Record<string, unknown>): AuthScheme | undefined {
  const components = isRecord(doc.components) ? doc.components : {}
  const schemes = isRecord(components.securitySchemes)
    ? components.securitySchemes
    : isRecord(doc.securityDefinitions)
      ? doc.securityDefinitions
      : {}
  for (const scheme of Object.values(schemes)) {
    if (!isRecord(scheme)) continue
    if (scheme.type === 'apiKey' && typeof scheme.name === 'string' && (scheme.in === 'header' || scheme.in === 'query')) {
      return { type: 'apiKey', name: scheme.name, in: scheme.in }
    }
    if (scheme.type === 'basic' || (scheme.type === 'http' && /^basic$/i.test(String(scheme.scheme)))) return { type: 'basic' }
    if ((scheme.type === 'http' && /^bearer$/i.test(String(scheme.scheme))) || scheme.type === 'oauth2' || scheme.type === 'openIdConnect') {
      return { type: 'bearer' }
    }
  }
  return undefined
}

function lineOfPath(lines: string[], path: string): number {
  const index = lines.findIndex((line) => line.includes(`"${path}"`) || line.includes(`'${path}'`) || line.trimStart().startsWith(`${path}:`))
  return index === -1 ? 1 : index + 1
}

/**
 * Reads an OpenAPI 3 / Swagger 2 document shipped in the project.
 * Returns null when the file is not an API description (e.g. an unrelated `api-doc.json`).
 */
export function extractOpenApi(file: string, content: string): OpenApiExtraction | null {
  let doc: unknown
  try {
    doc = /\.ya?ml$/i.test(file) ? yaml.load(content) : JSON.parse(content)
  } catch {
    return null
  }
  if (!isRecord(doc) || !isRecord(doc.paths)) return null
  if (typeof doc.openapi !== 'string' && typeof doc.swagger !== 'string') return null

  const spec = parseOpenApiDocument(JSON.stringify(doc))
  const lines = content.split('\n')
  // A relative server (`/api/v1`) is part of every path; keep paths complete so they merge with code routes.
  const relativeServer = spec.baseUrl.startsWith('/') ? spec.baseUrl : ''
  const endpoints: DetectedEndpoint[] = spec.endpoints.map((endpoint) => ({
    ...endpoint,
    path: relativeServer ? joinRoutePaths(relativeServer, endpoint.path) : endpoint.path,
    origin: 'openapi',
    framework: 'openapi',
    confidence: 'high',
    sources: [{ file, line: lineOfPath(lines, endpoint.path) }]
  }))

  const declared = relativeServer
    ? undefined
    : spec.baseUrl !== PLACEHOLDER_BASE_URL
      ? spec.baseUrl
      : swagger2BaseUrl(doc)
  return { endpoints, baseUrl: declared, authScheme: securityScheme(doc) }
}
