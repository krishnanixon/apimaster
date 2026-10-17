import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import type { ApiCollection, ApiEnvironment, ApiRequest } from '@shared/types/api-studio'
import {
  COLLECTION_FILE,
  COLLECTION_FORMAT_VERSION,
  migrateDocument,
  parseCollectionFiles,
  serializeCollection,
  type CollectionFiles
} from '@shared/lib/collection-files'
import { loadCollectionDirectory, readCollectionDirectory, writeCollectionDirectory } from '@shared/lib/collection-files/node'

const NOW = '2026-10-17T10:00:00.000Z'

function request(overrides: Partial<ApiRequest> & Pick<ApiRequest, 'id' | 'name'>): ApiRequest {
  return {
    method: 'GET',
    url: '{{baseUrl}}/users',
    headers: [],
    queryParams: [],
    body: { type: 'none', content: '' },
    auth: { type: 'inherit' },
    folderId: null,
    updatedAt: '2026-10-01T00:00:00.000Z',
    ...overrides
  }
}

function fixture(): { collection: ApiCollection; environments: ApiEnvironment[] } {
  const collection: ApiCollection = {
    id: 'col-1',
    name: 'Payments API',
    description: 'Charges and refunds',
    auth: { type: 'bearer', bearerToken: 'sk_live_super_secret' },
    headers: [
      { id: 'h1', key: 'Accept', value: 'application/json', enabled: true },
      { id: 'h2', key: '', value: '', enabled: true }
    ],
    preRequestScript: 'pm.environment.set("ts", Date.now())\nconsole.log("pre")\n',
    folders: [
      { id: 'f-users', name: 'Users', parentId: null, auth: { type: 'inherit' } },
      { id: 'f-admin', name: 'Admin', parentId: 'f-users', headers: [{ id: 'h3', key: 'X-Role', value: 'admin', enabled: true }] },
      { id: 'f-refunds', name: 'Refunds', parentId: null, preRequestScript: 'console.log(1)' }
    ],
    requests: [
      request({ id: 'r-health', name: 'Health check', url: '{{baseUrl}}/health' }),
      request({
        id: 'r-create',
        name: 'Create user',
        method: 'POST',
        folderId: 'f-users',
        requestType: 'http',
        headers: [
          { id: 'h4', key: 'Content-Type', value: 'application/json', enabled: true },
          { id: 'h5', key: 'X-Api-Key', value: 'literal-api-key-123', enabled: true },
          { id: 'h6', key: 'Authorization', value: 'Bearer {{token}}', enabled: false, description: 'shared ref' }
        ],
        queryParams: [{ id: 'q1', key: 'page', value: '1', enabled: true }],
        pathParams: [{ id: 'p1', key: 'id', value: '42', enabled: true }],
        body: { type: 'json', content: '{\n  "name": "Ada",\n  "email": "ada@example.com"\n}' },
        auth: { type: 'basic', basicUsername: 'ada', basicPassword: 'hunter2' },
        tests: 'pm.test("ok", () => {\n  pm.response.to.have.status(201)\n})\n',
        description: '# Create\n\nMakes a user.',
        timeoutMs: 5000
      }),
      request({ id: 'r-create-2', name: 'Create user', method: 'PUT', folderId: 'f-users' }),
      request({
        id: 'r-gql',
        name: 'Viewer',
        method: 'POST',
        folderId: 'f-admin',
        requestType: 'graphql',
        graphql: { query: 'query Viewer {\n  viewer { id }\n}', variables: '{}', operationName: 'Viewer' }
      }),
      request({
        id: 'r-upload',
        name: 'Upload receipt',
        method: 'POST',
        folderId: 'f-refunds',
        body: {
          type: 'form-data',
          content: '',
          formData: [
            { id: 'fd1', key: 'note', value: 'hello', enabled: true, type: 'text' },
            { id: 'fd2', key: 'password', value: 'pw-literal', enabled: true, type: 'text' },
            { id: 'fd3', key: 'file', value: '', enabled: true, type: 'file', fileName: 'r.pdf', fileBase64: 'AAAA' }
          ]
        },
        auth: { type: 'apiKey', apiKeyName: 'X-Key', apiKeyValue: '{{apiKey}}', apiKeyLocation: 'header' }
      })
    ],
    folder: { path: '/repo/api' },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z'
  }
  const environments: ApiEnvironment[] = [
    {
      id: 'env-1',
      name: 'Staging',
      collectionId: 'col-1',
      variables: [
        { id: 'v1', key: 'baseUrl', value: 'https://staging.example.com', enabled: true },
        { id: 'v2', key: 'token', value: 'tok_123', enabled: true, secret: true },
        { id: 'v3', key: 'dbPassword', value: 'p@ss', enabled: true },
        { id: 'v4', key: 'tokenUrl', value: 'https://auth.example.com/token', enabled: true }
      ],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z'
    }
  ]
  return { collection, environments }
}

