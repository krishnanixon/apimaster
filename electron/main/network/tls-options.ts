/**
 * Builds Node TLS options (verification, extra CAs, client certificates) for one target.
 * File reads are injected so the logic is unit-testable without touching disk.
 */
import tls from 'node:tls'
import type { ClientCertificate, RequestNetworkOptions, TlsSettings } from '@shared/types/network'

export interface BuiltTlsOptions {
  rejectUnauthorized: boolean
  ca?: Array<string | Buffer>
  cert?: Buffer
  key?: Buffer
  pfx?: Buffer
  passphrase?: string
  /** Client certificate that matched the host, if any. */
  clientCertificateId?: string
}

export interface TlsBuildDeps {
  readFile: (path: string) => Promise<Buffer>
  /** Passphrase stored for a client certificate id. */
  getPassphrase: (certificateId: string) => string | null
  /** Built-in roots plus (optionally) the OS store; injected for tests. */
  defaultCas?: (useSystem: boolean) => string[]
}

let cachedCas: { system: boolean; list: string[] } | null = null

/** Node's bundled roots, plus the OS trust store when asked and supported (Node ≥ 22.15). */
export function defaultCertificateAuthorities(useSystem: boolean): string[] {
  if (cachedCas?.system === useSystem) return cachedCas.list
  const getCa = (tls as unknown as { getCACertificates?: (type: string) => string[] }).getCACertificates
  let list: string[] = [...tls.rootCertificates]
  if (useSystem && typeof getCa === 'function') {
    try {
      list = [...new Set([...getCa('default'), ...getCa('system')])]
    } catch {
      // Older runtimes: fall back to the bundled roots.
    }
  }
  cachedCas = { system: useSystem, list }
  return list
}

/** `api.example.com`, `*.example.com`, `https://host:8443` — port optional (any port when omitted). */
export function matchesHostPattern(pattern: string, hostname: string, port: number): boolean {
  let value = pattern.trim().toLowerCase()
  if (!value) return false
  value = value.replace(/^[a-z][a-z0-9+.-]*:\/\//, '').replace(/\/.*$/, '')
  let patternPort: number | undefined
  const portMatch = /^(.*?):(\d+)$/.exec(value)
  if (portMatch && !portMatch[1].includes(':')) {
    value = portMatch[1]
    patternPort = Number(portMatch[2])
  }
  if (patternPort !== undefined && patternPort !== port) return false
  const host = hostname.toLowerCase()
  if (value.startsWith('*.')) return host.endsWith(value.slice(1))
  return host === value
}

export function findClientCertificate(
  certificates: ClientCertificate[],
  url: URL
): ClientCertificate | undefined {
  const port = url.port ? Number(url.port) : url.protocol === 'https:' || url.protocol === 'wss:' ? 443 : 80
  const host = url.hostname.replace(/^\[|\]$/g, '')
  return certificates.find((cert) => cert.enabled && matchesHostPattern(cert.host, host, port))
}

export async function buildTlsOptions(
  target: string | URL,
  settings: TlsSettings,
  overrides: RequestNetworkOptions | undefined,
  deps: TlsBuildDeps
): Promise<BuiltTlsOptions> {
  const url = typeof target === 'string' ? new URL(target) : target
  const options: BuiltTlsOptions = {
    rejectUnauthorized: overrides?.verifySsl ?? settings.verifySsl
  }

  const extraCas: Buffer[] = []
  for (const path of settings.caCertPaths) {
    if (!path.trim()) continue
    try {
      extraCas.push(await deps.readFile(path))
    } catch (error) {
      throw new Error(`Could not read CA certificate ${path}: ${error instanceof Error ? error.message : error}`)
    }
  }
  if (extraCas.length || settings.useSystemCa) {
    // Passing `ca` replaces Node's defaults, so start from them.
    const defaults = (deps.defaultCas ?? defaultCertificateAuthorities)(settings.useSystemCa)
    options.ca = [...defaults, ...extraCas]
  }

  const cert = findClientCertificate(settings.clientCertificates, url)
  if (cert) {
    const read = async (label: string, path?: string): Promise<Buffer> => {
      if (!path) throw new Error(`Client certificate for ${cert.host} is missing its ${label} file`)
      try {
        return await deps.readFile(path)
      } catch (error) {
        throw new Error(`Could not read ${label} file ${path}: ${error instanceof Error ? error.message : error}`)
      }
    }
    if (cert.kind === 'pfx') {
      options.pfx = await read('PFX', cert.pfxPath)
    } else {
      options.cert = await read('certificate', cert.certPath)
      options.key = await read('key', cert.keyPath)
    }
    const passphrase = deps.getPassphrase(cert.id)
    if (passphrase) options.passphrase = passphrase
    options.clientCertificateId = cert.id
  }

  return options
}
