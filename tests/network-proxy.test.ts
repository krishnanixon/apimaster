import { describe, expect, it } from 'vitest'
import { normalizeProxyUrl, parsePacResult, selectProxy, shouldBypassProxy } from '@shared/lib/network/proxy'
import { DEFAULT_NETWORK_SETTINGS, type ProxySettings } from '@shared/types/network'

const manual = (patch: Partial<ProxySettings> = {}): ProxySettings => ({
  ...DEFAULT_NETWORK_SETTINGS.proxy,
  mode: 'manual',
  httpProxy: 'proxy.corp:8080',
  httpsProxy: '',
  bypass: '',
  ...patch
})

describe('normalizeProxyUrl', () => {
  it('adds http:// to bare host:port and keeps https proxies', () => {
    expect(normalizeProxyUrl('proxy.corp:8080')).toBe('http://proxy.corp:8080')
    expect(normalizeProxyUrl('https://secure-proxy:8443')).toBe('https://secure-proxy:8443')
    expect(normalizeProxyUrl('  ')).toBeNull()
  })

  it('rejects non-http proxy schemes', () => {
    expect(normalizeProxyUrl('socks5://proxy:1080')).toBeNull()
  })
})

describe('shouldBypassProxy', () => {
  const list = 'localhost, .corp.example, *.internal, 10.0.0.0/8, build.local:8443, [::1]'

  it('matches exact hosts and domain suffixes', () => {
    expect(shouldBypassProxy('http://localhost:3000/x', list)).toBe(true)
    expect(shouldBypassProxy('https://corp.example/', list)).toBe(true)
    expect(shouldBypassProxy('https://api.corp.example/', list)).toBe(true)
    expect(shouldBypassProxy('https://notcorp.example/', list)).toBe(false)
  })

  it('treats *.domain as subdomains only', () => {
    expect(shouldBypassProxy('https://svc.internal/', list)).toBe(true)
    expect(shouldBypassProxy('https://internal/', list)).toBe(false)
  })

  it('matches IPv4 CIDR ranges and IPv6 literals', () => {
    expect(shouldBypassProxy('http://10.20.30.40/', list)).toBe(true)
    expect(shouldBypassProxy('http://11.0.0.1/', list)).toBe(false)
    expect(shouldBypassProxy('http://[::1]:8080/', list)).toBe(true)
  })

  it('honours ports in entries, including default ports', () => {
    expect(shouldBypassProxy('https://build.local:8443/', list)).toBe(true)
    expect(shouldBypassProxy('https://build.local/', list)).toBe(false)
    expect(shouldBypassProxy('https://example.com/', 'example.com:443')).toBe(true)
    expect(shouldBypassProxy('http://example.com/', 'example.com:443')).toBe(false)
  })

  it('supports * and <local>', () => {
    expect(shouldBypassProxy('https://anything.example/', '*')).toBe(true)
    expect(shouldBypassProxy('http://intranet/', '<local>')).toBe(true)
    expect(shouldBypassProxy('http://intranet.corp/', '<local>')).toBe(false)
  })

  it('accepts newline / semicolon separated lists', () => {
    expect(shouldBypassProxy('https://a.test/', 'b.test\na.test')).toBe(true)
    expect(shouldBypassProxy('https://a.test/', 'b.test;a.test')).toBe(true)
  })
})

describe('parsePacResult', () => {
  it('reads the first usable proxy', () => {
    expect(parsePacResult('PROXY proxy:8080; DIRECT')).toEqual({ proxyUrl: 'http://proxy:8080', unsupported: undefined })
    expect(parsePacResult('HTTPS secure:443')).toEqual({ proxyUrl: 'https://secure:443', unsupported: undefined })
    expect(parsePacResult('DIRECT').proxyUrl).toBeNull()
  })

  it('skips SOCKS and reports it', () => {
    expect(parsePacResult('SOCKS5 s:1080; PROXY p:3128')).toEqual({ proxyUrl: 'http://p:3128', unsupported: 'SOCKS5' })
    expect(parsePacResult('SOCKS5 s:1080')).toEqual({ proxyUrl: null, unsupported: 'SOCKS5' })
  })
})

describe('selectProxy', () => {
  it('goes direct when proxying is off', () => {
    expect(selectProxy('https://api.example.com', { ...manual(), mode: 'none' }).proxyUrl).toBeNull()
  })

  it('uses the HTTP proxy for both schemes when no HTTPS proxy is set', () => {
    expect(selectProxy('http://api.example.com', manual()).proxyUrl).toBe('http://proxy.corp:8080')
    expect(selectProxy('https://api.example.com', manual()).proxyUrl).toBe('http://proxy.corp:8080')
    expect(selectProxy('wss://api.example.com', manual()).proxyUrl).toBe('http://proxy.corp:8080')
  })

  it('prefers the HTTPS proxy for secure targets', () => {
    const settings = manual({ httpsProxy: 'https://tls-proxy:8443' })
    expect(selectProxy('https://api.example.com', settings).proxyUrl).toBe('https://tls-proxy:8443')
    expect(selectProxy('http://api.example.com', settings).proxyUrl).toBe('http://proxy.corp:8080')
  })

  it('bypasses matching hosts', () => {
    const selection = selectProxy('http://localhost:4000', manual({ bypass: 'localhost' }))
    expect(selection).toMatchObject({ proxyUrl: null, source: 'bypass' })
  })

  it('adds encoded credentials but keeps them out of the display URL', () => {
    const selection = selectProxy('https://api.example.com', manual({ authEnabled: true, username: 'me@corp' }), {
      password: 'p@ss:word'
    })
    expect(selection.proxyUrl).toBe('http://me%40corp:p%40ss%3Aword@proxy.corp:8080')
    expect(selection.displayUrl).toBe('http://proxy.corp:8080')
  })

  it('follows the system (PAC) answer in system mode', () => {
    const settings = { ...manual(), mode: 'system' as const }
    expect(selectProxy('https://a.test', settings, { systemResult: 'PROXY sys:3128' })).toMatchObject({
      proxyUrl: 'http://sys:3128',
      source: 'system'
    })
    expect(selectProxy('https://a.test', settings, { systemResult: 'DIRECT' }).proxyUrl).toBeNull()
  })
})
