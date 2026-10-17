/**
 * Turns Node / OpenSSL error codes into something the response view can explain.
 */
import type { NetworkErrorInfo } from '../../types/network'

const TLS_HINT_VERIFY = 'Add the issuing CA under Settings → Network → CA certificates, or turn off SSL verification for this request.'

const TLS_CODES: Record<string, { title: string; hint?: string }> = {
  CERT_HAS_EXPIRED: { title: 'The server certificate has expired', hint: 'Renew the certificate, or turn off SSL verification for this request.' },
  CERT_NOT_YET_VALID: { title: 'The server certificate is not valid yet', hint: 'Check the system clock, or turn off SSL verification for this request.' },
  DEPTH_ZERO_SELF_SIGNED_CERT: { title: 'The server uses a self-signed certificate', hint: TLS_HINT_VERIFY },
  SELF_SIGNED_CERT_IN_CHAIN: { title: 'The certificate chain contains a self-signed certificate', hint: TLS_HINT_VERIFY },
  UNABLE_TO_VERIFY_LEAF_SIGNATURE: { title: 'Unable to verify the server certificate', hint: TLS_HINT_VERIFY },
  UNABLE_TO_GET_ISSUER_CERT: { title: 'The certificate issuer is unknown', hint: TLS_HINT_VERIFY },
  UNABLE_TO_GET_ISSUER_CERT_LOCALLY: { title: 'The certificate issuer is not trusted on this machine', hint: TLS_HINT_VERIFY },
  CERT_UNTRUSTED: { title: 'The server certificate is not trusted', hint: TLS_HINT_VERIFY },
  CERT_REVOKED: { title: 'The server certificate has been revoked' },
  CERT_SIGNATURE_FAILURE: { title: 'The server certificate signature is invalid' },
  ERR_TLS_CERT_ALTNAME_INVALID: { title: "The certificate doesn't match this host name", hint: 'Check the URL host, or turn off SSL verification for this request.' },
  ERR_SSL_WRONG_VERSION_NUMBER: { title: 'The server did not answer with TLS', hint: 'The port may speak plain HTTP — try http:// instead of https://.' },
  ERR_SSL_TLSV13_ALERT_CERTIFICATE_REQUIRED: { title: 'The server requires a client certificate', hint: 'Add one for this host under Settings → Network → Client certificates.' },
  ERR_SSL_SSLV3_ALERT_HANDSHAKE_FAILURE: { title: 'The TLS handshake failed', hint: 'The server may require a client certificate or a newer TLS version.' },
  ERR_SSL_SSLV3_ALERT_BAD_CERTIFICATE: { title: 'The server rejected the client certificate' },
  ERR_SSL_TLSV1_ALERT_UNKNOWN_CA: { title: "The server doesn't trust the client certificate's CA" },
  ERR_OSSL_BAD_DECRYPT: { title: 'Could not decrypt the client certificate key', hint: 'Check the passphrase stored for this certificate.' },
  ERR_OSSL_PEM_NO_START_LINE: { title: 'A certificate or key file is not valid PEM' },
  ERR_OSSL_PKCS12_MAC_VERIFY_FAILURE: { title: 'Could not open the PFX file', hint: 'Check the passphrase stored for this certificate.' }
}

export interface ClassifyContext {
  /** Proxy the request went through (without credentials), if any. */
  proxy?: string | null
}

interface ErrorLike {
  code?: unknown
  message?: unknown
  cause?: unknown
}

function readCode(error: ErrorLike): string | undefined {
  if (typeof error.code === 'string' && error.code) return error.code
  if (error.cause && typeof error.cause === 'object') return readCode(error.cause as ErrorLike)
  return undefined
}

export function classifyNetworkError(error: unknown, context: ClassifyContext = {}): NetworkErrorInfo | undefined {
  if (!error || typeof error !== 'object') return undefined
  const err = error as ErrorLike
  const code = readCode(err)
  const message = typeof err.message === 'string' ? err.message : ''

  if (code && TLS_CODES[code]) return { kind: 'tls', code, ...TLS_CODES[code] }
  if (code?.startsWith('ERR_SSL_') || code?.startsWith('ERR_OSSL_') || (code === 'EPROTO' && /ssl|tls/i.test(message))) {
    return { kind: 'tls', code, title: 'The TLS connection failed', hint: message || undefined }
  }
  if (/mac verify failure/i.test(message)) {
    return { kind: 'tls', code, title: 'Could not open the PFX file', hint: 'Check the passphrase stored for this certificate.' }
  }

  const viaProxy = context.proxy
  if (viaProxy && (code === 'ECONNREFUSED' || code === 'ENOTFOUND' || code === 'EAI_AGAIN' || code === 'EHOSTUNREACH')) {
    return { kind: 'proxy', code, title: `Could not reach the proxy ${viaProxy}`, hint: 'Check the proxy under Settings → Network.' }
  }
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
    return { kind: 'dns', code, title: 'The host name could not be resolved', hint: 'Check the URL and your network connection.' }
  }
  if (code === 'ECONNREFUSED') return { kind: 'connection', code, title: 'The connection was refused', hint: 'Nothing is listening on that host and port.' }
  if (code === 'ECONNRESET') return { kind: 'connection', code, title: 'The connection was reset by the server or a proxy' }
  if (code === 'EHOSTUNREACH' || code === 'ENETUNREACH') return { kind: 'connection', code, title: 'The host is unreachable' }
  if (code === 'ECONNABORTED' || code === 'ETIMEDOUT' || /timeout/i.test(message)) {
    return { kind: 'timeout', code, title: 'The request timed out' }
  }
  return undefined
}

const VERIFICATION_CODES = new Set([
  'CERT_HAS_EXPIRED',
  'CERT_NOT_YET_VALID',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'UNABLE_TO_GET_ISSUER_CERT',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'CERT_UNTRUSTED',
  'ERR_TLS_CERT_ALTNAME_INVALID'
])

/** True when turning off certificate verification would let the request through. */
export function isCertificateVerificationError(info: NetworkErrorInfo | undefined): boolean {
  return info?.kind === 'tls' && info.code !== undefined && VERIFICATION_CODES.has(info.code)
}
