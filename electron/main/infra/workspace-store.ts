import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { app, safeStorage } from 'electron'
import { apiKeyService } from './api-key.service'
import {
  sanitizePersistBlob,
  WORKSPACE_FILE_NAME,
  WORKSPACE_PAYLOAD_MAX_CHARS,
  type WorkspaceLoadResult,
  type WorkspaceSaveResult
} from '@shared/lib/workspace-document'

const FILE_VERSION = 1

interface Envelope {
  version: number
  savedAt: string
  encrypted: boolean
  payload: string
}

type ReadResult =
  | { status: 'missing' }
  | { status: 'corrupt' }
  | { status: 'newer' }
  | { status: 'ok'; payload: string; encrypted: boolean }

/**
 * Collections, environments, tabs, and history.
 * Writes are atomic. The previous good file is kept as `.bak`.
 * When OS encryption is available the payload is sealed with safeStorage.
 */
export class WorkspaceStore {
  constructor(
    private readonly userDataPath: () => string,
    private readonly encryptionAvailable: () => boolean
  ) {}

  private filePath(): string {
    return join(this.userDataPath(), 'data', WORKSPACE_FILE_NAME)
  }

  load(): WorkspaceLoadResult {
    const primaryPath = this.filePath()
    const backupPath = `${primaryPath}.bak`
    const primary = this.readEnvelope(primaryPath)

    if (primary.status === 'newer') {
      throw new Error('This workspace was saved by a newer version of Shurikly. It was left untouched.')
    }
    if (primary.status === 'ok') {
      return { payload: primary.payload, source: 'primary', restored: false, encrypted: primary.encrypted }
    }

    const backup = this.readEnvelope(backupPath)
    if (backup.status === 'ok') {
      if (primary.status === 'corrupt') this.quarantine(primaryPath)
      this.restorePrimary(backupPath, primaryPath)
      return { payload: backup.payload, source: 'backup', restored: true, encrypted: backup.encrypted }
    }

    if (primary.status === 'corrupt') this.quarantine(primaryPath)
    if (backup.status === 'corrupt') this.quarantine(backupPath)
    return { payload: null, source: 'none', restored: false, encrypted: this.encryptionAvailable() }
  }

  save(payload: string): WorkspaceSaveResult {
    if (typeof payload !== 'string' || payload.length === 0) {
      throw new Error('Workspace payload is empty')
    }
    if (payload.length > WORKSPACE_PAYLOAD_MAX_CHARS) {
      throw new Error('Workspace is too large to save')
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(payload)
    } catch {
      throw new Error('Workspace payload is not valid JSON')
    }
    const sanitized = JSON.stringify(sanitizePersistBlob(parsed))

    const primaryPath = this.filePath()
    const backupPath = `${primaryPath}.bak`
    if (existsSync(primaryPath)) {
      const existing = this.readEnvelope(primaryPath)
      if (existing.status === 'newer') {
        throw new Error('This workspace was saved by a newer version of Shurikly. It was left untouched.')
      }
      if (existing.status === 'ok') copyFileSync(primaryPath, backupPath)
      if (existing.status === 'corrupt') this.quarantine(primaryPath)
    }

    const encrypted = this.encryptionAvailable()
    const envelope: Envelope = {
      version: FILE_VERSION,
      savedAt: new Date().toISOString(),
      encrypted,
      payload: encrypted ? safeStorage.encryptString(sanitized).toString('base64') : sanitized
    }
    this.atomicWrite(primaryPath, JSON.stringify(envelope))
    return { encrypted }
  }

  private readEnvelope(path: string): ReadResult {
    if (!existsSync(path)) return { status: 'missing' }
    try {
      const raw = JSON.parse(readFileSync(path, 'utf8')) as Partial<Envelope>
      if (!raw || typeof raw.version !== 'number' || typeof raw.payload !== 'string' || typeof raw.encrypted !== 'boolean') {
        return { status: 'corrupt' }
      }
      if (raw.version > FILE_VERSION) return { status: 'newer' }
      const payload = raw.encrypted
        ? safeStorage.decryptString(Buffer.from(raw.payload, 'base64'))
        : raw.payload
      JSON.parse(payload)
      return { status: 'ok', payload, encrypted: raw.encrypted }
    } catch {
      return { status: 'corrupt' }
    }
  }

  private atomicWrite(path: string, contents: string): void {
    const directory = dirname(path)
    if (!existsSync(directory)) mkdirSync(directory, { recursive: true })
    const tmp = `${path}.tmp`
    writeFileSync(tmp, contents, 'utf8')
    renameSync(tmp, path)
  }

  private restorePrimary(backupPath: string, primaryPath: string): void {
    const directory = dirname(primaryPath)
    if (!existsSync(directory)) mkdirSync(directory, { recursive: true })
    copyFileSync(backupPath, primaryPath)
  }

  private quarantine(path: string): void {
    if (!existsSync(path)) return
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    renameSync(path, `${path}.corrupt-${stamp}`)
  }
}

export const workspaceStore = new WorkspaceStore(
  () => app.getPath('userData'),
  () => apiKeyService.isEncryptionAvailable()
)
