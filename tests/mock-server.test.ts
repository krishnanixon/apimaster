import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import http from 'node:http'
import { v4 as uuidv4 } from 'uuid'
import {
  MockRouteTable,
  matchPath,
  compileMockRoute,
  normalizeMockPath
} from '@shared/lib/mock-server/route-matcher'
import { applyMockTemplates } from '@shared/lib/mock-server/templates'
import { validateMockRoute, validateJsonBody } from '@shared/lib/mock-server/validation'
import { createDefaultMockResponse, createDefaultMockRoute } from '@shared/lib/mock-server/defaults'
import { MockServerRuntime } from '../electron/main/mock-server/mock-server-runtime'
import type { MockServer } from '@shared/types/mock-server'
import { DEFAULT_MOCK_CORS } from '@shared/types/mock-server'

function buildServer(routes: MockServer['routes'], port: number): MockServer {
  return {
    id: uuidv4(),
    name: 'Test',
    host: '127.0.0.1',
    port,
    cors: { ...DEFAULT_MOCK_CORS, enabled: true },
    routes,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
}

function httpGet(url: string): Promise<{ status: number; body: string; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    http
      .get(url, (res) => {
        const chunks: Buffer[] = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () =>
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString('utf8'),
            headers: res.headers
          })
        )
      })
      .on('error', reject)
  })
}

describe('mock route matcher', () => {
  it('matches static and param routes with precedence', () => {
    const table = new MockRouteTable([
      { id: 'static-me', method: 'GET', path: '/users/me', enabled: true },
      { id: 'param', method: 'GET', path: '/users/:id', enabled: true }
    ])
    expect(table.match('GET', '/users/me')?.routeId).toBe('static-me')
    expect(table.match('GET', '/users/42')?.routeId).toBe('param')
    expect(table.match('GET', '/users/42/profile')).toBeNull()
  })

  it('returns methods for path for 405 handling', () => {
    const table = new MockRouteTable([
      { id: 'g', method: 'GET', path: '/users', enabled: true },
      { id: 'p', method: 'POST', path: '/users', enabled: true }
    ])
    expect(table.methodsForPath('/users').sort()).toEqual(['GET', 'POST'])
    expect(table.match('DELETE', '/users')).toBeNull()
  })

  it('detects duplicate patterns in validation', () => {
    const a = createDefaultMockRoute('GET', '/users')
    const b = createDefaultMockRoute('GET', '/users')
    expect(validateMockRoute(b, [a])).toMatch(/Duplicate/)
  })

  it('normalizes paths', () => {
    expect(normalizeMockPath('users/')).toBe('/users')
  })
})

describe('mock templates', () => {
  it('substitutes params, query, and body', () => {
    const out = applyMockTemplates(
      '{"id":"{{params.id}}","page":"{{query.page}}","name":"{{body.name}}"}',
      {
        params: { id: '42' },
        query: { page: '2' },
        headers: {},
        body: { name: 'Alice' },
        method: 'GET',
        path: '/users/42',
        host: '127.0.0.1:4010'
      }
    )
    expect(JSON.parse(out)).toEqual({ id: '42', page: '2', name: 'Alice' })
  })

  it('uses empty string for missing values', () => {
    expect(
      applyMockTemplates('{{query.missing}}', {
        params: {},
        query: {},
        headers: {},
        body: {},
        method: 'GET',
        path: '/',
        host: 'h'
      })
    ).toBe('')
  })
})

describe('mock HTTP runtime', () => {
  let runtime: MockServerRuntime
  let port: number

  beforeEach(async () => {
    port = 4500 + Math.floor(Math.random() * 400)
    const resp = createDefaultMockResponse()
    resp.body = '{"id":"{{params.id}}","name":"Mock User"}'
    const route = createDefaultMockRoute('GET', '/users/:id')
    route.responses = [resp]
    route.activeResponseId = resp.id
    runtime = new MockServerRuntime(buildServer([route], port))
    await runtime.start()
  })

  afterEach(async () => {
    await runtime.stop()
  })

  it('serves templated JSON', async () => {
    const res = await httpGet(`http://127.0.0.1:${port}/users/42`)
    expect(res.status).toBe(200)
    expect(JSON.parse(res.body)).toEqual({ id: '42', name: 'Mock User' })
  })

  it('returns 404 for unknown paths', async () => {
    const res = await httpGet(`http://127.0.0.1:${port}/unknown`)
    expect(res.status).toBe(404)
  })

  it('returns 405 for wrong method', async () => {
    const listRoute = createDefaultMockRoute('GET', '/items')
    runtime.updateConfig(buildServer([listRoute], port))
    await runtime.stop()
    await runtime.start()
    await new Promise<void>((resolve, reject) => {
      const req = http.request(
        { host: '127.0.0.1', port, method: 'POST', path: '/items' },
        (res) => {
          expect(res.statusCode).toBe(405)
          expect(res.headers.allow).toBeDefined()
          res.resume()
          res.on('end', () => resolve())
        }
      )
      req.on('error', reject)
      req.end()
    })
  })

  it('handles concurrent delays independently', async () => {
    const fast = createDefaultMockRoute('GET', '/fast')
    fast.responses[0]!.delay = 0
    const slow = createDefaultMockRoute('GET', '/slow')
    slow.responses[0]!.delay = 800
    runtime.updateConfig(buildServer([fast, slow], port))
    await runtime.stop()
    await runtime.start()
    const t0 = Date.now()
    const [fastRes, slowRes] = await Promise.all([
      httpGet(`http://127.0.0.1:${port}/fast`),
      httpGet(`http://127.0.0.1:${port}/slow`)
    ])
    expect(fastRes.status).toBe(200)
    expect(slowRes.status).toBe(200)
    expect(Date.now() - t0).toBeLessThan(1500)
  })

  it('handles OPTIONS when CORS enabled', async () => {
    await new Promise<void>((resolve, reject) => {
      const req = http.request(
        { host: '127.0.0.1', port, method: 'OPTIONS', path: '/users/1' },
        (res) => {
          expect(res.statusCode).toBe(204)
          expect(res.headers['access-control-allow-origin']).toBeDefined()
          res.resume()
          res.on('end', () => resolve())
        }
      )
      req.on('error', reject)
      req.end()
    })
  })
})

describe('mock JSON validation', () => {
  it('rejects invalid JSON bodies', () => {
    expect(validateJsonBody('{ invalid')).toEqual(expect.objectContaining({ ok: false }))
  })
})

describe('compileMockRoute', () => {
  it('matches exact static route only', () => {
    const route = compileMockRoute('r1', 'GET', '/users')
    expect(matchPath(route, '/users')).not.toBeNull()
    expect(matchPath(route, '/users/1')).toBeNull()
  })
})
