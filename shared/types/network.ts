/**
 * Network settings shared by the request engine (HTTP + WebSocket) in the main process
 * and the Settings UI. Secrets (proxy password, certificate passphrases) are never part
 * of these objects: they live in OS-encrypted storage and only their presence is reported.
 */

export type ProxyMode = 'none' | 'system' | 'manual'

export interface ProxySettings {
  mode: ProxyMode
  /** Proxy for `http://` targets, e.g. `http://proxy.corp:8080` or `proxy.corp:8080`. */
  httpProxy: string
  /** Proxy for `https://` / `wss://` targets. Empty means "use the HTTP proxy". */
  httpsProxy: string
  /** NO_PROXY-style list: `localhost, .corp.example, 10.0.0.0/8, *.internal:8443`. */
  bypass: string
  authEnabled: boolean
  username: string
}

export interface ClientCertificate {
  id: string
  /** `api.example.com`, `*.example.com`, optionally with `:port`. */
  host: string
  kind: 'pem' | 'pfx'
  certPath?: string
  keyPath?: string
  pfxPath?: string
  enabled: boolean
}

export interface TlsSettings {
  /** Verify server certificates (default on). Requests can override this. */
  verifySsl: boolean
  /** Also trust certificates from the operating system's store (corporate roots). */
  useSystemCa: boolean
  /** Extra PEM CA bundles trusted in addition to the built-in roots. */
  caCertPaths: string[]
  clientCertificates: ClientCertificate[]
}

export interface CookieSettings {
  /** Store Set-Cookie responses and send matching cookies automatically. */
  enabled: boolean
}

export interface NetworkSettings {
  proxy: ProxySettings
  tls: TlsSettings
  cookies: CookieSettings
}

/** What the renderer sees: settings plus which secrets are stored. */
export interface NetworkSettingsView extends NetworkSettings {
  secrets: {
    proxyPassword: boolean
    /** Client certificate ids that have a stored passphrase. */
    certificatePassphrases: string[]
    encryptionAvailable: boolean
  }
}

export interface NetworkSettingsPatch {
  proxy?: Partial<ProxySettings>
  tls?: Partial<Omit<TlsSettings, 'clientCertificates'>> & { clientCertificates?: ClientCertificate[] }
  cookies?: Partial<CookieSettings>
}

/** Secret writes: a string stores it, `null` deletes it, omitted leaves it alone. */
export interface NetworkSecretsPatch {
  proxyPassword?: string | null
  certificatePassphrases?: Record<string, string | null>
}

/** Per-request overrides, kept on the request (Settings tab). */
export interface RequestNetworkOptions {
  /** `undefined` follows the global "verify SSL certificates" setting. */
  verifySsl?: boolean
  /** Don't attach jar cookies to this request (Set-Cookie responses are still stored). */
  disableCookies?: boolean
}

export interface StoredCookie {
  name: string
  value: string
  domain: string
  path: string
  /** ISO date; `null` for a session cookie. */
  expires: string | null
  httpOnly: boolean
  secure: boolean
  sameSite?: 'strict' | 'lax' | 'none'
  /** True when the cookie only matches its exact domain (no Domain attribute). */
  hostOnly: boolean
}

export interface CookieDeleteInput {
  domain: string
  path?: string
  name?: string
}

/** Why a request failed, so the response view can explain it. */
export type NetworkErrorKind = 'tls' | 'proxy' | 'dns' | 'connection' | 'timeout'

export interface NetworkErrorInfo {
  kind: NetworkErrorKind
  /** Node / OpenSSL code, e.g. `CERT_HAS_EXPIRED`. */
  code?: string
  title: string
  hint?: string
}

export interface WebSocketConnectInput {
  connectionId: string
  url: string
  headers: Record<string, string>
  params: Record<string, string>
  timeoutMs?: number
  network?: RequestNetworkOptions
}

export type WebSocketEvent =
  | { connectionId: string; type: 'open'; protocol?: string }
  | { connectionId: string; type: 'message'; data: string; binary: boolean }
  | { connectionId: string; type: 'error'; message: string; networkError?: NetworkErrorInfo; status?: number }
  | { connectionId: string; type: 'close'; code: number; reason: string }

export const DEFAULT_NETWORK_SETTINGS: NetworkSettings = {
  proxy: { mode: 'none', httpProxy: '', httpsProxy: '', bypass: 'localhost, 127.0.0.1, ::1', authEnabled: false, username: '' },
  tls: { verifySsl: true, useSystemCa: true, caCertPaths: [], clientCertificates: [] },
  cookies: { enabled: true }
}
