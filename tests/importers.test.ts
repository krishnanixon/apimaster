import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ApiCollection, ApiRequest, KeyValuePair } from '../shared/types/api-studio'
import {
  convertInsomniaTemplate,
  detectImportFormat,
  importBruno,
  importHar,
  importInsomnia,
  importOpenApi,
  parseBru,
  translateBrunoScript,
  type BrunoSourceFile
} from '../shared/lib/importers'

const FIXTURES = join(__dirname, 'fixtures', 'importers')
const read = (name: string) => readFileSync(join(FIXTURES, name), 'utf-8')

function readFolder(root: string): BrunoSourceFile[] {
  const out: BrunoSourceFile[] = []
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name)
      if (statSync(full).isDirectory()) walk(full)
      else out.push({ path: relative(root, full).split('\\').join('/'), content: readFileSync(full, 'utf-8') })
    }
  }
  walk(root)
  return out
}

function byName(collection: ApiCollection, name: string): ApiRequest {
  const found = collection.requests.find((r) => r.name === name)
  if (!found) throw new Error(`no request named ${name}; have ${collection.requests.map((r) => r.name).join(', ')}`)
  return found
}

function folderName(collection: ApiCollection, request: ApiRequest): string | null {
  return collection.folders.find((f) => f.id === request.folderId)?.name ?? null
}

/** Non-blank rows as `key=value` (`~key=value` when disabled). */
function rows(list: KeyValuePair[] | undefined): string[] {
  return (list ?? []).filter((p) => p.key).map((p) => `${p.enabled ? '' : '~'}${p.key}=${p.value}`)
}

function vars(env: { variables: KeyValuePair[] }): Record<string, string> {
  return Object.fromEntries(env.variables.map((v) => [v.key, v.value]))
}

describe('format detection', () => {
  it('recognises each supported format', () => {
    expect(detectImportFormat(read('insomnia-v4.json'))).toBe('insomnia')
    expect(detectImportFormat(read('insomnia-v5.yaml'))).toBe('insomnia')
    expect(detectImportFormat(read('sample.har'))).toBe('har')
    expect(detectImportFormat('curl https://example.com')).toBe('curl')
    expect(detectImportFormat(JSON.stringify({ info: { name: 'x' }, item: [] }))).toBe('postman')
    expect(detectImportFormat(JSON.stringify({ name: 'x', requests: [], folders: [] }))).toBe('shurikly')
    expect(detectImportFormat('openapi: 3.0.0\ninfo:\n  title: T\n  version: "1"\npaths: {}\n')).toBe('openapi')
    expect(detectImportFormat('not an export')).toBeNull()
    expect(detectImportFormat('{ broken')).toBeNull()
  })
})

