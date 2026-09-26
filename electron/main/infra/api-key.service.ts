import { safeStorage } from 'electron'
import { readFileSync, writeFileSync, existsSync, unlinkSync, mkdirSync } from 'fs'
import { dirname, join } from 'path'
import { app } from 'electron'
import type { AIProviderId, ApiKeyStatus, ApiKeyStorageState } from '@shared/types'
import { CLOUD_PROVIDER_IDS } from '@shared/lib/ai-routing'

const API_KEY_FILE = 'openai-api-key.enc'
const ENVELOPE_PREFIX = 'requirement-studio-secret-v2:'

interface ApiKeyEnvelope {
  version: 2
  purpose: string
  scheme: 'electron-safe-storage'
  payload: string
}

interface DecodedApiKey {
  key: string
  storageState: Exclude<ApiKeyStorageState, 'not-set' | 'secure-storage-unavailable' | 'unreadable'>
}

function getKeyPath(): string {
  return join(app.getPath('userData'), API_KEY_FILE)
}

export class ApiKeyService {
  isEncryptionAvailable(): boolean {
    if (!safeStorage.isEncryptionAvailable()) return false
    if (process.platform !== 'linux') return true
    return safeStorage.getSelectedStorageBackend() !== 'basic_text'
  }

  getStatus(): ApiKeyStatus {
    const keyPath = getKeyPath()
    const isSet = existsSync(keyPath)
    const isEncryptionAvailable = this.isEncryptionAvailable()
    if (!isSet) {
      return {
        isSet: false,
        isEncryptionAvailable,
        isReadable: false,
        storageState: 'not-set',
        migrationRequired: false
      }
    }

    try {
      const decoded = this.decodeStoredKey(readFileSync(keyPath), false)
      return {
        isSet: true,
        isEncryptionAvailable,
        isReadable: true,
        storageState: decoded.storageState,
        migrationRequired: decoded.storageState !== 'secure'
      }
    } catch {
      return {
        isSet: true,
        isEncryptionAvailable,
        isReadable: false,
        storageState: isEncryptionAvailable ? 'unreadable' : 'secure-storage-unavailable',
        migrationRequired: true
      }
    }
  }

  setApiKey(key: string): void {
    if (!key.trim()) {
      throw new Error('API key cannot be empty')
    }

    if (!this.isEncryptionAvailable()) {
      throw new Error('Secure OS credential storage is unavailable; the API key was not saved')
    }

    const encrypted = safeStorage.encryptString(key)
    const envelope: ApiKeyEnvelope = {
      version: 2,
      purpose: 'openai-api-key',
      scheme: 'electron-safe-storage',
      payload: encrypted.toString('base64')
    }
    writeFileSync(getKeyPath(), `${ENVELOPE_PREFIX}${JSON.stringify(envelope)}`, { mode: 0o600 })
  }

  getApiKey(): string | null {
    const keyPath = getKeyPath()
    if (!existsSync(keyPath)) return null

    try {
      const data = readFileSync(keyPath)
      const decoded = this.decodeStoredKey(data, true)
      if (decoded.storageState !== 'secure' && this.isEncryptionAvailable()) {
        this.setApiKey(decoded.key)
      }
      return decoded.key
    } catch {
      return null
    }
  }

  private decodeStoredKey(data: Buffer, requireSecureRead: boolean): DecodedApiKey {
    const text = data.toString('utf8')
    if (text.startsWith(ENVELOPE_PREFIX)) {
      const envelope = JSON.parse(text.slice(ENVELOPE_PREFIX.length)) as Partial<ApiKeyEnvelope>
      if (
        envelope.version !== 2 ||
        envelope.purpose !== 'openai-api-key' ||
        envelope.scheme !== 'electron-safe-storage' ||
        typeof envelope.payload !== 'string'
      ) {
        throw new Error('Unsupported API key storage format')
      }
      if (!this.isEncryptionAvailable()) {
        throw new Error('Secure OS credential storage is unavailable')
      }
      return {
        key: safeStorage.decryptString(Buffer.from(envelope.payload, 'base64')),
        storageState: 'secure'
      }
    }

    if (this.isEncryptionAvailable()) {
      try {
        return {
          key: safeStorage.decryptString(data),
          storageState: 'legacy-secure'
        }
      } catch {
        // Older releases stored plaintext as canonical base64 when safeStorage was unavailable.
      }
    }

    const legacyPlaintext = decodeCanonicalBase64(text)
    if (legacyPlaintext !== null) {
      return { key: legacyPlaintext, storageState: 'legacy-plaintext' }
    }

    if (requireSecureRead && !this.isEncryptionAvailable()) {
      throw new Error('Secure OS credential storage is unavailable')
    }
    throw new Error('API key file is unreadable')
  }

