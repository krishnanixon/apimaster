import { describe, expect, it } from 'vitest'
import { parseOpenApiDocument } from '../shared/lib/ai-engineer/openapi-import'
import { schemaExample } from '../shared/lib/schema-example'
import { buildCollectionFromEndpoints } from '../shared/lib/code-scanner/spec-to-collection'
import { ProjectAnalyzer } from '../shared/lib/code-scanner/analyzer'

const openapi3 = {
  openapi: '3.0.3',
  info: { title: 'Pets', version: '1' },
  servers: [{ url: 'http://localhost:9000' }],
  paths: {
    '/users/{id}': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
      put: {
        parameters: [{ $ref: '#/components/parameters/Tenant' }, { name: 'dryRun', in: 'query', schema: { type: 'boolean' } }],
        requestBody: { $ref: '#/components/requestBodies/UserBody' }
      },
      get: { parameters: [{ name: 'id', in: 'path', required: true, description: 'Overrides the path-level one' }] }
    }
  },
  components: {
    parameters: { Tenant: { name: 'X-Tenant', in: 'header', example: 'acme' } },
    requestBodies: { UserBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } } } },
    schemas: {
      User: {
        allOf: [
          { $ref: '#/components/schemas/Base' },
          {
            type: 'object',
            properties: {
              email: { type: 'string', format: 'email' },
              role: { type: 'string', enum: ['admin', 'member'] },
              age: { type: 'integer', minimum: 18 },
              tags: { type: 'array', items: { type: 'string' } },
              manager: { $ref: '#/components/schemas/User' }
            }
          }
        ]
      },
      Base: { type: 'object', properties: { id: { type: 'string', readOnly: true }, createdAt: { type: 'string', format: 'date-time' } } }
    }
  }
}

describe('OpenAPI import', () => {
  it('resolves $ref bodies and parameters and merges path-level parameters', () => {
    const spec = parseOpenApiDocument(JSON.stringify(openapi3))
    const put = spec.endpoints.find((e) => e.method === 'PUT')!
    expect(put.parameters.map((p) => `${p.in}:${p.name}=${p.example ?? ''}`)).toEqual([
      'path:id=00000000-0000-0000-0000-000000000000',
      'header:X-Tenant=acme',
      'query:dryRun=false'
    ])
    expect(put.requestBody).toMatchObject({ required: true, contentTypes: ['application/json'] })
    expect(put.requestBody?.example).toEqual({
      createdAt: '2024-01-01T00:00:00.000Z',
      email: 'user@example.com',
      role: 'admin',
      age: 18,
      tags: [''],
      manager: {}
    })
    const get = spec.endpoints.find((e) => e.method === 'GET')!
    expect(get.parameters).toEqual([expect.objectContaining({ name: 'id', description: 'Overrides the path-level one' })])
  })

  it('reads Swagger 2 body and formData parameters', () => {
    const spec = parseOpenApiDocument(
      JSON.stringify({
        swagger: '2.0',
        info: {},
        consumes: ['application/json'],
        paths: {
          '/pets': { post: { parameters: [{ in: 'body', name: 'pet', required: true, schema: { $ref: '#/definitions/Pet' } }] } },
          '/token': { post: { consumes: ['application/x-www-form-urlencoded'], parameters: [{ in: 'formData', name: 'username', type: 'string' }, { in: 'formData', name: 'password', type: 'string', format: 'password' }] } }
        },
        definitions: { Pet: { type: 'object', properties: { name: { type: 'string', example: 'Rex' } } } }
      })
    )
    expect(spec.endpoints.find((e) => e.path === '/pets')!.requestBody).toMatchObject({ contentTypes: ['application/json'], example: { name: 'Rex' } })
    const token = spec.endpoints.find((e) => e.path === '/token')!
    expect(token.requestBody).toMatchObject({ contentTypes: ['application/x-www-form-urlencoded'], example: { username: '', password: '' } })
  })

  it('prefers explicit examples and handles oneOf and nullable types', () => {
    expect(schemaExample({ type: 'object', properties: { a: { oneOf: [{ type: 'null' }, { type: 'number' }] }, b: { type: ['string', 'null'], default: 'x' } } })).toEqual({ a: 0, b: 'x' })
    expect(schemaExample({ type: 'string', examples: ['first'] })).toBe('first')
  })

  it('imports scanned OpenAPI bodies into the collection, including url-encoded forms', () => {
    const analyzer = new ProjectAnalyzer(['openapi.json'])
    analyzer.addFile('openapi.json', JSON.stringify({
      ...openapi3,
      paths: {
        ...openapi3.paths,
        '/token': { post: { requestBody: { content: { 'application/x-www-form-urlencoded': { schema: { type: 'object', properties: { grant_type: { type: 'string', enum: ['password'] }, username: { type: 'string' } } } } } } } }
      }
    }))
    const { endpoints } = analyzer.finish()
    const { collection } = buildCollectionFromEndpoints(endpoints, { name: 'x', baseUrl: 'http://localhost:9000' })
    const put = collection.requests.find((r) => r.method === 'PUT')!
    expect(JSON.parse(put.body.content)).toMatchObject({ email: 'user@example.com' })
    expect(put.headers).toEqual([expect.objectContaining({ key: 'X-Tenant', value: 'acme' })])
    const token = collection.requests.find((r) => r.url.endsWith('/token'))!
    expect(token.body).toEqual({ type: 'x-www-form-urlencoded', content: 'grant_type=password\nusername=' })
  })
})