describe('Insomnia v4 import', () => {
  const now = '2026-10-17T00:00:00.000Z'
  const { collections, environments, summary } = importInsomnia(read('insomnia-v4.json'), now)
  const [shop] = collections

  it('makes one collection per workspace with request groups as nested folders', () => {
    expect(collections).toHaveLength(1)
    expect(shop.name).toBe('Shop API')
    expect(shop.description).toBe('Orders, products and refunds')
    const orders = shop.folders.find((f) => f.name === 'Orders')!
    const refunds = shop.folders.find((f) => f.name === 'Refunds')!
    expect(orders.parentId).toBeNull()
    expect(refunds.parentId).toBe(orders.id)
    expect(folderName(shop, byName(shop, 'Refund order'))).toBe('Refunds')
    expect(byName(shop, 'Upload catalogue').folderId).toBeNull()
  })

  it('maps folder auth and headers so requests can inherit them', () => {
    const orders = shop.folders.find((f) => f.name === 'Orders')!
    expect(orders.auth).toEqual({ type: 'bearer', bearerToken: '{{token}}' })
    expect(rows(orders.headers)).toEqual(['X-Tenant={{tenant}}'])
    expect(byName(shop, 'List orders').auth.type).toBe('inherit')
  })

  it('maps URL, query params, headers and converts {{ _.var }}', () => {
    const list = byName(shop, 'List orders')
    expect(list.method).toBe('GET')
    expect(list.url).toBe('{{baseUrl}}/orders')
    expect(rows(list.queryParams)).toEqual(['status=open', 'page=1', '~limit=50'])
    expect(rows(list.headers)).toEqual(['Accept=application/json'])
    expect(list.description).toBe('Paged list of orders')
  })

  it('maps body types', () => {
    const create = byName(shop, 'Create order')
    expect(create.body.type).toBe('json')
    expect(create.body.content).toContain('"quantity": {{qty}}')

    const refund = byName(shop, 'Refund order')
    expect(refund.body).toEqual({ type: 'x-www-form-urlencoded', content: 'reason={{refundReason}}' })
    expect(rows(refund.pathParams)).toEqual(['orderId=1001'])

    const upload = byName(shop, 'Upload catalogue')
    expect(upload.body.type).toBe('form-data')
    expect(upload.body.formData?.map((f) => [f.key, f.type, f.fileName ?? f.value])).toEqual([
      ['file', 'file', 'catalogue.csv'],
      ['dryRun', 'text', 'true']
    ])

    const gql = byName(shop, 'Product query')
    expect(gql.requestType).toBe('graphql')
    expect(gql.graphql?.query).toContain('product(id: $id)')
    expect(JSON.parse(gql.graphql!.variables)).toEqual({ id: 'p1' })
    expect(gql.graphql?.operationName).toBe('Product')
  })

  it('maps auth types to ours and reports the unsupported ones', () => {
    expect(byName(shop, 'Upload catalogue').auth).toEqual({ type: 'basic', basicUsername: 'admin', basicPassword: '{{adminPassword}}' })
    expect(byName(shop, 'Product query').auth).toMatchObject({ type: 'apiKey', apiKeyName: 'X-API-Key', apiKeyValue: '{{apiKey}}', apiKeyLocation: 'header' })
    expect(byName(shop, 'List S3 assets').auth).toMatchObject({ type: 'aws', awsAccessKey: 'AKIAEXAMPLE', awsRegion: 'eu-west-1', awsService: 's3' })
    expect(byName(shop, 'Current user').auth).toMatchObject({
      type: 'oauth2',
      oauth2GrantType: 'client_credentials',
      oauth2TokenUrl: 'https://auth.example.com/oauth/token',
      oauth2ClientId: 'shop-cli',
      oauth2Scope: 'orders:read'
    })
    expect(byName(shop, 'Refund order').auth.type).toBe('none')
    expect(summary.skipped.some((s) => s.includes('Unsupported auth "ntlm"'))).toBe(true)
  })

  it('keeps scripts, translating insomnia.* to pm.*', () => {
    const create = byName(shop, 'Create order')
    expect(create.preRequestScript).toBe("pm.environment.set('requestedAt', Date.now().toString());")
    expect(create.tests).toContain('pm.expect(pm.response.code).to.equal(201)')
  })

  it('turns sub-environments into environments merged over the base one', () => {
    expect(environments.map((e) => e.name)).toEqual(['Staging', 'Production'])
    expect(vars(environments[0])).toEqual({ baseUrl: 'https://staging.shop.example.com', tenant: 'acme', qty: '1', 'auth.audience': 'shop', token: 'stg-token' })
    expect(vars(environments[1])).toMatchObject({ baseUrl: 'https://shop.example.com', tenant: 'acme-prod' })
  })

  it('summarises what was imported and what was skipped', () => {
    expect(summary).toMatchObject({ format: 'insomnia', requests: 7, folders: 2, environments: 2 })
    expect(summary.skipped).toEqual(
      expect.arrayContaining([
        'gRPC requests',
        'WebSocket requests',
        expect.stringContaining('Folder environments — "Refunds"'),
        expect.stringContaining('template tags')
      ])
    )
    expect(summary.warnings.some((w) => w.includes('File fields'))).toBe(true)
  })
})

