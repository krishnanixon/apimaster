/**
 * Proxy selection for the request engine: which proxy (if any) a target URL goes through.
 * Pure so it can be unit tested; the main process supplies the system (PAC) answer.
 */
import type { ProxySettings } from '../../types/network'

export interface ProxySelection {
  /** Full proxy URL including credentials when auth is on, or `null` for a direct connection. */
  proxyUrl: string | null
  /** Same URL without credentials, safe to log or show. */
  displayUrl: string | null
  source: 'none' | 'system' | 'manual' | 'bypass'
  /** Set when the system asked for a proxy type we can't use (e.g. SOCKS); we go direct. */
  unsupported?: string
}

const DIRECT: ProxySelection = { proxyUrl: null, displayUrl: null, source: 'none' }

/** `proxy.corp:8080` → `http://proxy.corp:8080`. Returns null for anything that isn't an http(s) proxy URL. */
export function normalizeProxyUrl(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`
  try {
    const url = new URL(withScheme)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    if (!url.hostname) return null
    return `${url.protocol}//${url.username ? `${url.username}${url.password ? `:${url.password}` : ''}@` : ''}${url.host}`
  } catch {
    return null
  }
}

function withCredentials(proxyUrl: string, username: string, password: string): string {
  const url = new URL(proxyUrl)
  url.username = encodeURIComponent(username)
  url.password = password ? encodeURIComponent(password) : ''
  return url.toString().replace(/\/$/, '')
}

function stripCredentials(proxyUrl: string): string {
  const url = new URL(proxyUrl)
  return `${url.protocol}//${url.host}`
}

interface BypassRule {
  kind: 'all' | 'local' | 'domain' | 'subdomains' | 'cidr4' | 'exact'
  value: string
  port?: number
  /** For cidr4: network address and prefix length. */
  network?: number
  prefix?: number
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.')
  if (parts.length !== 4) return null
  let out = 0
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null
    const n = Number(part)
    if (n > 255) return null
    out = out * 256 + n
  }
  return out
}

/** Splits `host:port`, `[v6]:port` and bare IPv6 addresses. */
function splitHostPort(entry: string): { host: string; port?: number } {
  const bracketed = /^\[([^\]]+)\](?::(\d+))?$/.exec(entry)
  if (bracketed) return { host: bracketed[1], port: bracketed[2] ? Number(bracketed[2]) : undefined }
  const colonCount = (entry.match(/:/g) ?? []).length
  if (colonCount === 1) {
    const [host, port] = entry.split(':')
    if (/^\d+$/.test(port)) return { host, port: Number(port) }
  }
  return { host: entry }
}

