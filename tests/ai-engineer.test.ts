import { describe, it, expect } from 'vitest'
import { parseOpenApiDocument } from '@shared/lib/ai-engineer/openapi-import'
import { buildApiSpecFromCollection } from '@shared/lib/ai-engineer/collection-spec'
import { generateBaselineTests } from '@shared/lib/ai-engineer/baseline-tests'
import { runAssertions } from '@shared/lib/ai-engineer/assertions'
import { testRequiresApproval } from '@shared/lib/ai-engineer/execution-policy'
import { aiGeneratedTestSchema } from '@shared/lib/ai-engineer/schemas'
import { DEFAULT_AI_ENGINEER_CONFIG } from '@shared/types/ai-engineer'
import type { ApiCollection } from '@shared/types/api-studio'

const sampleOpenApi = JSON.stringify({
  openapi: '3.0.0',
  info: { title: 'Users API', version: '1.0.0' },
  servers: [{ url: 'https://api.example.com' }],
  paths: {
    '/users': {
      get: { responses: { '200': { description: 'OK' } } },
      post: {
        security: [{ bearer: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } },
        responses: { '201': { description: 'Created' } }
      }
    },
    '/users/{id}': {
      get: {
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'OK' } }
      }
    }
  },
  security: [{ bearer: [] }]
})

describe('ai engineer openapi import', () => {
  it('parses endpoints and auth metadata', () => {
    const spec = parseOpenApiDocument(sampleOpenApi)
    expect(spec.endpointCount).toBe(3)
    expect(spec.baseUrl).toBe('https://api.example.com')
    expect(spec.endpoints.some((e) => e.path === '/users/{id}')).toBe(true)
  })
})

describe('ai engineer collection spec', () => {
  it('builds spec from collection requests', () => {
    const collection: ApiCollection = {
      id: 'c1',
      name: 'Demo',
      description: '',
      folders: [],
      requests: [
        {
          id: 'r1',
          name: 'List users',
          method: 'GET',
          url: 'https://api.example.com/users',
          headers: [],
          queryParams: [],
          pathParams: [],
          body: { type: 'none', content: '' },
          auth: { type: 'none' },
          tests: '',
          preRequestScript: '',
          description: '',
          requestType: 'http',
          folderId: null,
          timeoutMs: 30_000,
          updatedAt: new Date().toISOString()
        }
      ],
      auth: { type: 'none' },
      headers: [],
      preRequestScript: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    const spec = buildApiSpecFromCollection(collection)
    expect(spec.endpointCount).toBe(1)
    expect(spec.endpoints[0].path).toBe('/users')
  })
})

describe('ai engineer baseline tests', () => {
  it('creates functional tests per endpoint', () => {
    const spec = parseOpenApiDocument(sampleOpenApi)
    const tests = generateBaselineTests('analysis-1', spec)
    expect(tests.length).toBeGreaterThanOrEqual(spec.endpointCount)
    expect(tests.every((t) => t.aiGenerated === false)).toBe(true)
  })
})

describe('ai engineer assertions', () => {
  it('evaluates status assertions', () => {
    const results = runAssertions([], {
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: {},
      data: '{}',
      isBinary: false,
      contentType: 'application/json',
      timeMs: 10,
      sizeBytes: 2
    }, [200, 201])
    expect(results.some((r) => r.passed)).toBe(true)
  })
})

describe('execution policy', () => {
  it('requires approval for mutations by default', () => {
    expect(
      testRequiresApproval(
        { method: 'POST', riskLevel: 'medium' },
        DEFAULT_AI_ENGINEER_CONFIG
      )
    ).toBe(true)
  })
})

describe('ai generated test schema', () => {
  it('validates structured AI test payloads', () => {
    const parsed = aiGeneratedTestSchema.parse({
      name: 'Test',
      method: 'GET',
      url: 'https://api.example.com/x',
      expectedStatus: [200],
      reason: 'Check endpoint',
      riskLevel: 'low',
      category: 'functional'
    })
    expect(parsed.method).toBe('GET')
  })
})
