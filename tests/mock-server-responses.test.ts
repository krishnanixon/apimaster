import { afterEach, describe, expect, it } from 'vitest'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { v4 as uuidv4 } from 'uuid'
import { createDefaultMockResponse, createDefaultMockRoute, selectMockResponse } from '@shared/lib/mock-server/defaults'
import {
  extractMockPathFromUrl,
  findMockRouteForRequest,
  mockResponseFromExecution,
  uniqueMockResponseName
} from '@shared/lib/mock-server/from-request'
import { validateMockResponse, validateMockRoute } from '@shared/lib/mock-server/validation'
import { MockServerRuntime } from '../electron/main/mock-server/mock-server-runtime'
import type { MockResponse, MockRoute, MockServer } from '@shared/types/mock-server'
import { DEFAULT_MOCK_CORS } from '@shared/types/mock-server'

function response(name: string, status: number, body = `{"name":"${name}"}`, extra: Partial<MockResponse> = {}): MockResponse {
  return { ...createDefaultMockResponse(name), status, body, ...extra }
}

function routeWith(responses: MockResponse[], extra: Partial<MockRoute> = {}): MockRoute {
  return { ...createDefaultMockRoute('GET', '/users/:id'), responses, activeResponseId: responses[0]?.id, ...extra }
}

describe('mock response selection', () => {
  const ok = response('Success', 200)
  const missing = response('Not found', 404)
  const broken = response('Server error', 500, '{}', { enabled: false })

  it('uses the active response by default', () => {
    const route = routeWith([ok, missing], { activeResponseId: missing.id })
    const sel = selectMockResponse(route)
    expect(sel.ok && sel.response.id).toBe(missing.id)
  })

  it('honours overrides by id, name, and status code', () => {
    const route = routeWith([ok, missing])
    for (const override of [missing.id, 'not FOUND', '404']) {
      const sel = selectMockResponse(route, { override })
      expect(sel.ok && sel.response.id).toBe(missing.id)
    }
  })

  it('ignores disabled responses and reports unknown overrides', () => {
    const route = routeWith([ok, missing, broken])
    const sel = selectMockResponse(route, { override: 'Server error' })
    expect(sel).toEqual({ ok: false, reason: 'override-not-found', requested: 'Server error', available: ['Success', 'Not found'] })
  })

  it('cycles in sequential mode and picks within range in random mode', () => {
    const route = routeWith([ok, broken, missing], { responseMode: 'sequential' })
    const picks = [0, 1, 2, 3].map((sequence) => {
      const sel = selectMockResponse(route, { sequence })
      return sel.ok ? sel.response.name : null
    })
    expect(picks).toEqual(['Success', 'Not found', 'Success', 'Not found'])

    const random = { ...route, responseMode: 'random' as const }
    const low = selectMockResponse(random, { random: () => 0 })
    const high = selectMockResponse(random, { random: () => 0.9999 })
    expect(low.ok && low.response.name).toBe('Success')
    expect(high.ok && high.response.name).toBe('Not found')
  })

  it('fails when nothing is enabled', () => {
    expect(selectMockResponse(routeWith([broken])).ok).toBe(false)
  })
})

describe('mock validation', () => {
  it('rejects header names and values Node would refuse to send', () => {
    expect(validateMockResponse(response('A', 200, '{}', { headers: { 'Bad Header': 'x' } }))).toMatch(/Invalid header name/)
    expect(validateMockResponse(response('A', 200, '{}', { headers: { 'X-Ok': 'a\r\nInjected: 1' } }))).toMatch(/line break/)
    expect(validateMockResponse(response('A', 200, '{}', { headers: { 'X-Ok': 'fine' } }))).toBeNull()
  })

  it('rejects unknown response modes', () => {
    const route = routeWith([response('A', 200)], { responseMode: 'weird' as never })
    expect(validateMockRoute(route, [])).toBe('Invalid response mode')
  })
})

