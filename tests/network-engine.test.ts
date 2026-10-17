/**
 * End-to-end checks of the main-process request engine against real local servers:
 * redirects + cookie jar, TLS verification / custom CA / client certificates, the proxy
 * (with auth and bypass), and WebSockets with headers, cookies and the proxy.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import http from 'node:http'
import https from 'node:https'
import net from 'node:net'
import { mkdtempSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { AddressInfo } from 'node:net'
import { WebSocketServer } from 'ws'

const state = vi.hoisted(() => ({ userData: '', pac: 'DIRECT' }))

vi.mock('electron', () => ({
  app: { getPath: () => state.userData },
  session: { defaultSession: { resolveProxy: async () => state.pac } },
  safeStorage: {
    isEncryptionAvailable: () => true,
    getSelectedStorageBackend: () => 'keychain',
    encryptString: (value: string) => Buffer.from(`enc:${value}`, 'utf8'),
    decryptString: (value: Buffer) => value.toString('utf8').replace(/^enc:/, '')
  }
}))

state.userData = mkdtempSync(join(tmpdir(), 'shurikly-network-'))

import { httpClientService } from '../electron/main/api-studio/http-client.service'
import { webSocketService } from '../electron/main/api-studio/websocket.service'
import { networkSettingsService } from '../electron/main/network/network-settings.service'
import { cookieJar } from '../electron/main/network/network-agents'
import type { ResolvedHttpRequest } from '@shared/types/api-studio'
import { DEFAULT_NETWORK_SETTINGS, type WebSocketEvent } from '@shared/types/network'

const fixture = (name: string) => join(__dirname, 'fixtures', 'tls', name)
const read = (name: string) => readFileSync(fixture(name))

let httpPort = 0
let httpsPort = 0
let mtlsPort = 0
let proxyPort = 0
let wsPort = 0
const servers: Array<http.Server | https.Server> = []
const proxyLog: Array<{ kind: 'forward' | 'connect'; target: string; auth?: string }> = []
let wss: WebSocketServer

function listen(server: http.Server | https.Server): Promise<number> {
  servers.push(server)
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve((server.address() as AddressInfo).port)))
}

function request(url: string, patch: Partial<ResolvedHttpRequest> = {}): ResolvedHttpRequest {
  return {
    clientRequestId: `r-${Math.random()}`,
    method: 'GET',
    url,
    headers: {},
    params: {},
    body: { type: 'none', content: '' },
    timeoutMs: 5_000,
    ...patch
  }
}

beforeAll(async () => {
  httpPort = await listen(
    http.createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://x')
      if (url.pathname === '/login') {
        res.writeHead(302, { Location: '/home', 'Set-Cookie': 'sid=from-redirect; Path=/; HttpOnly' })
        return res.end()
      }
      if (url.pathname === '/away') {
        // Different host (127.0.0.1 vs localhost) → credentials must be dropped.
        res.writeHead(307, { Location: `http://localhost:${httpPort}/echo` })
        return res.end()
      }
      if (url.pathname === '/post-redirect') {
        res.writeHead(303, { Location: '/echo' })
        return res.end()
      }
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify({ path: url.pathname, method: req.method, cookie: req.headers.cookie ?? null, auth: req.headers.authorization ?? null })
      )
    })
  )

  httpsPort = await listen(
    https.createServer({ key: read('server.key'), cert: read('server.pem') }, (_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/plain' })
      res.end('secure ok')
    })
  )

  mtlsPort = await listen(
    https.createServer(
      { key: read('server.key'), cert: read('server.pem'), ca: read('ca.pem'), requestCert: true, rejectUnauthorized: true },
      (req, res) => {
        const peer = (req.socket as import('node:tls').TLSSocket).getPeerCertificate()
        res.writeHead(200, { 'Content-Type': 'text/plain' })
        res.end(`hello ${peer.subject?.CN}`)
      }
    )
  )

  const proxy = http.createServer((req, res) => {
    proxyLog.push({ kind: 'forward', target: req.url ?? '', auth: req.headers['proxy-authorization'] })
    const target = new URL(req.url ?? '')
    const upstream = http.request(
      { host: target.hostname, port: target.port, path: `${target.pathname}${target.search}`, method: req.method, headers: req.headers },
      (up) => {
        res.writeHead(up.statusCode ?? 502, up.headers)
        up.pipe(res)
      }
    )
    req.pipe(upstream)
  })
  proxy.on('connect', (req, socket, head) => {
    proxyLog.push({ kind: 'connect', target: req.url ?? '', auth: req.headers['proxy-authorization'] })
    const [host, port] = (req.url ?? '').split(':')
    const upstream = net.connect(Number(port), host, () => {
      socket.write('HTTP/1.1 200 Connection Established\r\n\r\n')
      upstream.write(head)
      upstream.pipe(socket)
      socket.pipe(upstream)
    })
    upstream.on('error', () => socket.destroy())
  })
  proxyPort = await listen(proxy)

  const wsHttp = http.createServer()
  wss = new WebSocketServer({ server: wsHttp })
  wss.on('headers', (headers) => headers.push('Set-Cookie: ws-session=granted; Path=/'))
  wss.on('connection', (socket, req) => {
    socket.send(JSON.stringify({ header: req.headers['x-test'] ?? null, cookie: req.headers.cookie ?? null }))
    socket.on('message', (data) => socket.send(`echo:${data.toString()}`))
  })
  wsPort = await listen(wsHttp)
})

afterAll(async () => {
  wss.close()
  for (const server of servers) {
    server.closeAllConnections?.()
    await new Promise((resolve) => server.close(resolve))
  }
})

beforeEach(async () => {
  networkSettingsService.update(structuredClone(DEFAULT_NETWORK_SETTINGS))
  networkSettingsService.updateSecrets({ proxyPassword: null })
  await cookieJar.clear()
  proxyLog.length = 0
  state.pac = 'DIRECT'
})

describe('HTTP engine: redirects and cookies', () => {
  it('captures Set-Cookie on a redirect and sends it to the next hop and later requests', async () => {
    const result = await httpClientService.execute(request(`http://127.0.0.1:${httpPort}/login`))
    expect(result.status).toBe(200)
    expect(JSON.parse(result.data)).toMatchObject({ path: '/home', cookie: 'sid=from-redirect' })

    const later = await httpClientService.execute(request(`http://127.0.0.1:${httpPort}/echo`))
    expect(JSON.parse(later.data).cookie).toBe('sid=from-redirect')
    expect((await cookieJar.list()).map((c) => c.name)).toEqual(['sid'])
  })

  it('skips jar cookies with "don\'t send cookies" but merges a manual Cookie header otherwise', async () => {
    await httpClientService.execute(request(`http://127.0.0.1:${httpPort}/login`))
    const skipped = await httpClientService.execute(
      request(`http://127.0.0.1:${httpPort}/echo`, { network: { disableCookies: true } })
    )
    expect(JSON.parse(skipped.data).cookie).toBeNull()

    const merged = await httpClientService.execute(
      request(`http://127.0.0.1:${httpPort}/echo`, { headers: { Cookie: 'theme=dark' } })
    )
    expect(JSON.parse(merged.data).cookie).toBe('theme=dark; sid=from-redirect')
  })

  it('does not use the jar when cookies are turned off globally', async () => {
    networkSettingsService.update({ cookies: { enabled: false } })
    await httpClientService.execute(request(`http://127.0.0.1:${httpPort}/login`))
    expect(await cookieJar.list()).toEqual([])
  })

  it('drops Authorization on a cross-origin redirect and switches 303 to GET', async () => {
    const away = await httpClientService.execute(
      request(`http://127.0.0.1:${httpPort}/away`, { headers: { Authorization: 'Bearer secret' } })
    )
    expect(JSON.parse(away.data)).toMatchObject({ path: '/echo', auth: null })

    const posted = await httpClientService.execute(
      request(`http://127.0.0.1:${httpPort}/post-redirect`, { method: 'POST', body: { type: 'json', content: '{"a":1}' } })
    )
    expect(JSON.parse(posted.data)).toMatchObject({ path: '/echo', method: 'GET' })
  })
})

describe('HTTP engine: TLS', () => {
  const url = () => `https://localhost:${httpsPort}/`

  it('rejects an untrusted certificate with a clear TLS error', async () => {
    networkSettingsService.update({ tls: { useSystemCa: false } })
    const result = await httpClientService.execute(request(url()))
    expect(result.status).toBe(0)
    expect(result.networkError).toMatchObject({ kind: 'tls', code: 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' })
  })

  it('accepts it with verification off for one request or globally', async () => {
    networkSettingsService.update({ tls: { useSystemCa: false } })
    expect((await httpClientService.execute(request(url(), { network: { verifySsl: false } }))).data).toBe('secure ok')
    networkSettingsService.update({ tls: { verifySsl: false } })
    expect((await httpClientService.execute(request(url()))).data).toBe('secure ok')
    // A request can force verification back on.
    expect((await httpClientService.execute(request(url(), { network: { verifySsl: true } }))).networkError?.kind).toBe('tls')
  })

  it('trusts a custom CA file', async () => {
    networkSettingsService.update({ tls: { caCertPaths: [fixture('ca.pem')] } })
    expect((await httpClientService.execute(request(url()))).data).toBe('secure ok')
  })

  it('sends a PEM or PFX client certificate to a host that requires one', async () => {
    const mtls = `https://localhost:${mtlsPort}/`
    networkSettingsService.update({ tls: { caCertPaths: [fixture('ca.pem')] } })
    const without = await httpClientService.execute(request(mtls))
    expect(without.status).toBe(0)

    networkSettingsService.update({
      tls: {
        clientCertificates: [
          { id: 'pem1', host: 'localhost', kind: 'pem', certPath: fixture('client.pem'), keyPath: fixture('client.key'), enabled: true }
        ]
      }
    })
    expect((await httpClientService.execute(request(mtls))).data).toBe('hello shurikly-client')

    networkSettingsService.update({
      tls: { clientCertificates: [{ id: 'pfx1', host: `localhost:${mtlsPort}`, kind: 'pfx', pfxPath: fixture('client.pfx'), enabled: true }] }
    })
    networkSettingsService.updateSecrets({ certificatePassphrases: { pfx1: 'test-pass' } })
    expect((await httpClientService.execute(request(mtls))).data).toBe('hello shurikly-client')
  })
})

describe('HTTP engine: proxy', () => {
  it('forwards http and tunnels https through a manual proxy with auth', async () => {
    networkSettingsService.update({
      proxy: { mode: 'manual', httpProxy: `127.0.0.1:${proxyPort}`, bypass: '', authEnabled: true, username: 'alice' },
      tls: { caCertPaths: [fixture('ca.pem')] }
    })
    networkSettingsService.updateSecrets({ proxyPassword: 's3cret' })

    const plain = await httpClientService.execute(request(`http://localhost:${httpPort}/echo`))
    expect(JSON.parse(plain.data).path).toBe('/echo')
    const secure = await httpClientService.execute(request(`https://localhost:${httpsPort}/`))
    expect(secure.error ?? secure.data).toBe('secure ok')

    const expectedAuth = `Basic ${Buffer.from('alice:s3cret').toString('base64')}`
    expect(proxyLog).toEqual([
      { kind: 'forward', target: `http://localhost:${httpPort}/echo`, auth: expectedAuth },
      { kind: 'connect', target: `localhost:${httpsPort}`, auth: expectedAuth }
    ])
    // The password never lands in the settings file.
    expect(readFileSync(join(state.userData, 'data', 'network.json'), 'utf-8')).not.toContain('s3cret')
  })

  it('goes direct for bypassed hosts', async () => {
    networkSettingsService.update({ proxy: { mode: 'manual', httpProxy: `127.0.0.1:${proxyPort}`, bypass: 'localhost' } })
    await httpClientService.execute(request(`http://localhost:${httpPort}/echo`))
    expect(proxyLog).toEqual([])
  })

  it('uses the system proxy answer and explains an unreachable proxy', async () => {
    networkSettingsService.update({ proxy: { mode: 'system' } })
    state.pac = `PROXY 127.0.0.1:${proxyPort}`
    await httpClientService.execute(request(`http://localhost:${httpPort}/echo`))
    expect(proxyLog).toHaveLength(1)

    state.pac = 'PROXY 127.0.0.1:1'
    const failed = await httpClientService.execute(request(`http://localhost:${httpPort}/echo`))
    expect(failed.networkError).toMatchObject({ kind: 'proxy' })
  })
})

describe('WebSocket in the main process', () => {
  function connect(url: string, headers: Record<string, string> = {}) {
    const events: WebSocketEvent[] = []
    const sender = { isDestroyed: () => false, send: (_channel: string, event: WebSocketEvent) => events.push(event) }
    const connectionId = `ws-${Math.random()}`
    const done = webSocketService.connect(
      { connectionId, url, headers, params: { room: 'a' }, timeoutMs: 5_000 },
      sender as unknown as import('electron').WebContents
    )
    const waitFor = async (predicate: (events: WebSocketEvent[]) => boolean) => {
      for (let i = 0; i < 200 && !predicate(events); i++) await new Promise((r) => setTimeout(r, 10))
      return events
    }
    return { events, connectionId, done, waitFor }
  }

  it('sends custom headers and jar cookies, stores upgrade cookies, and echoes messages', async () => {
    await cookieJar.storeFromResponse(`http://localhost:${wsPort}/`, 'pre=1; Path=/')
    const ws = connect(`ws://localhost:${wsPort}/socket`, { 'X-Test': 'hello' })
    await ws.done
    await ws.waitFor((e) => e.some((x) => x.type === 'message'))
    const first = ws.events.find((e) => e.type === 'message')
    expect(first && first.type === 'message' && JSON.parse(first.data)).toEqual({ header: 'hello', cookie: 'pre=1' })

    webSocketService.send(ws.connectionId, 'ping')
    await ws.waitFor((e) => e.some((x) => x.type === 'message' && x.data === 'echo:ping'))
    webSocketService.close(ws.connectionId)
    await ws.waitFor((e) => e.some((x) => x.type === 'close'))
    expect((await cookieJar.list()).map((c) => c.name).sort()).toEqual(['pre', 'ws-session'])
  })

  it('tunnels ws:// through the proxy', async () => {
    networkSettingsService.update({ proxy: { mode: 'manual', httpProxy: `127.0.0.1:${proxyPort}`, bypass: '' } })
    const ws = connect(`localhost:${wsPort}`)
    await ws.done
    await ws.waitFor((e) => e.some((x) => x.type === 'open'))
    expect(ws.events[0]).toMatchObject({ type: 'open' })
    expect(proxyLog).toEqual([{ kind: 'connect', target: `localhost:${wsPort}`, auth: undefined }])
    webSocketService.close(ws.connectionId)
  })
})
