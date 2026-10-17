/**
 * Builds the Node agents one request hop uses: proxy (none / system / manual) plus TLS
 * options (verification, extra CAs, client certificate for the host). Agents are cached
 * by their effective configuration and dropped whenever network settings change.
 */
import http from 'node:http'
import https from 'node:https'
import { readFile } from 'node:fs/promises'
import { session } from 'electron'
import { HttpProxyAgent } from 'http-proxy-agent'
import { HttpsProxyAgent } from 'https-proxy-agent'
import type { ConnectionOptions } from 'node:tls'
import type { RequestNetworkOptions } from '@shared/types/network'
import { selectProxy, type ProxySelection } from '@shared/lib/network/proxy'
import { logger } from '../infra/logger.service'
import { networkSettingsService } from './network-settings.service'
import { buildTlsOptions, type BuiltTlsOptions } from './tls-options'
import { CookieJarService } from './cookie-jar.service'
import { dataFilePath } from '../infra/json-store'

export interface HopAgents {
  agent: http.Agent
  proxy: ProxySelection
  tls: BuiltTlsOptions
}

/**
 * https-proxy-agent drops the agent's own options when it upgrades the tunnel to TLS, so
 * the target's TLS options (verification, CAs, client certificate) are injected here.
 */
class TunnelAgent extends HttpsProxyAgent<string> {
  constructor(proxy: string, private readonly targetTls: ConnectionOptions) {
    // The proxy itself (if https://) is checked with the same trust settings, but never
    // gets the client certificate.
    super(proxy, { keepAlive: true, ca: targetTls.ca, rejectUnauthorized: targetTls.rejectUnauthorized })
  }

  override connect(req: http.ClientRequest, opts: Parameters<HttpsProxyAgent<string>['connect']>[1]) {
    const defined = Object.fromEntries(Object.entries(this.targetTls).filter(([, value]) => value !== undefined))
    return super.connect(req, { ...opts, ...defined } as typeof opts)
  }
}

const MAX_CACHED_AGENTS = 32
const agentCache = new Map<string, http.Agent>()
const warnedUnsupported = new Set<string>()

networkSettingsService.onChange(() => {
  for (const agent of agentCache.values()) agent.destroy()
  agentCache.clear()
})

async function resolveSystemProxy(url: string): Promise<string> {
  try {
    // Chromium wants http(s) for PAC lookups; ws(s) resolves like its http(s) twin.
    return await session.defaultSession.resolveProxy(url.replace(/^ws(s?):/i, 'http$1:'))
  } catch (error) {
    logger.warn(`System proxy lookup failed: ${error instanceof Error ? error.message : error}`, 'Network')
    return 'DIRECT'
  }
}

/** Proxy for one URL according to the global settings. */
export async function resolveProxyFor(url: string): Promise<ProxySelection> {
  const settings = networkSettingsService.get()
  const selection = selectProxy(url, settings.proxy, {
    password: settings.proxy.mode === 'manual' && settings.proxy.authEnabled ? networkSettingsService.getProxyPassword() : null,
    systemResult: settings.proxy.mode === 'system' ? await resolveSystemProxy(url) : undefined
  })
  if (selection.unsupported && !warnedUnsupported.has(selection.unsupported)) {
    warnedUnsupported.add(selection.unsupported)
    logger.warn(`System proxy type ${selection.unsupported} is not supported; connecting directly`, 'Network')
  }
  return selection
}

function cacheKey(parts: unknown[]): string {
  return JSON.stringify(parts)
}

function remember(key: string, agent: http.Agent): http.Agent {
  if (agentCache.size >= MAX_CACHED_AGENTS) {
    const oldest = agentCache.keys().next().value
    if (oldest !== undefined) {
      agentCache.get(oldest)?.destroy()
      agentCache.delete(oldest)
    }
  }
  agentCache.set(key, agent)
  return agent
}

/**
 * Agent for one hop. `tunnel` forces a CONNECT tunnel even for plain `ws://`/`http://`
 * targets (needed for WebSocket upgrades through an HTTP proxy).
 */
export async function agentsFor(
  target: string,
  overrides?: RequestNetworkOptions,
  options: { tunnel?: boolean } = {}
): Promise<HopAgents> {
  const url = new URL(target)
  const settings = networkSettingsService.get()
  const secure = url.protocol === 'https:' || url.protocol === 'wss:'
  const [proxy, tls] = await Promise.all([
    resolveProxyFor(target),
    buildTlsOptions(url, settings.tls, overrides, {
      readFile: (path) => readFile(path),
      getPassphrase: (id) => networkSettingsService.getCertificatePassphrase(id)
    })
  ])

  const tunnel = Boolean(proxy.proxyUrl) && (secure || options.tunnel)
  const key = cacheKey([
    proxy.proxyUrl,
    secure,
    tunnel,
    tls.rejectUnauthorized,
    settings.tls.useSystemCa,
    settings.tls.caCertPaths,
    tls.clientCertificateId ?? null
  ])
  const cached = agentCache.get(key)
  if (cached) return { agent: cached, proxy, tls }

  const tlsOptions: ConnectionOptions = {
    rejectUnauthorized: tls.rejectUnauthorized,
    ca: tls.ca,
    cert: tls.cert,
    key: tls.key,
    pfx: tls.pfx,
    passphrase: tls.passphrase
  }

  let agent: http.Agent
  if (proxy.proxyUrl && tunnel) {
    agent = new TunnelAgent(proxy.proxyUrl, tlsOptions)
  } else if (proxy.proxyUrl) {
    agent = new HttpProxyAgent(proxy.proxyUrl, { keepAlive: true })
  } else if (secure) {
    agent = new https.Agent({ keepAlive: true, ...tlsOptions })
  } else {
    agent = new http.Agent({ keepAlive: true })
  }
  return { agent: remember(key, agent), proxy, tls }
}

/** The shared workspace jar (single workspace today: `default`). */
export const cookieJar = new CookieJarService(() => dataFilePath('cookies/default.json'))