/** Fields the files intentionally don't carry: row ids, timestamps, blank rows, and values kept local. */
function canonical(collection: ApiCollection): unknown {
  const files = serializeCollection(collection)
  return parseCollectionFiles(files, { now: NOW, folderPath: collection.folder?.path }).collection
}

const SECRETS = ['sk_live_super_secret', 'literal-api-key-123', 'hunter2', 'pw-literal', 'tok_123', 'p@ss', 'AAAA']

describe('collection files: round trip', () => {
  it('collection → files → collection is identical given the local copy', () => {
    const { collection, environments } = fixture()
    const files = serializeCollection(collection, environments)
    const parsed = parseCollectionFiles(files, { previous: collection, previousEnvironments: environments, now: NOW })
    expect(parsed.errors).toEqual([])
    expect(parsed.collection).toBe(collection)
    expect(parsed.environments).toEqual(environments)
  })

  it('reconstructs every shared field without the local copy', () => {
    const { collection } = fixture()
    const parsed = parseCollectionFiles(serializeCollection(collection), { now: NOW, folderPath: '/repo/api' }).collection!
    expect(parsed.id).toBe('col-1')
    expect(parsed.folders.map((f) => [f.id, f.name, f.parentId])).toEqual([
      ['f-users', 'Users', null],
      ['f-admin', 'Admin', 'f-users'],
      ['f-refunds', 'Refunds', null]
    ])
    expect(parsed.requests.map((r) => [r.id, r.folderId])).toEqual([
      ['r-health', null],
      ['r-create', 'f-users'],
      ['r-create-2', 'f-users'],
      ['r-gql', 'f-admin'],
      ['r-upload', 'f-refunds']
    ])
    const create = parsed.requests.find((r) => r.id === 'r-create')!
    const original = collection.requests.find((r) => r.id === 'r-create')!
    expect(create.body).toEqual(original.body)
    expect(create.tests).toBe(original.tests)
    expect(create.description).toBe(original.description)
    expect(create.timeoutMs).toBe(5000)
    expect(create.pathParams?.map((p) => [p.key, p.value])).toEqual([['id', '42']])
    expect(create.headers.map((h) => [h.key, h.value, h.enabled])).toEqual([
      ['Content-Type', 'application/json', true],
      ['X-Api-Key', '', true],
      ['Authorization', 'Bearer {{token}}', false]
    ])
    expect(parsed.requests.find((r) => r.id === 'r-gql')!.graphql).toEqual(collection.requests[3].graphql)
    expect(parsed.preRequestScript).toBe(collection.preRequestScript)
  })

  it('restores secrets and attachments from the local copy when a file changed on disk', () => {
    const { collection, environments } = fixture()
    const files = serializeCollection(collection, environments)
    const path = 'users/create-user.request.yaml'
    files[path] = files[path].replace("url: '{{baseUrl}}/users'", "url: '{{baseUrl}}/v2/users'")
    files['environments/staging.yaml'] = files['environments/staging.yaml'].replace('staging.example.com', 'stg.example.com')
    const parsed = parseCollectionFiles(files, { previous: collection, previousEnvironments: environments, now: NOW })
    const create = parsed.collection!.requests.find((r) => r.id === 'r-create')!
    expect(create.url).toBe('{{baseUrl}}/v2/users')
    expect(create.updatedAt).toBe(NOW)
    expect(create.auth.basicPassword).toBe('hunter2')
    expect(create.headers.find((h) => h.key === 'X-Api-Key')!.value).toBe('literal-api-key-123')
    expect(create.headers[0].id).toBe('h4')
    // Untouched requests keep their identity.
    expect(parsed.collection!.requests.find((r) => r.id === 'r-upload')).toBe(collection.requests[4])
    expect(parsed.collection!.auth?.bearerToken).toBe('sk_live_super_secret')
    expect(parsed.collection!.updatedAt).toBe(NOW)
    const env = parsed.environments[0]
    expect(env.variables.find((v) => v.key === 'baseUrl')!.value).toBe('https://stg.example.com')
    expect(env.variables.find((v) => v.key === 'token')!.value).toBe('tok_123')
    expect(env.variables.find((v) => v.key === 'dbPassword')!.value).toBe('p@ss')
  })

  it('serializing the parsed result reproduces the same files', () => {
    const { collection, environments } = fixture()
    const files = serializeCollection(collection, environments)
    const parsed = parseCollectionFiles(files, { now: NOW })
    expect(serializeCollection(parsed.collection!, parsed.environments)).toEqual(files)
    expect(canonical(parsed.collection!)).toEqual(parsed.collection)
  })
})

