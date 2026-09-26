import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

const electronState = vi.hoisted(() => ({
  userDataPath: '',
  encryptionAvailable: true
}))

vi.mock('electron', () => ({
  app: {
    getPath: () => electronState.userDataPath
  },
  safeStorage: {
    isEncryptionAvailable: () => electronState.encryptionAvailable,
    getSelectedStorageBackend: () => 'dpapi',
    encryptString: (value: string) => Buffer.from(`encrypted:${value}`, 'utf8'),
    decryptString: (value: Buffer) => {
      const text = value.toString('utf8')
      if (!text.startsWith('encrypted:')) throw new Error('Invalid ciphertext')
      return text.slice('encrypted:'.length)
    }
  }
}))

import { ApiKeyService } from '../electron/main/infra/api-key.service'

const API_KEY_FILE = 'openai-api-key.enc'

describe('ApiKeyService', () => {
  beforeEach(() => {
    electronState.userDataPath = mkdtempSync(join(tmpdir(), 'requirement-studio-api-key-'))
    electronState.encryptionAvailable = true
  })

  afterEach(() => {
    rmSync(electronState.userDataPath, { recursive: true, force: true })
  })

  it('refuses new persistent writes without secure OS storage', () => {
    electronState.encryptionAvailable = false
    const service = new ApiKeyService()

    expect(() => service.setApiKey('sk-test')).toThrow('Secure OS credential storage is unavailable')
    expect(existsSync(join(electronState.userDataPath, API_KEY_FILE))).toBe(false)
  })

  it('migrates a legacy base64 plaintext key to the tagged secure format', () => {
    const keyPath = join(electronState.userDataPath, API_KEY_FILE)
    writeFileSync(keyPath, Buffer.from('sk-legacy').toString('base64'))
    const service = new ApiKeyService()

    expect(service.getStatus()).toMatchObject({
      isReadable: true,
      storageState: 'legacy-plaintext',
      migrationRequired: true
    })
    expect(service.getApiKey()).toBe('sk-legacy')
    expect(readFileSync(keyPath, 'utf8')).toMatch(/^requirement-studio-secret-v2:/)
    expect(service.getStatus()).toMatchObject({
      isReadable: true,
      storageState: 'secure',
      migrationRequired: false
    })
  })

  it('uses the stored format instead of current encryption availability', () => {
    const keyPath = join(electronState.userDataPath, API_KEY_FILE)
    writeFileSync(keyPath, Buffer.from('encrypted:sk-secure', 'utf8'))
    const service = new ApiKeyService()

    electronState.encryptionAvailable = false
    expect(service.getApiKey()).toBeNull()
    expect(service.getStatus().storageState).toBe('secure-storage-unavailable')

    electronState.encryptionAvailable = true
    expect(service.getApiKey()).toBe('sk-secure')
    expect(service.getStatus().storageState).toBe('secure')
  })

  it('stores additional provider keys separately from the OpenAI key', () => {
    const service = new ApiKeyService()
    service.setApiKey('sk-openai')
    service.setProviderKey('anthropic', 'sk-ant-test')
    expect(service.getApiKey()).toBe('sk-openai')
    expect(service.getProviderKey('anthropic')).toBe('sk-ant-test')
    expect(service.getProviderStatus('anthropic')).toMatchObject({ isSet: true, isReadable: true })
    service.deleteProviderKey('anthropic')
    expect(service.getProviderKey('anthropic')).toBeNull()
    expect(service.getApiKey()).toBe('sk-openai')
  })
})