  deleteApiKey(): void {
    const keyPath = getKeyPath()
    if (existsSync(keyPath)) {
      unlinkSync(keyPath)
    }
  }

  getProviderKeyPath(providerId: AIProviderId): string {
    if (providerId === 'openai') return getKeyPath()
    return join(app.getPath('userData'), 'provider-keys', `${providerId}.enc`)
  }

  setProviderKey(providerId: AIProviderId, key: string): void {
    if (providerId === 'openai') {
      this.setApiKey(key)
      return
    }
    if (!key.trim()) throw new Error('API key cannot be empty')
    if (!this.isEncryptionAvailable()) {
      throw new Error('Secure OS credential storage is unavailable; the API key was not saved')
    }
    const path = this.getProviderKeyPath(providerId)
    mkdirSync(dirname(path), { recursive: true })
    const envelope: ApiKeyEnvelope = {
      version: 2,
      purpose: `provider-api-key:${providerId}`,
      scheme: 'electron-safe-storage',
      payload: safeStorage.encryptString(key).toString('base64')
    }
    writeFileSync(path, `${ENVELOPE_PREFIX}${JSON.stringify(envelope)}`, { mode: 0o600 })
  }

  getProviderKey(providerId: AIProviderId): string | null {
    if (providerId === 'openai') return this.getApiKey()
    const path = this.getProviderKeyPath(providerId)
    if (!existsSync(path)) return null
    try {
      return this.decodeProviderEnvelope(readFileSync(path), `provider-api-key:${providerId}`)
    } catch {
      return null
    }
  }

  getProviderStatus(providerId: AIProviderId): ApiKeyStatus {
    if (providerId === 'openai') return this.getStatus()
    const path = this.getProviderKeyPath(providerId)
    const isEncryptionAvailable = this.isEncryptionAvailable()
    if (!existsSync(path)) {
      return {
        isSet: false,
        isEncryptionAvailable,
        isReadable: false,
        storageState: 'not-set',
        migrationRequired: false
      }
    }
    try {
      this.decodeProviderEnvelope(readFileSync(path), `provider-api-key:${providerId}`)
      return {
        isSet: true,
        isEncryptionAvailable,
        isReadable: true,
        storageState: 'secure',
        migrationRequired: false
      }
    } catch {
      return {
        isSet: true,
        isEncryptionAvailable,
        isReadable: false,
        storageState: isEncryptionAvailable ? 'unreadable' : 'secure-storage-unavailable',
        migrationRequired: true
      }
    }
  }

  deleteProviderKey(providerId: AIProviderId): void {
    if (providerId === 'openai') {
      this.deleteApiKey()
      return
    }
    const path = this.getProviderKeyPath(providerId)
    if (existsSync(path)) unlinkSync(path)
  }

  listProviderStatuses(): Partial<Record<AIProviderId, ApiKeyStatus>> {
    const statuses: Partial<Record<AIProviderId, ApiKeyStatus>> = {
      openai: this.getStatus()
    }
    for (const id of CLOUD_PROVIDER_IDS) {
      if (id === 'openai') continue
      statuses[id] = this.getProviderStatus(id)
    }
    return statuses
  }

  private decodeProviderEnvelope(data: Buffer, expectedPurpose: string): string {
    const text = data.toString('utf8')
    if (!text.startsWith(ENVELOPE_PREFIX)) throw new Error('Unsupported API key storage format')
    const envelope = JSON.parse(text.slice(ENVELOPE_PREFIX.length)) as Partial<ApiKeyEnvelope>
    if (
      envelope.version !== 2 ||
      envelope.purpose !== expectedPurpose ||
      envelope.scheme !== 'electron-safe-storage' ||
      typeof envelope.payload !== 'string'
    ) {
      throw new Error('Unsupported API key storage format')
    }
    if (!this.isEncryptionAvailable()) {
      throw new Error('Secure OS credential storage is unavailable')
    }
    return safeStorage.decryptString(Buffer.from(envelope.payload, 'base64'))
  }
}

function decodeCanonicalBase64(value: string): string | null {
  const input = value.trim()
  if (!input || input.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(input)) return null
  const decoded = Buffer.from(input, 'base64')
  if (decoded.toString('base64') !== input) return null
  const text = decoded.toString('utf8')
  if (!text || Buffer.from(text, 'utf8').compare(decoded) !== 0) return null
  return text
}

export const apiKeyService = new ApiKeyService()
