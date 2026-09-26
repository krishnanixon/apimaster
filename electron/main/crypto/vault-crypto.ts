import { randomBytes, createCipheriv, createDecipheriv, createHash } from 'crypto'
import { hash, hashRaw, verify, Algorithm } from '@node-rs/argon2'

const AES_ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12
const AUTH_TAG_LENGTH = 16
const KEY_LENGTH = 32

export interface Argon2Params {
  memoryCost: number
  timeCost: number
  parallelism: number
}

export const DEFAULT_ARGON2_PARAMS: Argon2Params = {
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 4
}

const ARGON2_OPTIONS = {
  algorithm: Algorithm.Argon2id,
  ...DEFAULT_ARGON2_PARAMS
}

export function generateSalt(bytes = 16): string {
  return randomBytes(bytes).toString('base64')
}

export async function hashMasterPassword(
  password: string,
  salt: string
): Promise<string> {
  return hash(password, {
    ...ARGON2_OPTIONS,
    salt: Buffer.from(salt, 'base64')
  })
}

export async function verifyMasterPassword(
  hash: string,
  password: string
): Promise<boolean> {
  try {
    return await verify(hash, password)
  } catch {
    return false
  }
}

export async function deriveEncryptionKey(
  password: string,
  salt: string
): Promise<Buffer> {
  return hashRaw(password, {
    ...ARGON2_OPTIONS,
    salt: Buffer.from(salt, 'base64'),
    outputLen: KEY_LENGTH
  })
}

export function encryptString(plaintext: string, key: Buffer): string {
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(AES_ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH })
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return Buffer.concat([iv, authTag, encrypted]).toString('base64')
}

export function decryptString(ciphertext: string, key: Buffer): string {
  const data = Buffer.from(ciphertext, 'base64')
  const iv = data.subarray(0, IV_LENGTH)
  const authTag = data.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH)
  const encrypted = data.subarray(IV_LENGTH + AUTH_TAG_LENGTH)
  const decipher = createDecipheriv(AES_ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH })
  decipher.setAuthTag(authTag)
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
}

export function encryptJson<T>(value: T, key: Buffer): string {
  return encryptString(JSON.stringify(value), key)
}

export function decryptJson<T>(ciphertext: string, key: Buffer): T {
  return JSON.parse(decryptString(ciphertext, key)) as T
}

export function hashForDuplicateDetection(value: string): string {
  if (!value) return ''
  return createHash('sha256').update(value).digest('hex')
}

export function generateSecureToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url')
}

export function generatePassword(options: {
  length?: number
  uppercase?: boolean
  lowercase?: boolean
  numbers?: boolean
  symbols?: boolean
  excludeAmbiguous?: boolean
}): string {
  const length = Math.max(8, Math.min(128, options.length ?? 20))
  const useUpper = options.uppercase !== false
  const useLower = options.lowercase !== false
  const useNumbers = options.numbers !== false
  const useSymbols = options.symbols !== false
  const excludeAmbiguous = options.excludeAmbiguous ?? true

  let charset = ''
  if (useLower) charset += excludeAmbiguous ? 'abcdefghjkmnpqrstuvwxyz' : 'abcdefghijklmnopqrstuvwxyz'
  if (useUpper) charset += excludeAmbiguous ? 'ABCDEFGHJKMNPQRSTUVWXYZ' : 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  if (useNumbers) charset += excludeAmbiguous ? '23456789' : '0123456789'
  if (useSymbols) charset += '!@#$%^&*()-_=+[]{}|;:,.<>?'

  if (!charset) charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%'

  const bytes = randomBytes(length)
  let password = ''
  for (let i = 0; i < length; i++) {
    password += charset[bytes[i]! % charset.length]
  }
  return password
}

export function scorePasswordStrength(password: string): number {
  if (!password) return 0
  let score = 0
  if (password.length >= 8) score += 1
  if (password.length >= 12) score += 1
  if (password.length >= 16) score += 1
  if (/[a-z]/.test(password)) score += 1
  if (/[A-Z]/.test(password)) score += 1
  if (/[0-9]/.test(password)) score += 1
  if (/[^a-zA-Z0-9]/.test(password)) score += 1
  if (password.length >= 20) score += 1
  const unique = new Set(password).size
  if (unique / password.length > 0.6) score += 1
  return Math.min(10, score)
}

export function strengthLabel(score: number): 'weak' | 'fair' | 'good' | 'strong' | 'excellent' {
  if (score <= 2) return 'weak'
  if (score <= 4) return 'fair'
  if (score <= 6) return 'good'
  if (score <= 8) return 'strong'
  return 'excellent'
}
