import { basename } from 'path'
import { readFileSync } from 'fs'
import { utils } from 'ssh2'
import type { SshAgentKind, VPSKeyInspectResult, VPSPickedKey, VPSServerInput } from '@shared/types/vps'
import { detectSshKeyFormat, stripBom } from '@shared/lib/vps-connection'
import type { ConnectCredentials } from '@vps/core/ConnectionManager'

interface ParsedSshKey {
  type?: string
  comment?: string
}

function asParsedKey(value: unknown): ParsedSshKey | Error | null {
  if (!value) return null
  if (value instanceof Error) return value
  if (Array.isArray(value)) {
    const first = value.find((item) => item && !(item instanceof Error))
    return first ? (first as ParsedSshKey) : (value[0] instanceof Error ? value[0] : null)
  }
  return value as ParsedSshKey
}

export function inspectSshKey(content: string, passphrase?: string, fileName?: string): VPSKeyInspectResult {
  const text = stripBom(content).replace(/\r\n/g, '\n').trim()
  const format = detectSshKeyFormat(text)
  const base: VPSKeyInspectResult = {
    format,
    encrypted: false,
    fileName,
    valid: false
  }

  if (!text) {
    return { ...base, error: 'Key file is empty' }
  }
  if (format === 'public') {
    return {
      ...base,
      error: 'This looks like a public key. Use the private key (.pem, id_rsa, id_ed25519, or .ppk) instead.'
    }
  }

  let parsed: ParsedSshKey | Error | null
  try {
    parsed = asParsedKey(utils.parseKey(text, passphrase || undefined))
  } catch (err) {
    return {
      ...base,
      error: err instanceof Error ? err.message : 'Unsupported key format'
    }
  }
  if (parsed instanceof Error) {
    const message = parsed.message || 'Unsupported key format'
    const encrypted = /passphrase/i.test(message)
    return {
      ...base,
      encrypted,
      error: encrypted
        ? passphrase
          ? 'Wrong passphrase for this private key'
          : 'This private key is encrypted. Enter the passphrase.'
        : message
    }
  }
  if (!parsed) {
    return { ...base, error: 'Unsupported key format. Add a PEM, OpenSSH, PKCS#8, or PuTTY (.ppk) private key.' }
  }

  return {
    format: format === 'unknown' ? 'pem' : format,
    keyType: parsed.type,
    encrypted: Boolean(passphrase),
    comment: parsed.comment,
    fileName,
    valid: true
  }
}

export function readAndInspectKeyFile(filePath: string, passphrase?: string): VPSPickedKey {
  const privateKey = readFileSync(filePath, 'utf8')
  const fileName = basename(filePath)
  const inspected = inspectSshKey(privateKey, passphrase, fileName)
  return { ...inspected, privateKey }
}

export function resolveSshAgentSocket(kind?: SshAgentKind): string {
  if (kind === 'pageant') {
    if (process.platform === 'win32') return 'pageant'
    throw new Error('Pageant is only available on Windows. Use OpenSSH agent or add a PEM/key file.')
  }
  if (process.env.SSH_AUTH_SOCK) return process.env.SSH_AUTH_SOCK
  if (process.platform === 'win32') return '\\\\.\\pipe\\openssh-ssh-agent'
  throw new Error(
    'SSH agent is not running. Start ssh-agent (or set SSH_AUTH_SOCK), or add a PEM/key file instead.'
  )
}

export function credentialsFromInput(input: VPSServerInput): ConnectCredentials {
  const host = input.host.trim()
  const username = input.username.trim()
  if (!host) throw new Error('Host is required')
  if (!username) throw new Error('Username is required')
  if (!input.port || input.port < 1 || input.port > 65535) throw new Error('Port must be between 1 and 65535')

  if (input.authType === 'agent') {
    return {
      host,
      port: input.port,
      username,
      agent: resolveSshAgentSocket(input.agentKind)
    }
  }

  let sshKey = input.sshKey
  if (!sshKey && input.sshKeyPath) {
    sshKey = readFileSync(input.sshKeyPath, 'utf8')
  }

  if (input.authType === 'sshKey') {
    if (!sshKey?.trim()) throw new Error('A PEM or SSH private key is required')
    const inspected = inspectSshKey(sshKey, input.passphrase, input.keyFileName)
    if (!inspected.valid) throw new Error(inspected.error ?? 'Invalid SSH private key')
    return {
      host,
      port: input.port,
      username,
      privateKey: stripBom(sshKey).replace(/\r\n/g, '\n').trim(),
      passphrase: input.passphrase
    }
  }

  if (!input.password) throw new Error('Password is required')
  return {
    host,
    port: input.port,
    username,
    password: input.password
  }
}

export function hydrateKeyFromPath(input: Partial<VPSServerInput>): Partial<VPSServerInput> {
  if (input.sshKey || !input.sshKeyPath) {
    const rest = { ...input }
    delete rest.sshKeyPath
    return rest
  }
  const sshKey = stripBom(readFileSync(input.sshKeyPath, 'utf8')).replace(/\r\n/g, '\n').trim()
  return {
    ...input,
    sshKey,
    keyFileName: input.keyFileName || basename(input.sshKeyPath),
    sshKeyPath: undefined
  }
}

export function normalizeServerInput(input: VPSServerInput): VPSServerInput {
  if (!input.name?.trim() || !input.host?.trim() || !input.username?.trim()) throw new Error('Name, host and username are required')
  if (!Number.isInteger(input.port) || input.port < 1 || input.port > 65535) throw new Error('Port must be between 1 and 65535')
  if (input.os && !['linux', 'windows'].includes(input.os)) throw new Error('Unsupported server operating system')
  const hydrated = hydrateKeyFromPath(input)
  let sshKey = hydrated.sshKey
  if (sshKey) sshKey = stripBom(sshKey).replace(/\r\n/g, '\n').trim()

  return {
    ...input,
    ...hydrated,
    name: input.name.trim(),
    host: input.host.trim(),
    username: input.username.trim(),
    sshKey,
    sshKeyPath: undefined
  }
}