describe('Insomnia v5 YAML import', () => {
  const { collections, environments, summary } = importInsomnia(read('insomnia-v5.yaml'))
  const [billing] = collections

  it('reads the collection tree', () => {
    expect(billing.name).toBe('Billing API')
    expect(billing.folders.map((f) => f.name)).toEqual(['Customers'])
    const customers = billing.folders[0]
    expect(customers.auth).toEqual({ type: 'bearer', bearerToken: '{{token}}' })
    expect(customers.preRequestScript).toBe("pm.environment.set('ts', String(Date.now()));")
    expect(billing.requests.map((r) => r.name)).toEqual(['Get customer', 'Create customer', 'Latest invoice', 'Legacy endpoint'])
  })

  it('maps requests', () => {
    const get = byName(billing, 'Get customer')
    expect(get.url).toBe('{{baseUrl}}/customers/{id}')
    expect(rows(get.pathParams)).toEqual(['id='])
    expect(rows(get.queryParams)).toEqual(['expand=invoices'])
    expect(get.auth.type).toBe('inherit')
    expect(get.description).toBe('Fetch one customer')
    expect(get.tests).toContain('pm.response.to.have.status(200)')

    const create = byName(billing, 'Create customer')
    expect(create.body.type).toBe('json')
    expect(JSON.parse(create.body.content.replace('{{email}}', 'x'))).toEqual({ email: 'x', plan: 'pro' })
    expect(create.auth).toEqual({ type: 'digest', digestUsername: 'billing', digestPassword: '{{digestPassword}}' })

    expect(byName(billing, 'Latest invoice').auth).toMatchObject({ type: 'hawk', hawkId: 'hawk-id', hawkKey: 'hawk-key', hawkAlgorithm: 'sha1' })
    expect(byName(billing, 'Legacy endpoint').auth).toMatchObject({ type: 'oauth1', oauth1Token: 'tk', oauth1SignatureMethod: 'HMAC-SHA1' })
  })

  it('maps environments and reports what it skipped', () => {
    expect(environments.map((e) => e.name)).toEqual(['Staging', 'Production'])
    expect(vars(environments[0])).toEqual({ baseUrl: 'https://billing.staging.example.com', email: 'dev@example.com', token: 'staging-token' })
    expect(summary.skipped).toEqual(expect.arrayContaining(['WebSocket requests', expect.stringContaining('RSA-SHA1')]))
  })

  it('converts template variables but keeps tags', () => {
    expect(convertInsomniaTemplate('{{ _.a }}/{{b}}/{{ c.d }}')).toBe('{{a}}/{{b}}/{{c.d}}')
    expect(convertInsomniaTemplate("{% uuid 'v4' %}")).toBe("{% uuid 'v4' %}")
  })
})

describe('.bru parser', () => {
  it('reads dict, text and list blocks', () => {
    const file = parseBru(`meta {
  name: Example
  seq: 3
}

headers {
  "X-Quoted: key": yes
  ~X-Off: 1
  Authorization: Bearer a:b
}

body:json {
  {
    "nested": { "a": [1, 2] }
  }
}

vars:secret [
  one,
  two
]
`)
    expect(file.dict('meta')).toEqual({ name: 'Example', seq: '3' })
    expect(file.pairs('headers')).toEqual([
      { key: 'X-Quoted: key', value: 'yes', enabled: true },
      { key: 'X-Off', value: '1', enabled: false },
      { key: 'Authorization', value: 'Bearer a:b', enabled: true }
    ])
    expect(JSON.parse(file.text('body:json')!)).toEqual({ nested: { a: [1, 2] } })
    expect(file.list('vars:secret')).toEqual(['one', 'two'])
  })
})

describe('Bruno script translation', () => {
  it('rewrites bru/res basics to pm', () => {
    const { code, untranslated } = translateBrunoScript(
      'bru.setEnvVar("t", res.getBody().token)\ntest("ok", () => expect(res.status).to.equal(200))'
    )
    expect(untranslated).toBe(false)
    expect(code).toBe('pm.environment.set("t", pm.response.json().token)\npm.test("ok", () => pm.expect(pm.response.code).to.equal(200))')
  })

  it('keeps calls with no equivalent under a comment', () => {
    const { code, untranslated } = translateBrunoScript('req.setHeader("a", "b")')
    expect(untranslated).toBe(true)
    expect(code.split('\n')[0]).toMatch(/^\/\/ Imported from Bruno.*req\.setHeader/)
    expect(code).toContain('req.setHeader("a", "b")')
  })
})

