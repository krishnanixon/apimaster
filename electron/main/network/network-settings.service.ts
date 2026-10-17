/**
 * Global network settings (proxy, TLS, cookies) in `data/network.json`.
 * Secrets go through ApiKeyService (OS safeStorage) and never touch the JSON file.
 */
import {
  DEFAULT_NETWORK_SETTINGS,
  type ClientCertificate,
  type NetworkSecretsPatch,
  type NetworkSettings,
  type NetworkSettingsPatch,
  type NetworkSettingsView,
  type ProxyMode
} from '@shared/types/network'
import { readJsonFile, writeJsonFile } from '../infra/json-store'
import { apiKeyService } from '../infra/api-key.service'

const FILE = 'network.json'
const PROXY_PASSWORD_SECRET = 'network-proxy-password'
const certSecretName = (id: string) => `network-cert-${id}`

type Listener = () => void

const str = (value: unknown, fallback = ''): string => (typeof value === 'string' ? value : fallback)
const bool = (value: unknown, fallback: boolean): boolean => (typeof value === 'boolean' ? value : fallback)

function sanitizeCertificate(value: unknown): ClientCertificate | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  const id = str(raw.id)
  if (!/^[a-z0-9-]{1,64}$/i.test(id)) return null
  return {
    id,
    host: str(raw.host).trim(),
    kind: raw.kind === 'pfx' ? 'pfx' : 'pem',
    certPath: str(raw.certPath) || undefined,
    keyPath: str(raw.keyPath) || undefined,
    pfxPath: str(raw.pfxPath) || undefined,
    enabled: bool(raw.enabled, true)
  }
}

export function sanitizeNetworkSettings(value: unknown): NetworkSettings {
  const d = DEFAULT_NETWORK_SETTINGS
  const raw = (value && typeof value === 'object' ? value : {}) as Record<string, Record<string, unknown> | undefined>
  const proxy = raw.proxy ?? {}
  const tls = raw.tls ?? {}
  const cookies = raw.cookies ?? {}
  const mode = proxy.mode
  return {
    proxy: {
      mode: (mode === 'system' || mode === 'manual' || mode === 'none' ? mode : d.proxy.mode) as ProxyMode,
      httpProxy: str(proxy.httpProxy, d.proxy.httpProxy).trim(),
      httpsProxy: str(proxy.httpsProxy, d.proxy.httpsProxy).trim(),
      bypass: str(proxy.bypass, d.proxy.bypass),
      authEnabled: bool(proxy.authEnabled, d.proxy.authEnabled),
      username: str(proxy.username, d.proxy.username)
    },
    tls: {
      verifySsl: bool(tls.verifySsl, d.tls.verifySsl),
      useSystemCa: bool(tls.useSystemCa, d.tls.useSystemCa),
      caCertPaths: Array.isArray(tls.caCertPaths)
        ? tls.caCertPaths.filter((p): p is string => typeof p === 'string' && p.trim() !== '').slice(0, 50)
        : [],
      clientCertificates: Array.isArray(tls.clientCertificates)
        ? tls.clientCertificates.map(sanitizeCertificate).filter((c): c is ClientCertificate => c !== null).slice(0, 100)
        : []
    },
    cookies: { enabled: bool(cookies.enabled, d.cookies.enabled) }
  }
}

class NetworkSettingsService {
  private cache: NetworkSettings | null = null
  private listeners = new Set<Listener>()

  get(): NetworkSettings {
    if (!this.cache) this.cache = sanitizeNetworkSettings(readJsonFile<unknown>(FILE, DEFAULT_NETWORK_SETTINGS))
    return this.cache
  }

  view(): NetworkSettingsView {
    const settings = this.get()
    return {
      ...settings,
      secrets: {
        proxyPassword: apiKeyService.hasNamedSecret(PROXY_PASSWORD_SECRET),
        certificatePassphrases: settings.tls.clientCertificates
          .filter((cert) => apiKeyService.hasNamedSecret(certSecretName(cert.id)))
          .map((cert) => cert.id),
        encryptionAvailable: apiKeyService.isEncryptionAvailable()
      }
    }
  }

  update(patch: NetworkSettingsPatch): NetworkSettingsView {
    const current = this.get()
    const next = sanitizeNetworkSettings({
      proxy: { ...current.proxy, ...patch.proxy },
      tls: { ...current.tls, ...patch.tls },
      cookies: { ...current.cookies, ...patch.cookies }
    })
    // Drop passphrases of certificates that were removed.
    const kept = new Set(next.tls.clientCertificates.map((cert) => cert.id))
    for (const cert of current.tls.clientCertificates) {
      if (!kept.has(cert.id)) apiKeyService.deleteNamedSecret(certSecretName(cert.id))
    }
    writeJsonFile(FILE, next)
    this.cache = next
    this.emit()
    return this.view()
  }

  updateSecrets(patch: NetworkSecretsPatch): NetworkSettingsView {
    if (patch.proxyPassword !== undefined) {
      if (patch.proxyPassword) apiKeyService.setNamedSecret(PROXY_PASSWORD_SECRET, patch.proxyPassword)
      else apiKeyService.deleteNamedSecret(PROXY_PASSWORD_SECRET)
    }
    const known = new Set(this.get().tls.clientCertificates.map((cert) => cert.id))
    for (const [id, value] of Object.entries(patch.certificatePassphrases ?? {})) {
      if (!known.has(id)) continue
      if (value) apiKeyService.setNamedSecret(certSecretName(id), value)
      else apiKeyService.deleteNamedSecret(certSecretName(id))
    }
    this.emit()
    return this.view()
  }

  getProxyPassword(): string | null {
    return apiKeyService.getNamedSecret(PROXY_PASSWORD_SECRET)
  }

  getCertificatePassphrase(id: string): string | null {
    return apiKeyService.getNamedSecret(certSecretName(id))
  }

  /** Called whenever settings or secrets change (agents are rebuilt). */
  onChange(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emit(): void {
    for (const listener of this.listeners) listener()
  }
}

export const networkSettingsService = new NetworkSettingsService()
