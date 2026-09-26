import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

const electronState = vi.hoisted(() => ({
  encryptionAvailable: true
}))

vi.mock('electron', () => ({
  app: { getPath: () => '' },
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

import { WorkspaceStore } from '../electron/main/infra/workspace-store'
import { REDACTED } from '@shared/lib/redact-secrets'

function persistBlob(token: string, fileBase64 = 'QQ=='): string {
  return JSON.stringify({
    version: 1,
    state: {
      collections: [],
      history: [
        {
          id: 'h1',
          timestamp: '2026-01-01T00:00:00.000Z',
          request: {
            id: 'r1',
            name: 'Call',
            method: 'GET',
            url: 'https://api.example.com',
            headers: [{ id: 'h', key: 'Authorization', value: `Bearer ${token}`, enabled: true }],
            queryParams: [],
            body: {
              type: 'form-data',
              content: '',
              formData: [{ id: 'f', key: 'file', value: 'a.txt', enabled: true, type: 'file', fileName: 'a.txt', fileBase64 }]
            },
            auth: { type: 'bearer', bearerToken: token },
            updatedAt: '2026-01-01T00:00:00.000Z'
          },
          response: { ok: true, status: 200, statusText: 'OK', sizeBytes: 1, timeMs: 1 },
          durationMs: 1
        }
      ]
    }
  })
}

describe('WorkspaceStore', () => {
  let root = ''
  let store: WorkspaceStore

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'apimaster-workspace-'))
    electronState.encryptionAvailable = true
    store = new WorkspaceStore(
      () => root,
      () => electronState.encryptionAvailable
    )
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('round-trips an encrypted workspace and strips secrets from history', () => {
    const saved = store.save(persistBlob('live-token'))
    expect(saved.encrypted).toBe(true)

    const raw = readFileSync(join(root, 'data', 'workspace.json'), 'utf8')
    expect(raw).not.toContain('live-token')
    expect(raw).not.toContain('QQ==')

    const loaded = store.load()
    expect(loaded.source).toBe('primary')
    expect(loaded.encrypted).toBe(true)
    const parsed = JSON.parse(loaded.payload ?? '{}') as {
      state: { history: { request: { auth: { bearerToken: string }; body: { formData: { fileBase64?: string }[] } } }[] }
    }
    expect(parsed.state.history[0]?.request.auth.bearerToken).toBe(REDACTED)
    expect(parsed.state.history[0]?.request.body.formData[0]?.fileBase64).toBeUndefined()
  })

  it('keeps a backup and restores it when the current file is corrupt', () => {
    store.save(persistBlob('first'))
    store.save(persistBlob('second'))

    const primary = join(root, 'data', 'workspace.json')
    writeFileSync(primary, '{not json', 'utf8')

    const loaded = store.load()
    expect(loaded.restored).toBe(true)
    expect(loaded.source).toBe('backup')
    expect(loaded.payload).toContain(REDACTED)
    expect(existsSync(primary)).toBe(true)
    expect(readdirSync(join(root, 'data')).some((name) => name.includes('.corrupt-'))).toBe(true)
  })

  it('quarantines an unreadable workspace instead of pretending it was empty on the next save', () => {
    const primary = join(root, 'data', 'workspace.json')
    store.save(persistBlob('kept'))
    writeFileSync(primary, '{not json', 'utf8')
    writeFileSync(`${primary}.bak`, '{also bad', 'utf8')

    const loaded = store.load()
    expect(loaded.payload).toBeNull()
    expect(loaded.source).toBe('none')
    expect(readdirSync(join(root, 'data')).filter((name) => name.includes('.corrupt-')).length).toBe(2)
  })

  it('refuses to overwrite a workspace saved by a newer version', () => {
    const primary = join(root, 'data', 'workspace.json')
    store.save(persistBlob('current'))
    writeFileSync(
      primary,
      JSON.stringify({ version: 99, savedAt: '2026-01-01T00:00:00.000Z', encrypted: false, payload: '{"version":99}' }),
      'utf8'
    )

    expect(() => store.load()).toThrow(/newer version/)
    expect(() => store.save(persistBlob('overwrite'))).toThrow(/newer version/)
    expect(JSON.parse(readFileSync(primary, 'utf8')).version).toBe(99)
  })

  it('writes plaintext when OS encryption is unavailable', () => {
    electronState.encryptionAvailable = false
    const saved = store.save(persistBlob('plain-token'))
    expect(saved.encrypted).toBe(false)
    const loaded = store.load()
    expect(loaded.encrypted).toBe(false)
    expect(loaded.payload).toContain(REDACTED)
    expect(loaded.payload).not.toContain('plain-token')
  })
})
