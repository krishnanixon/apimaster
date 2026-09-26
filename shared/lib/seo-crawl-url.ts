/** Validate outbound http(s) URLs for agent browser tools and crawlers. */

const METADATA_HOSTS = new Set([
  'metadata.google.internal',
  'metadata.goog',
  '169.254.169.254',
  'fd00:ec2::254'
])

const LOOPBACK_HOSTS = new Set(['localhost', 'localhost.localdomain', '0.0.0.0'])

function isPrivateOrLocalHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '')
  if (LOOPBACK_HOSTS.has(h)) return true
  if (h === '::1' || h === '0:0:0:0:0:0:0:1') return true
  if (h.endsWith('.localhost') || h.endsWith('.local')) return true

  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h)
  if (ipv4) {
    const parts = ipv4.slice(1).map(Number)
    if (parts.some((n) => n > 255)) return true
    const [a, b] = parts
    if (a === 10 || a === 127 || a === 0) return true
    if (a === 169 && b === 254) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
    if (a === 100 && b >= 64 && b <= 127) return true // CGNAT
  }

  // Common IPv6 local/unique-local prefixes
  if (h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80:')) return true
  return false
}

export function assertSafeHttpUrl(raw: string, options?: { allowPrivateLan?: boolean }): URL {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new Error('Invalid URL')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Only HTTP and HTTPS URLs are allowed')
  }
  if (url.username || url.password) {
    throw new Error('URLs must not include credentials')
  }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (METADATA_HOSTS.has(host) || host.endsWith('.metadata.google.internal')) {
    throw new Error('Cloud metadata endpoints are blocked')
  }
  if (!options?.allowPrivateLan && isPrivateOrLocalHost(host)) {
    throw new Error('Private, loopback, and link-local hosts are blocked')
  }
  return url
}

/** @deprecated Prefer assertSafeHttpUrl — kept for SEO crawl call sites. */
export function assertSafeSeoCrawlUrl(startUrl: string): URL {
  // SEO live crawl intentionally allows localhost so users can audit local apps.
  return assertSafeHttpUrl(startUrl, { allowPrivateLan: true })
}