describe('collection files: secrets', () => {
  it('never writes secret values', () => {
    const { collection, environments } = fixture()
    const files = serializeCollection(collection, environments)
    const all = Object.values(files).join('\n')
    for (const secret of SECRETS) expect(all).not.toContain(secret)
    // Keys are written so teammates know what to fill in; references are kept.
    expect(files['environments/staging.yaml']).toContain('key: token\n    secret: true')
    expect(files['environments/staging.yaml']).toContain('https://auth.example.com/token')
    expect(all).toContain("value: Bearer {{token}}")
    expect(all).toContain("apiKeyValue: '{{apiKey}}'")
  })

  it('respects an explicit "not secret" mark', () => {
    const { collection, environments } = fixture()
    environments[0].variables[2] = { ...environments[0].variables[2], secret: false }
    const files = serializeCollection(collection, environments)
    expect(files['environments/staging.yaml']).toContain('p@ss')
  })
})

describe('collection files: stable output', () => {
  it('serializing twice gives identical bytes', () => {
    const a = serializeCollection(fixture().collection, fixture().environments)
    const b = serializeCollection(fixture().collection, fixture().environments)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  it('uses readable YAML: block scalars, 2-space indent, no timestamps', () => {
    const files = serializeCollection(fixture().collection)
    const create = files['users/create-user.request.yaml']
    expect(create).toContain('tests: |\n    pm.test("ok", () => {\n      pm.response.to.have.status(201)')
    expect(create.startsWith('id: r-create\nname: Create user\ntype: http\nmethod: POST\n')).toBe(true)
    expect(Object.values(files).join('')).not.toMatch(/updatedAt|createdAt/)
    expect(Object.keys(files).sort()).toEqual([
      'health-check.request.yaml',
      'refunds/shurikly.folder.yaml',
      'refunds/upload-receipt.request.yaml',
      COLLECTION_FILE,
      'users/admin/shurikly.folder.yaml',
      'users/admin/viewer.request.yaml',
      'users/create-user-2.request.yaml',
      'users/create-user.request.yaml',
      'users/shurikly.folder.yaml'
    ])
    expect(files[COLLECTION_FILE]).toContain(`formatVersion: ${COLLECTION_FORMAT_VERSION}\n`)
  })

  it('changing one request only changes its file', () => {
    const { collection } = fixture()
    const before = serializeCollection(collection)
    collection.requests[0] = { ...collection.requests[0], url: '{{baseUrl}}/healthz', updatedAt: NOW }
    collection.updatedAt = NOW
    const after = serializeCollection(collection)
    const changed = Object.keys(after).filter((path) => after[path] !== before[path])
    expect(changed).toEqual(['health-check.request.yaml'])
  })
})

describe('collection files: parse errors', () => {
  it('isolates a broken request file and keeps the rest', () => {
    const files = serializeCollection(fixture().collection)
    files['users/create-user.request.yaml'] = 'id: r-create\nname: [unclosed\n'
    files['refunds/upload-receipt.request.yaml'] = 'method: FETCH\n'
    const parsed = parseCollectionFiles(files, { now: NOW })
    expect(parsed.fatal).toBeUndefined()
    expect(parsed.errors.map((e) => e.path)).toEqual(['users/create-user.request.yaml', 'refunds/upload-receipt.request.yaml'])
    expect(parsed.errors[1].message).toContain('FETCH')
    expect(parsed.collection!.requests.map((r) => r.id)).toEqual(['r-health', 'r-create-2', 'r-gql'])
  })

  it('does not reuse a broken file name for a new request', () => {
    const { collection } = fixture()
    const files = serializeCollection(collection, [], { reservedPaths: ['users/create-user.request.yaml'] })
    expect(files['users/create-user.request.yaml']).toBeUndefined()
    expect(files['users/create-user-2.request.yaml']).toContain('id: r-create\n')
  })

  it('a broken folder file keeps its requests', () => {
    const files = serializeCollection(fixture().collection)
    files['users/shurikly.folder.yaml'] = ': : :\n\t- bad'
    const parsed = parseCollectionFiles(files, { now: NOW })
    expect(parsed.errors.map((e) => e.path)).toEqual(['users/shurikly.folder.yaml'])
    expect(parsed.collection!.requests).toHaveLength(5)
    expect(parsed.collection!.folders.find((f) => f.name === 'users')?.id).toBe('dir:users')
  })

  it('reports a missing, broken, or newer collection file as fatal', () => {
    expect(parseCollectionFiles({}).fatal).toContain('missing')
    expect(parseCollectionFiles({ [COLLECTION_FILE]: '{' }).fatal).toContain('could not be read')
    const newer = parseCollectionFiles({ [COLLECTION_FILE]: `formatVersion: ${COLLECTION_FORMAT_VERSION + 1}\nid: x\n` })
    expect(newer.collection).toBeNull()
    expect(newer.fatal).toContain('Update Shurikly')
  })

  it('accepts hand-written files without ids or order', () => {
    const files: CollectionFiles = {
      [COLLECTION_FILE]: 'name: Hand made\n',
      'b.request.yaml': 'name: B\nurl: https://b.test\n',
      'a.request.yaml': 'name: A\nmethod: post\nheaders:\n  - key: X-Port\n    value: 8080\n',
      'nested/c.request.yaml': 'name: C\n'
    }
    const parsed = parseCollectionFiles(files, { now: NOW, folderPath: '/x' })
    expect(parsed.errors).toEqual([])
    expect(parsed.collection!.requests.map((r) => r.name)).toEqual(['A', 'B', 'C'])
    expect(parsed.collection!.requests[0].method).toBe('POST')
    expect(parsed.collection!.requests[0].headers[0].value).toBe('8080')
    expect(parsed.collection!.folders).toEqual([{ id: 'dir:nested', name: 'nested', parentId: null }])
    expect(parsed.collection!.folder).toEqual({ path: '/x' })
  })
})

describe('collection files: migrations', () => {
  it('runs each step from the file version up to the current one', () => {
    const migrations = {
      0: (_kind: string, doc: Record<string, unknown>) => ({ ...doc, steps: [...((doc.steps as number[]) ?? []), 0] })
    }
    expect(migrateDocument('request', { name: 'x' }, 0, migrations)).toEqual({ name: 'x', steps: [0] })
    expect(() => migrateDocument('request', {}, 0, {})).toThrow('No migration')
  })
})

describe('collection files: Node adapter', () => {
  let dir = ''
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  it('writes atomically, prunes stale files, and leaves unmanaged files alone', async () => {
    dir = mkdtempSync(join(tmpdir(), 'shurikly-collection-'))
    const { collection, environments } = fixture()
    writeFileSync(join(dir, 'notes.txt'), 'keep me')
    const first = await writeCollectionDirectory(dir, serializeCollection(collection, environments), {
      createIfMissing: { 'README.md': '# readme' }
    })
    expect(first.written).toContain('users/admin/viewer.request.yaml')
    expect(first.written).toContain('README.md')

    const again = await writeCollectionDirectory(dir, serializeCollection(collection, environments), {
      createIfMissing: { 'README.md': '# other' }
    })
    expect(again).toEqual({ written: [], deleted: [] })
    expect(readFileSync(join(dir, 'README.md'), 'utf8')).toBe('# readme')

    collection.folders = collection.folders.filter((f) => f.id !== 'f-admin')
    collection.requests = collection.requests.filter((r) => r.id !== 'r-gql')
    const pruned = await writeCollectionDirectory(dir, serializeCollection(collection, environments))
    expect(pruned.deleted).toEqual(['users/admin/shurikly.folder.yaml', 'users/admin/viewer.request.yaml'])
    expect(existsSync(join(dir, 'users/admin'))).toBe(false)
    expect(readFileSync(join(dir, 'notes.txt'), 'utf8')).toBe('keep me')

    const loaded = await loadCollectionDirectory(dir, { now: NOW })
    expect(loaded.errors).toEqual([])
    expect(loaded.collection!.requests).toHaveLength(4)
    expect(loaded.collection!.folder).toEqual({ path: dir })
    expect(loaded.environments[0].name).toBe('Staging')
  })

  it('never deletes or overwrites protected files', async () => {
    dir = mkdtempSync(join(tmpdir(), 'shurikly-collection-'))
    mkdirSync(join(dir, 'users'))
    writeFileSync(join(dir, 'users/broken.request.yaml'), 'name: [')
    await writeCollectionDirectory(dir, serializeCollection(fixture().collection), {
      protectedPaths: ['users/broken.request.yaml']
    })
    expect(readFileSync(join(dir, 'users/broken.request.yaml'), 'utf8')).toBe('name: [')
    const { files } = await readCollectionDirectory(dir)
    expect(Object.keys(files)).toContain('users/broken.request.yaml')
  })

  it('rejects paths outside the folder', async () => {
    dir = mkdtempSync(join(tmpdir(), 'shurikly-collection-'))
    await expect(writeCollectionDirectory(dir, { '../x.request.yaml': 'id: x' })).rejects.toThrow('Unsafe')
    await expect(writeCollectionDirectory(dir, { 'evil.sh': 'rm -rf /' })).rejects.toThrow('Not a collection file')
  })
})