/** Parses a NO_PROXY-style list (comma, semicolon, whitespace or newline separated). */
export function parseBypassList(list: string): BypassRule[] {
  const rules: BypassRule[] = []
  for (const raw of list.split(/[\s,;]+/)) {
    let entry = raw.trim().toLowerCase()
    if (!entry) continue
    if (entry === '*') {
      rules.push({ kind: 'all', value: '*' })
      continue
    }
    if (entry === '<local>') {
      rules.push({ kind: 'local', value: entry })
      continue
    }
    entry = entry.replace(/^[a-z][a-z0-9+.-]*:\/\//, '').replace(/\/+$/, '')
    const cidr = /^(\d{1,3}(?:\.\d{1,3}){3})\/(\d{1,2})$/.exec(entry)
    if (cidr) {
      const network = ipv4ToInt(cidr[1])
      const prefix = Number(cidr[2])
      if (network !== null && prefix <= 32) rules.push({ kind: 'cidr4', value: entry, network, prefix })
      continue
    }
    const { host, port } = splitHostPort(entry)
    if (host.startsWith('*.')) rules.push({ kind: 'subdomains', value: host.slice(2), port })
    else if (host.startsWith('.')) rules.push({ kind: 'domain', value: host.slice(1), port })
    else if (ipv4ToInt(host) !== null || host.includes(':')) rules.push({ kind: 'exact', value: host, port })
    // curl / Go semantics: a bare domain also covers its subdomains.
    else rules.push({ kind: 'domain', value: host, port })
  }
  return rules
}

function defaultPort(protocol: string): number {
  return protocol === 'https:' || protocol === 'wss:' ? 443 : 80
}

/** True when `target` should skip the proxy according to a NO_PROXY-style list. */
export function shouldBypassProxy(target: string | URL, list: string): boolean {
  let url: URL
  try {
    url = typeof target === 'string' ? new URL(target) : target
  } catch {
    return false
  }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  const port = url.port ? Number(url.port) : defaultPort(url.protocol)
  const ip = ipv4ToInt(host)

  return parseBypassList(list).some((rule) => {
    if (rule.port !== undefined && rule.port !== port) return false
    switch (rule.kind) {
      case 'all':
        return true
      case 'local':
        return !host.includes('.') && !host.includes(':')
      case 'exact':
        return host === rule.value
      case 'domain':
        return host === rule.value || host.endsWith(`.${rule.value}`)
      case 'subdomains':
        return host.endsWith(`.${rule.value}`)
      case 'cidr4': {
        if (ip === null || rule.network === undefined || rule.prefix === undefined) return false
        if (rule.prefix === 0) return true
        const mask = (0xffffffff << (32 - rule.prefix)) >>> 0
        return ((ip & mask) >>> 0) === ((rule.network & mask) >>> 0)
      }
    }
  })
}

/**
 * Reads Chromium's `resolveProxy` answer, e.g. `PROXY proxy:8080; DIRECT`.
 * Returns the first usable http(s) proxy, `null` for DIRECT, or the unsupported scheme.
 */
export function parsePacResult(result: string): { proxyUrl: string | null; unsupported?: string } {
  let unsupported: string | undefined
  for (const part of result.split(';')) {
    const [type, hostPort] = part.trim().split(/\s+/)
    if (!type) continue
    const upper = type.toUpperCase()
    if (upper === 'DIRECT') return { proxyUrl: null, unsupported }
    if ((upper === 'PROXY' || upper === 'HTTP') && hostPort) return { proxyUrl: `http://${hostPort}`, unsupported }
    if (upper === 'HTTPS' && hostPort) return { proxyUrl: `https://${hostPort}`, unsupported }
    unsupported ??= upper
  }
  return { proxyUrl: null, unsupported }
}

/**
 * Chooses the proxy for one target URL.
 * `systemResult` is Electron's `session.resolveProxy(url)` answer (only used in `system` mode).
 */
export function selectProxy(
  target: string,
  settings: ProxySettings,
  options: { password?: string | null; systemResult?: string } = {}
): ProxySelection {
  if (settings.mode === 'none') return DIRECT

  let url: URL
  try {
    url = new URL(target)
  } catch {
    return DIRECT
  }

  let proxyUrl: string | null = null
  const source: ProxySelection['source'] = settings.mode
  let unsupported: string | undefined

  if (settings.mode === 'system') {
    const parsed = parsePacResult(options.systemResult ?? 'DIRECT')
    proxyUrl = parsed.proxyUrl
    unsupported = parsed.unsupported
  } else {
    if (shouldBypassProxy(url, settings.bypass)) return { ...DIRECT, source: 'bypass' }
    const secure = url.protocol === 'https:' || url.protocol === 'wss:'
    const http = normalizeProxyUrl(settings.httpProxy)
    const https = normalizeProxyUrl(settings.httpsProxy)
    proxyUrl = secure ? (https ?? http) : (http ?? https)
  }

  if (!proxyUrl) return { ...DIRECT, source: unsupported ? source : 'none', unsupported }

  const authed =
    settings.mode === 'manual' && settings.authEnabled && settings.username
      ? withCredentials(proxyUrl, settings.username, options.password ?? '')
      : proxyUrl
  return { proxyUrl: authed, displayUrl: stripCredentials(proxyUrl), source }
}