describe('mock examples from real responses', () => {
  it('extracts route patterns from templated request URLs', () => {
    expect(extractMockPathFromUrl('{{baseUrl}}/users/{{userId}}?expand=1')).toBe('/users/:userId')
    expect(extractMockPathFromUrl('https://api.test/v1/users/{id}/posts')).toBe('/v1/users/:id/posts')
    expect(extractMockPathFromUrl('http://localhost:3000')).toBe('/')
    expect(extractMockPathFromUrl('/users/:id/')).toBe('/users/:id')
  })

  it('builds a mock response without transport headers', () => {
    const mock = mockResponseFromExecution(
      {
        ok: false,
        status: 404,
        statusText: 'Not Found',
        headers: { 'content-type': 'application/json', 'content-length': '12', 'set-cookie': 's=1', 'x-rate-limit': '10' },
        data: '{"error":"nope"}',
        isBinary: false,
        contentType: 'application/json',
        timeMs: 5,
        sizeBytes: 16
      },
      '404 Not Found'
    )
    expect(mock.status).toBe(404)
    expect(mock.bodyType).toBe('json')
    expect(JSON.parse(mock.body)).toEqual({ error: 'nope' })
    expect(mock.headers).toEqual({ 'content-type': 'application/json', 'x-rate-limit': '10' })
    expect(validateMockResponse(mock)).toBeNull()
  })

  it('keeps binary payloads as base64 and falls back to text for invalid JSON', () => {
    const base = { ok: true, status: 200, statusText: 'OK', headers: {}, timeMs: 1, sizeBytes: 3 }
    expect(mockResponseFromExecution({ ...base, data: '', dataBase64: 'AAEC', isBinary: true, contentType: 'image/png' }, 'img')).toMatchObject({
      bodyType: 'binary',
      body: 'AAEC'
    })
    expect(mockResponseFromExecution({ ...base, data: '{oops', isBinary: false, contentType: 'application/json' }, 'bad').bodyType).toBe('text')
  })

  it('finds the matching route by pattern or concrete path', () => {
    const byPattern = createDefaultMockRoute('GET', '/users/:id')
    const list = createDefaultMockRoute('GET', '/users')
    expect(findMockRouteForRequest([list, byPattern], 'GET', '{{base}}/users/{{id}}')?.id).toBe(byPattern.id)
    expect(findMockRouteForRequest([list, byPattern], 'GET', 'https://x.test/users/42')?.id).toBe(byPattern.id)
    expect(findMockRouteForRequest([list, byPattern], 'POST', 'https://x.test/users')).toBeUndefined()
  })

  it('generates unique response names', () => {
    const route = routeWith([response('200 OK', 200), response('200 OK (2)', 200)])
    expect(uniqueMockResponseName(route, '200 OK')).toBe('200 OK (3)')
    expect(uniqueMockResponseName(route, '404 Not Found')).toBe('404 Not Found')
    expect(uniqueMockResponseName(undefined, 'x')).toBe('x')
  })
})

function request(
  port: number,
  path: string,
  headers: Record<string, string> = {},
  method = 'GET'
): Promise<{ status: number; body: string; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path, method, headers }, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8'), headers: res.headers }))
    })
    req.on('error', reject)
    req.end()
  })
}

async function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const srv = http.createServer()
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address() as AddressInfo
      srv.close(() => resolve(port))
    })
  })
}

describe('mock runtime response selection', () => {
  let runtime: MockServerRuntime | null = null

  afterEach(async () => {
    await runtime?.stop()
    runtime = null
  })

  async function start(route: MockRoute): Promise<number> {
    const port = await freePort()
    const server: MockServer = {
      id: uuidv4(),
      name: 'Selection',
      host: '127.0.0.1',
      port,
      cors: { ...DEFAULT_MOCK_CORS },
      routes: [route],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    runtime = new MockServerRuntime(server)
    await runtime.start()
    return port
  }

  it('serves the response named in X-Mock-Response or ?__response=', async () => {
    const ok = response('Success', 200, '{"id":"{{params.id}}"}', { headers: { 'X-Custom': 'yes' } })
    const missing = response('Not found', 404, '{"error":"missing {{params.id}}"}')
    const port = await start(routeWith([ok, missing]))

    const plain = await request(port, '/users/7')
    expect(plain.status).toBe(200)
    expect(JSON.parse(plain.body)).toEqual({ id: '7' })
    expect(plain.headers['x-custom']).toBe('yes')
    expect(plain.headers['x-mock-response']).toBe('Success')

    const byHeader = await request(port, '/users/7', { 'X-Mock-Response': 'not found' })
    expect(byHeader.status).toBe(404)
    expect(JSON.parse(byHeader.body)).toEqual({ error: 'missing 7' })

    const byQuery = await request(port, '/users/8?__response=404')
    expect(byQuery.status).toBe(404)

    const unknown = await request(port, '/users/7', { 'X-Mock-Response': 'teapot' })
    expect(unknown.status).toBe(400)
    expect(JSON.parse(unknown.body)).toMatchObject({ error: 'Unknown mock response', available: ['Success', 'Not found'] })
  })

  it('rotates responses in sequential mode', async () => {
    const port = await start(routeWith([response('First', 200), response('Second', 201)], { responseMode: 'sequential' }))
    const statuses = []
    for (let i = 0; i < 4; i++) statuses.push((await request(port, '/users/1')).status)
    expect(statuses).toEqual([200, 201, 200, 201])
  })

  it('allows and exposes the selection header for browser clients', async () => {
    const port = await start(routeWith([response('Success', 200)]))
    const preflight = await request(port, '/users/1', { Origin: 'http://localhost:5173' }, 'OPTIONS')
    expect(preflight.status).toBe(204)
    expect(String(preflight.headers['access-control-allow-headers'])).toMatch(/X-Mock-Response/i)
    expect(String(preflight.headers['access-control-expose-headers'])).toMatch(/X-Mock-Response/i)
  })
})