describe('Bruno collection import', () => {
  const { collections, environments, summary } = importBruno(readFolder(join(FIXTURES, 'bruno')))
  const [pets] = collections

  it('uses bruno.json and collection.bru for the collection', () => {
    expect(pets.name).toBe('Pet Store')
    expect(pets.auth).toEqual({ type: 'bearer', bearerToken: '{{token}}' })
    expect(rows(pets.headers)).toEqual(['X-App=petstore-tests'])
    expect(pets.description).toContain('# Pet Store')
    expect(pets.preRequestScript).toMatch(/^\/\/ Imported from Bruno/)
  })

  it('turns directories into nested folders named by folder.bru', () => {
    const names = pets.folders.map((f) => f.name)
    expect(names).toEqual(['Authentication', 'Pets', 'Admin'])
    const petsFolder = pets.folders.find((f) => f.name === 'Pets')!
    const admin = pets.folders.find((f) => f.name === 'Admin')!
    expect(admin.parentId).toBe(petsFolder.id)
    expect(rows(petsFolder.headers)).toEqual(['Accept=application/json'])
    expect(admin.auth).toEqual({ type: 'basic', basicUsername: 'admin', basicPassword: '{{adminPassword}}' })
    expect(pets.folders.find((f) => f.name === 'Authentication')!.auth).toEqual({ type: 'none' })
    expect(folderName(pets, byName(pets, 'Delete Pet'))).toBe('Admin')
    expect(byName(pets, 'Health').folderId).toBeNull()
  })

  it('orders requests by seq', () => {
    const inPets = pets.requests.filter((r) => folderName(pets, r) === 'Pets').map((r) => r.name)
    expect(inPets).toEqual(['Get Pet', 'Search Pets', 'Upload Photo'])
  })

  it('maps URL, params, path params and docs', () => {
    const get = byName(pets, 'Get Pet')
    expect(get.method).toBe('GET')
    expect(get.url).toBe('{{baseUrl}}/pets/:petId')
    expect(rows(get.queryParams)).toEqual(['include=owner', '~fields=name'])
    expect(rows(get.pathParams)).toEqual(['petId={{petId}}'])
    expect(get.auth.type).toBe('inherit')
    expect(get.description).toBe('Fetches one pet by id.')
    expect(get.tests).toContain('pm.expect(pm.response.code).to.equal(200)')
    expect(get.tests).toContain('pm.environment.get("petId")')
  })

  it('maps body types and auth', () => {
    const login = byName(pets, 'Login')
    expect(login.method).toBe('POST')
    expect(login.auth.type).toBe('none')
    expect(login.body.type).toBe('json')
    expect(JSON.parse(login.body.content.replace('{{password}}', 'x'))).toEqual({ username: 'demo', password: 'x' })

    const upload = byName(pets, 'Upload Photo')
    expect(upload.auth).toEqual({ type: 'apiKey', apiKeyName: 'X-API-Key', apiKeyValue: '{{apiKey}}', apiKeyLocation: 'header' })
    expect(upload.body.formData?.map((f) => [f.key, f.type, f.fileName ?? f.value])).toEqual([
      ['caption', 'text', 'Sleeping on the couch'],
      ['photo', 'file', 'rex.jpg']
    ])

    const search = byName(pets, 'Search Pets')
    expect(search.requestType).toBe('graphql')
    expect(search.graphql?.query).toContain('pets(search: $term)')
    expect(JSON.parse(search.graphql!.variables)).toEqual({ term: 'rex' })

    const legacy = byName(pets, 'Legacy Sync')
    expect(legacy.method).toBe('PUT')
    expect(legacy.body).toEqual({ type: 'x-www-form-urlencoded', content: 'full=true' })
    expect(legacy.auth.type).toBe('none')
  })

  it('turns assertions, post-response vars and scripts into a test script', () => {
    const tests = byName(pets, 'Login').tests!
    expect(tests).toContain('pm.variables.set("token", pm.response.json().token)')
    expect(tests).toContain('pm.test("res.status eq 200", function () {\n  pm.expect(pm.response.code).to.eql(200)\n})')
    expect(tests).toContain('pm.expect(pm.response.json().token).to.be.a("string")')
    expect(tests).toContain('pm.environment.set("token", pm.response.json().token);')
  })

  it('keeps untranslatable pre-request calls with a comment', () => {
    const del = byName(pets, 'Delete Pet')
    expect(del.preRequestScript).toMatch(/^\/\/ Imported from Bruno.*bru\.runRequest/)
    expect(del.preRequestScript).toContain('pm.variables.set("deleting", id);')
  })

  it('imports environments with secrets left blank', () => {
    expect(environments.map((e) => e.name).sort()).toEqual(['Local', 'Production'])
    const local = environments.find((e) => e.name === 'Local')!
    expect(rows(local.variables)).toEqual(['baseUrl=http://localhost:3000', 'petId=1', '~debug=true', 'token='])
    expect(summary.warnings.some((w) => w.includes('fill in token, apiKey in "Production"'))).toBe(true)
  })

  it('summarises the import', () => {
    expect(summary).toMatchObject({ format: 'bruno', requests: 7, folders: 3, environments: 2 })
    expect(summary.skipped.some((s) => s.includes('Unsupported auth "ntlm"'))).toBe(true)
  })

  it('needs bruno.json', () => {
    expect(() => importBruno([{ path: 'a.bru', content: '' }])).toThrow(/bruno\.json/)
  })
})

