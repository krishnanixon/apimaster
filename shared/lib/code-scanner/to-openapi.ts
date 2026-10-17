/**
 * OpenAPI 3.0 document from a scan: paths, parameters, request bodies and (AI) example responses,
 * with JSON schemas inferred from the examples and the detected auth as a security scheme.
 */
import type { AuthScheme, DetectedEndpoint } from '../../types/code-scanner'

export interface OpenApiExportInput {
  title: string
  baseUrl: string
  auth?: AuthScheme
  endpoints: DetectedEndpoint[]
}

type Json = Record<string, unknown>

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/
const DATE = /^\d{4}-\d{2}-\d{2}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** A JSON Schema describing an example value. */
export function inferSchema(value: unknown, depth = 0): Json {
  if (value === null || value === undefined) return { nullable: true }
  if (Array.isArray(value)) return { type: 'array', items: value.length && depth < 6 ? inferSchema(value[0], depth + 1) : {} }
  if (typeof value === 'object') {
    if (depth >= 6) return { type: 'object' }
    return {
      type: 'object',
      properties: Object.fromEntries(Object.entries(value as Json).map(([k, v]) => [k, inferSchema(v, depth + 1)]))
    }
  }
  if (typeof value === 'number') return { type: Number.isInteger(value) ? 'integer' : 'number' }
  if (typeof value === 'boolean') return { type: 'boolean' }
  const text = String(value)
  const format = EMAIL.test(text) ? 'email' : DATE_TIME.test(text) ? 'date-time' : DATE.test(text) ? 'date' : UUID.test(text) ? 'uuid' : /^https?:\/\//.test(text) ? 'uri' : undefined
  return format ? { type: 'string', format } : { type: 'string' }
}

function securityScheme(auth: AuthScheme): Json {
  if (auth.type === 'apiKey') return { type: 'apiKey', name: auth.name, in: auth.in }
  if (auth.type === 'basic') return { type: 'http', scheme: 'basic' }
  if (auth.prefix && auth.prefix !== 'Bearer') {
    return { type: 'apiKey', name: 'Authorization', in: 'header', description: `Send "${auth.prefix} <token>"` }
  }
  return { type: 'http', scheme: 'bearer' }
}

function operationId(endpoint: DetectedEndpoint, used: Set<string>): string {
  const base =
    endpoint.operationId?.replace(/[^\w]/g, '_') ||
    `${endpoint.method.toLowerCase()}${endpoint.path
      .split('/')
      .filter(Boolean)
      .map((s) => s.replace(/^[:{]|}$/g, 'by_').replace(/[^\w]/g, '_'))
      .map((s) => s[0]?.toUpperCase() + s.slice(1))
      .join('')}`
  let id = base || 'operation'
  for (let n = 2; used.has(id); n++) id = `${base}${n}`
  used.add(id)
  return id
}

/** Endpoints that describe the project's own REST API (GraphQL operations and third-party calls are left out). */
export function exportableEndpoints(endpoints: DetectedEndpoint[]): DetectedEndpoint[] {
  return endpoints.filter((e) => !e.graphql && !e.host)
}

export function scanToOpenApi(input: OpenApiExportInput): Json {
  const paths: Record<string, Json> = {}
  const usedIds = new Set<string>()
  const secured = input.auth ? [{ default: [] as string[] }] : undefined

  for (const endpoint of exportableEndpoints(input.endpoints)) {
    const path = endpoint.path.replace(/:(\w+)/g, '{$1}')
    const pathParams = [...path.matchAll(/\{(\w+)\}/g)].map((m) => m[1])
    const parameters = [
      ...pathParams.map((name) => ({ name, in: 'path', required: true, schema: { type: 'string' } })),
      ...endpoint.parameters
        .filter((p) => p.in !== 'path')
        .map((p) => ({
          name: p.name,
          in: p.in,
          required: p.required,
          ...(p.description ? { description: p.description } : {}),
          schema: { type: 'string' },
          ...(p.example !== undefined ? { example: p.example } : {})
        }))
    ]

    const example = endpoint.requestBody?.example
    const contentType = endpoint.requestBody?.contentTypes[0] ?? 'application/json'
    const responseStatus = endpoint.responses[0]?.status ?? (endpoint.method === 'POST' ? '201' : '200')
    const operation: Json = {
      operationId: operationId(endpoint, usedIds),
      ...(endpoint.summary ? { summary: endpoint.summary } : {}),
      ...(endpoint.description ? { description: endpoint.description } : {}),
      tags: endpoint.tags,
      ...(parameters.length ? { parameters } : {}),
      ...(example !== undefined
        ? { requestBody: { required: endpoint.requestBody?.required ?? true, content: { [contentType]: { schema: inferSchema(example), example } } } }
        : {}),
      responses: {
        [responseStatus]: {
          description: endpoint.responses[0]?.description ?? 'Success',
          ...(endpoint.responseExample !== undefined
            ? { content: { 'application/json': { schema: inferSchema(endpoint.responseExample), example: endpoint.responseExample } } }
            : {})
        }
      },
      ...(endpoint.securityRequired && secured ? { security: secured } : {}),
      'x-source': endpoint.sources.map((s) => `${s.file}:${s.line}`)
    }
    paths[path] = { ...(paths[path] ?? {}), [endpoint.method.toLowerCase()]: operation }
  }

  return {
    openapi: '3.0.3',
    info: {
      title: input.title || 'Scanned API',
      version: '1.0.0',
      description: 'Generated by Shurikly Code Scanner from source code. Review before publishing.'
    },
    servers: [{ url: input.baseUrl }],
    paths,
    ...(input.auth ? { components: { securitySchemes: { default: securityScheme(input.auth) } } } : {})
  }
}
