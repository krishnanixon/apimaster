import { describe, expect, it } from 'vitest'
import { ProjectAnalyzer } from '../shared/lib/code-scanner/analyzer'
import { buildCollectionFromEndpoints } from '../shared/lib/code-scanner/spec-to-collection'
import { applyMerge, planMerge } from '../shared/lib/code-scanner/merge-collection'
import { groupEndpoints, resourceKey, singularize } from '../shared/lib/code-scanner/group'

function scan(files: Record<string, string>) {
  const analyzer = new ProjectAnalyzer(Object.keys(files))
  for (const [path, content] of Object.entries(files)) analyzer.addFile(path, content)
  return analyzer.finish()
}

function build(files: Record<string, string>) {
  const result = scan(files)
  return buildCollectionFromEndpoints(result.endpoints, { name: 'App', baseUrl: 'http://localhost:3000', rootPath: '/code/app' }).collection
}

function folderContents(collection: ReturnType<typeof build>): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const request of collection.requests) {
    const name = collection.folders.find((f) => f.id === request.folderId)?.name ?? '(root)'
    ;(out[name] ??= []).push(`${request.method} ${request.url.replace('{{baseUrl}}', '')}`)
  }
  return out
}

describe('singularize / resourceKey', () => {
  it('normalizes plural, case and word separators', () => {
    expect(['users', 'categories', 'addresses', 'statuses', 'boxes', 'responses', 'courses', 'status', 'people'].map(singularize)).toEqual([
      'user',
      'category',
      'address',
      'status',
      'box',
      'response',
      'course',
      'status',
      'person'
    ])
    expect(resourceKey('Users')).toBe('user')
    expect(resourceKey('user-profiles')).toBe(resourceKey('userProfile'))
    expect(resourceKey('user_profiles')).toBe('user-profile')
  })

  it('collects sign-in style routes under auth', () => {
    expect(['login', 'logout', 'signup', 'register', 'refresh-token', 'oauth', 'Auth'].map(resourceKey)).toEqual(Array(7).fill('auth'))
  })
})

describe('grouping scanned endpoints', () => {
  const files = {
    'app.js': `
      const app = require('express')()
      app.get('/api/users', (req, res) => {})
      app.get('/api/user/:id', (req, res) => {})
      app.patch('/api/v2/Users/:id', (req, res) => {})
      app.post('/api/login', (req, res) => {})
      app.post('/api/auth/refresh', (req, res) => {})
      app.post('/api/register', (req, res) => {})
      app.get('/api/order-items', (req, res) => {})
      app.get('/api/orderItem/:id', (req, res) => {})
      app.get('/health', (req, res) => {})
    `
  }

  it('puts every route for a resource in one folder, named the way the code spells it', () => {
    expect(folderContents(build(files))).toEqual({
      // The login request comes first so a collection run signs in before protected requests.
      auth: ['POST /api/login', 'POST /api/auth/refresh', 'POST /api/register'],
      health: ['GET /health'],
      'order-items': ['GET /api/order-items', 'GET /api/orderItem/:id'],
      users: ['GET /api/user/:id', 'GET /api/users', 'PATCH /api/v2/Users/:id']
    })
  })

  it('prefers an OpenAPI tag as the folder name', () => {
    const result = scan({
      ...files,
      'openapi.yaml': `
openapi: 3.0.0
info: { title: T, version: '1' }
paths:
  /api/users/{id}/avatar:
    put:
      tags: [User Accounts]
      responses: { '200': { description: ok } }
  /api/accounts:
    get:
      tags: [Users]
      responses: { '200': { description: ok } }
`
    })
    const groups = groupEndpoints(result.endpoints)
    const users = groups.find((g) => g.key === 'user')!
    expect(users.name).toBe('Users')
    expect(users.endpoints.map((e) => e.path)).toContain('/api/accounts')
  })

  it('keeps re-scanned requests in a folder the user renamed', () => {
    const v1 = build({ 'app.js': `const app = require('express')()\napp.get('/users', (q, s) => {})\napp.get('/posts', (q, s) => {})` })
    const renamed = { ...v1, folders: v1.folders.map((f) => (f.name === 'users' ? { ...f, name: 'Users' } : f)) }
    const v2 = build({
      'app.js': `const app = require('express')()\napp.get('/users', (q, s) => {})\napp.get('/user/:id', (q, s) => {})\napp.get('/posts', (q, s) => {})`
    })
    const plan = planMerge(renamed, v2)
    const merged = applyMerge(renamed, v2, plan, new Set(plan.items.map((i) => i.key))).collection
    expect(merged.folders.map((f) => f.name).sort()).toEqual(['Users', 'posts'])
    expect(folderContents(merged).Users.sort()).toEqual(['GET /user/:id', 'GET /users'])
  })
})