describe('HAR import', () => {
  const har = read('sample.har')

  it('imports API calls grouped by host, skipping static assets', () => {
    const { collections, summary } = importHar(har)
    const [c] = collections
    expect(c.name).toBe('HAR import (WebInspector)')
    expect(c.folders.map((f) => f.name)).toEqual(['app.example.com', 'api.example.com', 'auth.example.com'])
    expect(c.requests.map((r) => r.name)).toEqual([
      'GET /dashboard',
      'GET /v1/projects',
      'POST /v1/projects',
      'POST /oauth/token',
      'PATCH /v1/projects/77'
    ])
    expect(summary).toMatchObject({ format: 'har', requests: 5, folders: 3, environments: 0 })
    expect(summary.skipped).toEqual(
      expect.arrayContaining([
        'Static assets (images, CSS, JS, fonts) (×4)',
        'Duplicate requests (same method, URL and body)',
        'Non-HTTP entries (wss)',
        'Cookies (sent from the cookie jar instead)'
      ])
    )
  })

  it('maps query strings, headers and bodies', () => {
    const [c] = importHar(har).collections
    const list = byName(c, 'GET /v1/projects')
    expect(list.url).toBe('https://api.example.com/v1/projects')
    expect(rows(list.queryParams)).toEqual(['page=2', 'sort=name asc'])
    // Browser-managed headers are dropped; auth headers stay.
    expect(rows(list.headers)).toEqual(['accept=application/json', 'authorization=Bearer eyJhbGciOi.example'])
    expect(folderName(c, list)).toBe('api.example.com')

    expect(byName(c, 'POST /v1/projects').body).toEqual({ type: 'json', content: '{"name":"Apollo","private":true}' })
    expect(rows(byName(c, 'POST /v1/projects').headers)).toEqual(['content-type=application/json'])
    expect(byName(c, 'POST /oauth/token').body).toEqual({ type: 'x-www-form-urlencoded', content: 'grant_type=client_credentials\nscope=read write' })
    expect(byName(c, 'PATCH /v1/projects/77').body.type).toBe('text')
    expect(rows(byName(c, 'GET /dashboard').headers)).toEqual(['accept=text/html', 'user-agent=Mozilla/5.0'])
  })

  it('can keep static assets', () => {
    const [c] = importHar(har, { skipStaticAssets: false }).collections
    expect(c.requests).toHaveLength(9)
    expect(c.folders.map((f) => f.name)).toContain('fonts.gstatic.com')
    expect(rows(byName(c, 'GET /img/logo.png').queryParams)).toEqual(['v=2'])
  })

  it('rejects other JSON', () => {
    expect(() => importHar('{"log":{}}')).toThrow(/HAR/)
  })
})

describe('OpenAPI import', () => {
  it('builds a collection and an environment for baseUrl', () => {
    const doc = {
      openapi: '3.0.3',
      info: { title: 'Todo API', version: '1' },
      servers: [{ url: 'https://todo.example.com' }],
      paths: { '/todos': { get: { summary: 'List todos' }, post: { summary: 'Create todo' } } }
    }
    const { collections, environments, summary } = importOpenApi(JSON.stringify(doc))
    expect(collections[0].name).toBe('Todo API')
    expect(collections[0].requests.map((r) => r.name).sort()).toEqual(['Create todo', 'List todos'])
    expect(collections[0].requests.every((r) => r.scan === undefined)).toBe(true)
    expect(vars(environments[0]).baseUrl).toBe('https://todo.example.com')
    expect(summary.format).toBe('openapi')
  })
})
