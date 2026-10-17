import { describe, expect, it } from 'vitest'
import {
  buildTlsOptions,
  findClientCertificate,
  matchesHostPattern,
  type TlsBuildDeps
} from '../electron/main/network/tls-options'
import { classifyNetworkError, isCertificateVerificationError } from '@shared/lib/network/errors'
import { DEFAULT_NETWORK_SETTINGS, type ClientCertificate, type TlsSettings } from '@shared/types/network'

const files: Record<string, string> = {
  '/ca/corp.pem': 'CORP-CA',
  '/certs/client.pem': 'CLIENT-CERT',
  '/certs/client.key': 'CLIENT-KEY',
  '/certs/client.pfx': 'PFX-BYTES'
}

const deps: TlsBuildDeps = {
  readFile: async (path) => {
    if (!(path in files)) throw new Error('ENOENT: no such file')
    return Buffer.from(files[path])
  },
  getPassphrase: (id) => (id === 'pfx-cert' ? 'secret' : null),
  defaultCas: (useSystem) => (useSystem ? ['ROOT', 'SYSTEM'] : ['ROOT'])
}

const tls = (patch: Partial<TlsSettings> = {}): TlsSettings => ({ ...DEFAULT_NETWORK_SETTINGS.tls, useSystemCa: false, ...patch })

const pem: ClientCertificate = {
  id: 'pem-cert',
  host: 'api.example.com',
  kind: 'pem',
  certPath: '/certs/client.pem',
  keyPath: '/certs/client.key',
  enabled: true
}
const pfx: ClientCertificate = { id: 'pfx-cert', host: '*.corp.local:8443', kind: 'pfx', pfxPath: '/certs/client.pfx', enabled: true }

describe('matchesHostPattern', () => {
  it('matches exact hosts, wildcards and optional ports', () => {
    expect(matchesHostPattern('api.example.com', 'api.example.com', 443)).toBe(true)
    expect(matchesHostPattern('API.example.com', 'api.example.com', 8443)).toBe(true)
    expect(matchesHostPattern('api.example.com:8443', 'api.example.com', 443)).toBe(false)
    expect(matchesHostPattern('*.corp.local', 'svc.corp.local', 443)).toBe(true)
    expect(matchesHostPattern('*.corp.local', 'corp.local', 443)).toBe(false)
    expect(matchesHostPattern('https://api.example.com:443/path', 'api.example.com', 443)).toBe(true)
  })
})

describe('findClientCertificate', () => {
  it('picks the first enabled certificate for the host and port', () => {
    expect(findClientCertificate([pem, pfx], new URL('https://api.example.com/v1'))?.id).toBe('pem-cert')
    expect(findClientCertificate([pem, pfx], new URL('wss://svc.corp.local:8443'))?.id).toBe('pfx-cert')
    expect(findClientCertificate([pem, pfx], new URL('https://svc.corp.local'))).toBeUndefined()
    expect(findClientCertificate([{ ...pem, enabled: false }], new URL('https://api.example.com'))).toBeUndefined()
  })
})

describe('buildTlsOptions', () => {
  it('verifies by default and lets a request turn verification off', async () => {
    expect((await buildTlsOptions('https://a.test', tls(), undefined, deps)).rejectUnauthorized).toBe(true)
    expect((await buildTlsOptions('https://a.test', tls(), { verifySsl: false }, deps)).rejectUnauthorized).toBe(false)
    expect((await buildTlsOptions('https://a.test', tls({ verifySsl: false }), undefined, deps)).rejectUnauthorized).toBe(false)
    expect((await buildTlsOptions('https://a.test', tls({ verifySsl: false }), { verifySsl: true }, deps)).rejectUnauthorized).toBe(true)
  })

  it('leaves Node defaults alone when no extra CAs are configured', async () => {
    expect((await buildTlsOptions('https://a.test', tls(), undefined, deps)).ca).toBeUndefined()
  })

  it('adds custom CAs on top of the default and system roots', async () => {
    const built = await buildTlsOptions('https://a.test', tls({ caCertPaths: ['/ca/corp.pem'], useSystemCa: true }), undefined, deps)
    expect(built.ca?.map(String)).toEqual(['ROOT', 'SYSTEM', 'CORP-CA'])
  })

  it('attaches a PEM client certificate for a matching host only', async () => {
    const built = await buildTlsOptions('https://api.example.com', tls({ clientCertificates: [pem] }), undefined, deps)
    expect(String(built.cert)).toBe('CLIENT-CERT')
    expect(String(built.key)).toBe('CLIENT-KEY')
    expect(built.passphrase).toBeUndefined()
    expect(built.clientCertificateId).toBe('pem-cert')

    const other = await buildTlsOptions('https://other.example.com', tls({ clientCertificates: [pem] }), undefined, deps)
    expect(other.cert).toBeUndefined()
  })

  it('attaches a PFX with its stored passphrase', async () => {
    const built = await buildTlsOptions('https://svc.corp.local:8443', tls({ clientCertificates: [pfx] }), undefined, deps)
    expect(String(built.pfx)).toBe('PFX-BYTES')
    expect(built.passphrase).toBe('secret')
  })

  it('reports unreadable certificate files clearly', async () => {
    await expect(buildTlsOptions('https://a.test', tls({ caCertPaths: ['/missing.pem'] }), undefined, deps)).rejects.toThrow(
      /Could not read CA certificate \/missing\.pem/
    )
    await expect(
      buildTlsOptions('https://api.example.com', tls({ clientCertificates: [{ ...pem, keyPath: undefined }] }), undefined, deps)
    ).rejects.toThrow(/missing its key file/)
  })
})

describe('classifyNetworkError', () => {
  it('explains certificate failures', () => {
    const info = classifyNetworkError({ code: 'DEPTH_ZERO_SELF_SIGNED_CERT', message: 'self-signed certificate' })
    expect(info).toMatchObject({ kind: 'tls', code: 'DEPTH_ZERO_SELF_SIGNED_CERT' })
    expect(isCertificateVerificationError(info)).toBe(true)
    expect(classifyNetworkError({ code: 'ERR_TLS_CERT_ALTNAME_INVALID' })?.title).toMatch(/host name/)
  })

  it('reads codes from a nested cause', () => {
    expect(classifyNetworkError({ message: 'x', cause: { code: 'CERT_HAS_EXPIRED' } })?.kind).toBe('tls')
  })

  it('blames the proxy when the proxy is unreachable', () => {
    expect(classifyNetworkError({ code: 'ECONNREFUSED' }, { proxy: 'http://proxy:8080' })).toMatchObject({ kind: 'proxy' })
    expect(classifyNetworkError({ code: 'ECONNREFUSED' })).toMatchObject({ kind: 'connection' })
    expect(classifyNetworkError({ code: 'ENOTFOUND' })).toMatchObject({ kind: 'dns' })
  })

  it('returns nothing for unknown errors', () => {
    expect(classifyNetworkError(new Error('boom'))).toBeUndefined()
    expect(isCertificateVerificationError(classifyNetworkError({ code: 'ECONNRESET' }))).toBe(false)
  })
})
