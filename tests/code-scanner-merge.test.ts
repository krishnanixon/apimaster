import { describe, expect, it } from 'vitest'
import { ProjectAnalyzer } from '../shared/lib/code-scanner/analyzer'
import { buildCollectionFromEndpoints } from '../shared/lib/code-scanner/spec-to-collection'
import { applyMerge, defaultMergeSelection, planMerge } from '../shared/lib/code-scanner/merge-collection'
import { requestStructure } from '../shared/lib/code-scanner/fingerprint'
import { scanToOpenApi } from '../shared/lib/code-scanner/to-openapi'
import { parseOpenApiDocument } from '../shared/lib/ai-engineer/openapi-import'
import type { ApiCollection, ApiRequest } from '../shared/types/api-studio'

function scan(files: Record<string, string>) {
  const analyzer = new ProjectAnalyzer(Object.keys(files))
  for (const [path, content] of Object.entries(files)) analyzer.addFile(path, content)
  return analyzer.finish()
}

function build(files: Record<string, string>) {
  const result = scan(files)
  return buildCollectionFromEndpoints(result.endpoints, { name: 'Shop', baseUrl: 'http://localhost:3000', auth: result.auth, rootPath: '/code/shop' }).collection
}

const V1 = {
  'app.js': `
    const app = require('express')()
    app.get('/products', (req, res) => { const page = req.query.page })
    app.post('/products', requireAuth, (req, res) => { const { name, price } = req.body })
    app.get('/products/:id', (req, res) => {})
    app.delete('/legacy', (req, res) => {})
  `
}

const V2 = {
  'app.js': `
    const app = require('express')()
    app.get('/products', (req, res) => { const page = req.query.page })
    app.post('/products', requireAuth, (req, res) => { const { name, price, sku } = req.body })
    app.put('/products/:id', (req, res) => { const { name } = req.body })
    app.get('/orders', (req, res) => {})
  `
}

const find = (collection: ApiCollection, method: string, suffix: string): ApiRequest | undefined =>
  collection.requests.find((r) => r.method === method && r.url.endsWith(suffix))

describe('fingerprints', () => {
  it('ignore values a person types, but not structure', () => {
    const request = find(build(V1), 'POST', '/products')!
    const filled: ApiRequest = { ...request, name: 'Renamed', body: { type: 'json', content: '{"name":"Desk","price":120}' } }
    expect(requestStructure(filled)).toBe(request.scan!.structure)
    const edited: ApiRequest = { ...request, body: { type: 'json', content: '{"name":"Desk","price":120,"color":"red"}' } }
    expect(requestStructure(edited)).not.toBe(request.scan!.structure)
  })

  it('are stamped on generated requests and the collection', () => {
    const collection = build(V1)
    expect(collection.source).toMatchObject({ kind: 'code-scanner', rootPath: '/code/shop' })
    expect(collection.requests.every((r) => r.scan?.key && r.scan.structure === requestStructure(r))).toBe(true)
  })
})

