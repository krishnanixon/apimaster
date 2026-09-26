import { safeStorage } from 'electron'
import { createHash, randomBytes, createCipheriv, createDecipheriv } from 'crypto'
import type { VectorConnectionSecrets } from '@shared/types/vector-workspace'

const AES_ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12
const AUTH_TAG_LENGTH = 16

function deriveFallbackKey(): Buffer {
  const { hostname, platform, arch } = require('os') as typeof import('os')
  const seed = `${hostname()}-${platform()}-${arch()}-vector-workspace`
  return createHash('sha256').update(seed).digest()
}

export function encryptVectorSecrets(secrets: VectorConnectionSecrets): string {
  const json = JSON.stringify(secrets)
  if (safeStorage.isEncryptionAvailable()) {
    return `safe:${safeStorage.encryptString(json).toString('base64')}`
  }
  const key = deriveFallbackKey()
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(AES_ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH })
  const encrypted = Buffer.concat([cipher.update(json, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return `aes:${Buffer.concat([iv, authTag, encrypted]).toString('base64')}`
}

export function decryptVectorSecrets(blob: string): VectorConnectionSecrets {
  if (blob.startsWith('safe:')) {
    const data = Buffer.from(blob.slice(5), 'base64')
    return JSON.parse(safeStorage.decryptString(data)) as VectorConnectionSecrets
  }
  if (blob.startsWith('aes:')) {
    const key = deriveFallbackKey()
    const data = Buffer.from(blob.slice(4), 'base64')
    const iv = data.subarray(0, IV_LENGTH)
    const authTag = data.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH)
    const encrypted = data.subarray(IV_LENGTH + AUTH_TAG_LENGTH)
    const decipher = createDecipheriv(AES_ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH })
    decipher.setAuthTag(authTag)
    const json = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
    return JSON.parse(json) as VectorConnectionSecrets
  }
  throw new Error('Invalid credential format')
}
