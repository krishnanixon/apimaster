import type { SshKeyFormat } from '../types/vps'

export interface ParsedVpsTarget {
  host: string
  port?: number
  username?: string
}

/**
 * Parse a VPS target from common SSH forms:
 * `user@host`, `user@host:22`, `ssh://user@host:22`, `[ipv6]:22`.
 */
export function parseVpsTarget(raw: string): ParsedVpsTarget | null {
  const value = raw.trim()
  if (!value) return null

  if (/^ssh:\/\//i.test(value)) {
    try {
      const url = new URL(value)
      if (!url.hostname) return null
      return {
        host: url.hostname,
        port: url.port ? Number(url.port) : undefined,
        username: url.username ? decodeURIComponent(url.username) : undefined
      }
    } catch {
      return null
    }
  }

  const userIpv6 = value.match(/^([^@[\]]+)@\[([^\]]+)\](?::(\d{1,5}))?$/)
  if (userIpv6) {
    return withPort(
      { host: userIpv6[2], username: userIpv6[1] },
      userIpv6[3]
    )
  }

  const ipv6 = value.match(/^\[([^\]]+)\](?::(\d{1,5}))?$/)
  if (ipv6) {
    return withPort({ host: ipv6[1] }, ipv6[2])
  }

  const at = value.lastIndexOf('@')
  if (at > 0) {
    const username = value.slice(0, at)
    const rest = value.slice(at + 1)
    if (!username || !rest) return null
    const hostPort = splitHostPort(rest)
    return { ...hostPort, username }
  }

  return splitHostPort(value)
}

function withPort(
  base: ParsedVpsTarget,
  portStr?: string
): ParsedVpsTarget | null {
  if (!portStr) return base
  const port = Number(portStr)
  if (!isValidPort(port)) return null
  return { ...base, port }
}

function splitHostPort(value: string): ParsedVpsTarget {
  if (value.includes('::')) return { host: value }
  const colon = value.lastIndexOf(':')
  if (colon > 0 && value.indexOf(':') === colon) {
    const host = value.slice(0, colon)
    const port = Number(value.slice(colon + 1))
    if (host && isValidPort(port)) return { host, port }
  }
  return { host: value }
}

function isValidPort(port: number): boolean {
  return Number.isInteger(port) && port > 0 && port <= 65535
}

/** True when the host field looks like a full SSH target rather than a hostname. */
export function looksLikeVpsTarget(raw: string): boolean {
  const value = raw.trim()
  if (!value) return false
  return /^ssh:\/\//i.test(value) || value.includes('@') || /^\[[^\]]+\]:\d+$/.test(value)
}

export function detectSshKeyFormat(content: string): SshKeyFormat {
  const text = stripBom(content).trim()
  if (!text) return 'unknown'
  if (/^-----BEGIN OPENSSH PRIVATE KEY-----/m.test(text)) return 'openssh'
  if (/^PuTTY-User-Key-File-[23]:/m.test(text)) return 'ppk'
  if (/^-----BEGIN ENCRYPTED PRIVATE KEY-----/m.test(text)) return 'pkcs8'
  if (/^-----BEGIN PRIVATE KEY-----/m.test(text)) return 'pkcs8'
  if (
    /^-----BEGIN (RSA|EC|DSA|OPENSSH) PRIVATE KEY-----/m.test(text) ||
    /^-----BEGIN RSA PRIVATE KEY-----/m.test(text)
  ) {
    return 'pem'
  }
  if (
    /^-----BEGIN PUBLIC KEY-----/m.test(text) ||
    /^-----BEGIN (RSA|EC|DSA) PUBLIC KEY-----/m.test(text) ||
    /^(ssh-(rsa|ed25519|dss)|ecdsa-sha2-nistp\d+)\s+/.test(text)
  ) {
    return 'public'
  }
  return 'unknown'
}

export function sshKeyFormatLabel(format: SshKeyFormat): string {
  switch (format) {
    case 'pem':
      return 'PEM'
    case 'openssh':
      return 'OpenSSH'
    case 'pkcs8':
      return 'PKCS#8'
    case 'ppk':
      return 'PuTTY'
    case 'public':
      return 'Public key'
    default:
      return 'Unknown'
  }
}

export function sshKeyTypeLabel(keyType?: string): string {
  if (!keyType) return ''
  if (keyType === 'ssh-rsa') return 'RSA'
  if (keyType === 'ssh-ed25519') return 'ED25519'
  if (keyType === 'ssh-dss') return 'DSA'
  if (keyType.startsWith('ecdsa-')) return 'ECDSA'
  return keyType
}

export function stripBom(content: string): string {
  return content.replace(/^\uFEFF/, '')
}

export const SSH_KEY_FILE_EXTENSIONS = ['pem', 'key', 'ppk', 'openssh', 'rsa', 'ed25519'] as const

export function isLikelySshKeyFileName(name: string): boolean {
  const lower = name.toLowerCase()
  if (SSH_KEY_FILE_EXTENSIONS.some((ext) => lower.endsWith(`.${ext}`))) return true
  return /^(id_rsa|id_ed25519|id_ecdsa|id_dsa|id_ecdsa_sk|id_ed25519_sk)(\.pub)?$/i.test(name)
}