describe('re-scan merge', () => {
  /** v1 imported, then used: values filled in, one request renamed, one structurally edited, one added by hand. */
  function usedCollection(): ApiCollection {
    const collection = build(V1)
    collection.requests = collection.requests.map((r) => {
      if (r.method === 'POST') {
        return { ...r, name: 'Create product (mine)', body: { type: 'json', content: '{\n  "name": "Desk",\n  "price": 120\n}' }, tests: 'pm.test("ok")' }
      }
      if (r.method === 'GET' && r.url.endsWith('/products')) {
        return { ...r, queryParams: r.queryParams.map((q) => ({ ...q, value: '3' })) }
      }
      if (r.method === 'GET' && r.url.endsWith('/:id')) {
        // A person added a header: a structural edit.
        return { ...r, headers: [...r.headers, { id: 'h1', key: 'X-Debug', value: '1', enabled: true }] }
      }
      return r
    })
    collection.requests.push({ ...collection.requests[0], id: 'mine', name: 'My own request', scan: undefined, url: '{{baseUrl}}/health' })
    return collection
  }

  it('classifies changes and defaults to safe ones', () => {
    const existing = usedCollection()
    const plan = planMerge(existing, build(V2))
    const summary = plan.items.map((i) => `${i.status} ${i.method} ${i.url.replace('{{baseUrl}}', '')}`).sort()
    expect(summary).toEqual([
      'added GET /orders',
      'added PUT /products/:id',
      'removed DELETE /legacy',
      'removed GET /products/:id',
      'updated POST /products'
    ])
    expect(plan.unchanged).toBe(1) // GET /products: values filled in, code unchanged
    expect(plan.untracked).toBe(1)
    expect([...defaultMergeSelection(plan)].length).toBe(3) // added ×2 + updated; never removals
  })

  it('updates structure but keeps values, name, tests and hand-made requests', () => {
    const existing = usedCollection()
    const generated = build(V2)
    const plan = planMerge(existing, generated)
    const { collection, counts } = applyMerge(existing, generated, plan, defaultMergeSelection(plan))
    expect(counts).toEqual({ added: 2, updated: 1, conflict: 0, removed: 0 })

    const create = find(collection, 'POST', '/products')!
    expect(create.name).toBe('Create product (mine)')
    expect(create.tests).toBe('pm.test("ok")')
    expect(JSON.parse(create.body.content)).toEqual({ name: 'Desk', price: 120, sku: '' })
    // Its structure now matches the code, so the next scan doesn't report it again.
    expect(requestStructure(create)).toBe(create.scan!.structure)
    expect(planMerge(collection, generated).items.filter((i) => i.status === 'updated')).toEqual([])

    expect(find(collection, 'GET', '/products')!.queryParams[0].value).toBe('3')
    expect(find(collection, 'GET', '/orders')).toBeDefined()
    expect(collection.requests.find((r) => r.id === 'mine')).toBeDefined()
    // Removals weren't accepted: still there.
    expect(find(collection, 'DELETE', '/legacy')).toBeDefined()
  })

  it('deletes and overwrites only when accepted, reusing and creating folders', () => {
    const existing = build({
      'app.js': `const app = require('express')(); app.get('/products', h); app.get('/users', h); app.get('/users/:id', (req, res) => {})`
    })
    existing.requests = existing.requests.map((r) =>
      r.url.endsWith('/users/:id') ? { ...r, headers: [{ id: 'x', key: 'X-Mine', value: 'keep', enabled: true }] } : r
    )
    const generated = build({
      'app.js': `const app = require('express')(); app.get('/users', h); app.get('/users/:id', (req, res) => { const v = req.query.verbose }); app.get('/orders', h)`
    })
    const plan = planMerge(existing, generated)
    const conflict = plan.items.find((i) => i.status === 'conflict')!
    const removed = plan.items.find((i) => i.status === 'removed')!
    const added = plan.items.find((i) => i.status === 'added')!
    const { collection } = applyMerge(existing, generated, plan, new Set([conflict.key, removed.key, added.key]))

    expect(find(collection, 'GET', '/products')).toBeUndefined()
    const user = find(collection, 'GET', '/users/:id')!
    expect(user.queryParams.map((q) => q.key)).toEqual(['verbose'])
    expect(user.headers).toEqual([]) // overwritten: the code's structure wins
    const orders = find(collection, 'GET', '/orders')!
    expect(collection.folders.find((f) => f.id === orders.folderId)?.name).toBe('orders')
    expect(collection.folders.filter((f) => f.name === 'users')).toHaveLength(1)
  })
})

describe('OpenAPI export', () => {
  it('produces a document our importer reads back with the same endpoints and bodies', () => {
    const result = scan({
      'app.js': `
        const app = require('express')()
        app.post('/api/users', requireAuth, (req, res) => { const { email, age } = req.body })
        app.get('/api/users/:id', (req, res) => { const expand = req.query.expand })
        app.get('/api/health', (req, res) => {})
      `,
      'web/q.ts': "const Q = gql`query Me { me { id } }`; fetch('https://api.github.com/zen')"
    })
    const doc = scanToOpenApi({ title: 'Shop', baseUrl: 'http://localhost:4000', auth: result.auth, endpoints: result.endpoints })
    expect(Object.keys(doc.paths as object).sort()).toEqual(['/api/health', '/api/users', '/api/users/{id}'])
    expect(doc).toMatchObject({ openapi: '3.0.3', servers: [{ url: 'http://localhost:4000' }], components: { securitySchemes: { default: { type: 'http', scheme: 'bearer' } } } })

    const reimported = parseOpenApiDocument(JSON.stringify(doc))
    const post = reimported.endpoints.find((e) => e.method === 'POST')!
    expect(post.requestBody?.example).toEqual({ email: '', age: '' })
    expect(post.securityRequired).toBe(true)
    const get = reimported.endpoints.find((e) => e.path === '/api/users/{id}')!
    expect(get.parameters.map((p) => `${p.in}:${p.name}`)).toEqual(['path:id', 'query:expand'])
    expect(new Set(reimported.endpoints.map((e) => e.operationId)).size).toBe(3)
  })

  it('infers schemas and includes example responses', () => {
    const doc = scanToOpenApi({
      title: 't',
      baseUrl: 'http://x',
      endpoints: [
        {
          ...scan({ 'a.js': `const app = require('express')(); app.post('/a', (req, res) => {})` }).endpoints[0],
          requestBody: { required: true, contentTypes: ['application/json'], example: { email: 'a@b.co', at: '2024-01-01T00:00:00Z', n: 1.5, tags: ['x'] } },
          responses: [{ status: '201', description: 'Created' }],
          responseExample: { id: 7 }
        }
      ]
    }) as { paths: Record<string, Record<string, { requestBody: { content: Record<string, { schema: unknown }> }; responses: Record<string, unknown> }>> }
    const op = doc.paths['/a'].post
    expect(op.requestBody.content['application/json'].schema).toEqual({
      type: 'object',
      properties: {
        email: { type: 'string', format: 'email' },
        at: { type: 'string', format: 'date-time' },
        n: { type: 'number' },
        tags: { type: 'array', items: { type: 'string' } }
      }
    })
    expect(op.responses['201']).toMatchObject({ description: 'Created', content: { 'application/json': { example: { id: 7 } } } })
  })
})
