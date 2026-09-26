import { clipboard } from 'electron'
import type {
  CreateVaultFolderInput,
  CreateVaultItemInput,
  GeneratePasswordOptions,
  GeneratePasswordResult,
  UpdateVaultFolderInput,
  UpdateVaultItemInput,
  VaultActivityLog,
  VaultAiSuggestion,
  VaultAutoLockMinutes,
  VaultClipboardClearSeconds,
  VaultDuplicateGroup,
  VaultExportOptions,
  VaultFolder,
  VaultHistoryEntry,
  VaultImportOptions,
  VaultImportResult,
  VaultItem,
  VaultItemListEntry,
  VaultItemSecrets,
  VaultProjectCredentialRef,
  VaultRevealResult,
  VaultSearchQuery,
  VaultSearchResult,
  VaultSecurityReport,
  VaultSettings,
  VaultSetupInput,
  VaultStatus,
  VaultTag,
  VaultUnlockInput
} from '@shared/types/vault'
import {
  decryptJson,
  deriveEncryptionKey,
  encryptJson,
  encryptString,
  generatePassword,
  generateSalt,
  generateSecureToken,
  hashForDuplicateDetection,
  hashMasterPassword,
  scorePasswordStrength,
  strengthLabel,
  verifyMasterPassword
} from '../crypto/vault-crypto'
import { vaultRepository } from '../repositories/vault.repository'
import { logger } from '../infra/logger.service'

const VERIFICATION_PLAINTEXT = 'vault-unlock-verified-v1'
const EMPTY_SECRETS = vaultRepository.emptySecrets()

class VaultService {
  private encryptionKey: Buffer | null = null
  private autoLockTimer: ReturnType<typeof setTimeout> | null = null
  private clipboardTimer: ReturnType<typeof setTimeout> | null = null
  private lastActivityAt = Date.now()

  async getStatus(): Promise<VaultStatus> {
    const meta = await vaultRepository.getMeta()
    const settings = await this.getSettings()
    return {
      isInitialized: Boolean(meta),
      isUnlocked: Boolean(this.encryptionKey),
      settings
    }
  }

  async getSettings(): Promise<VaultSettings> {
    const s = await vaultRepository.getSettings()
    return {
      autoLockMinutes: s.autoLockMinutes as VaultAutoLockMinutes,
      clipboardClearSeconds: s.clipboardClearSeconds as VaultClipboardClearSeconds
    }
  }

  async updateSettings(settings: Partial<VaultSettings>): Promise<VaultSettings> {
    const current = await this.getSettings()
    const next = { ...current, ...settings }
    await vaultRepository.updateSettings(next.autoLockMinutes, next.clipboardClearSeconds)
    if (this.encryptionKey) this.resetAutoLockTimer()
    return next
  }

  async setup(input: VaultSetupInput): Promise<void> {
    const existing = await vaultRepository.getMeta()
    if (existing) throw new Error('Vault is already initialized')

    const kdfSalt = generateSalt()
    const passwordHash = await hashMasterPassword(input.masterPassword, kdfSalt)
    const key = await deriveEncryptionKey(input.masterPassword, kdfSalt)
    const verificationBlob = encryptString(VERIFICATION_PLAINTEXT, key)

    await vaultRepository.createMeta({
      passwordHash,
      kdfSalt,
      verificationBlob,
      hint: input.hint
    })
    await vaultRepository.seedDefaultFolders()
    await vaultRepository.logActivity('vault_setup', null, 'Vault', 'Master password configured')
  }

  async unlock(input: VaultUnlockInput): Promise<void> {
    const meta = await vaultRepository.getMeta()
    if (!meta) throw new Error('Vault not initialized')

    const valid = await verifyMasterPassword(meta.passwordHash, input.masterPassword)
    if (!valid) throw new Error('Invalid master password')

    const key = await deriveEncryptionKey(input.masterPassword, meta.kdfSalt)
    const { decryptString } = await import('../crypto/vault-crypto')
    try {
      const plain = decryptString(meta.verificationBlob, key)
      if (plain !== VERIFICATION_PLAINTEXT) throw new Error('Invalid master password')
    } catch {
      throw new Error('Invalid master password')
    }

    this.encryptionKey = key
    this.touchActivity()
    this.resetAutoLockTimer()
    await vaultRepository.logActivity('vault_unlock', null, 'Vault', 'Vault unlocked')
  }

  lock(): void {
    this.encryptionKey = null
    if (this.autoLockTimer) {
      clearTimeout(this.autoLockTimer)
      this.autoLockTimer = null
    }
    void vaultRepository.logActivity('vault_lock', null, 'Vault', 'Vault locked')
  }

  private requireKey(): Buffer {
    if (!this.encryptionKey) throw new Error('Vault is locked')
    return this.encryptionKey
  }

  private touchActivity(): void {
    this.lastActivityAt = Date.now()
  }

  private resetAutoLockTimer(): void {
    if (this.autoLockTimer) clearTimeout(this.autoLockTimer)
    void this.getSettings().then((s) => {
      if (!s.autoLockMinutes || !this.encryptionKey) return
      this.autoLockTimer = setTimeout(
        () => this.lock(),
        s.autoLockMinutes * 60 * 1000
      )
    })
  }

  private encryptSecrets(secrets: VaultItemSecrets): string {
    return encryptJson(secrets, this.requireKey())
  }

  private decryptSecrets(blob: string): VaultItemSecrets {
    if (!blob) return { ...EMPTY_SECRETS }
    return decryptJson<VaultItemSecrets>(blob, this.requireKey())
  }

  private mergeSecrets(partial: Partial<VaultItemSecrets>, base?: VaultItemSecrets): VaultItemSecrets {
    return { ...(base ?? EMPTY_SECRETS), ...partial }
  }

  private preview(value: string, max = 64): string {
    return value.length > max ? `${value.slice(0, max)}…` : value
  }

  private async buildDuplicateMap(): Promise<Map<string, string[]>> {
    const rows = await vaultRepository.listItems()
    const map = new Map<string, string[]>()
    for (const row of rows) {
      if (!row.passwordHash) continue
      const list = map.get(row.passwordHash) ?? []
      list.push(row.id)
      map.set(row.passwordHash, list)
    }
    return map
  }

  private async enrichListEntry(row: Awaited<ReturnType<typeof vaultRepository.listItems>>[0]): Promise<VaultItemListEntry> {
    const tags = await vaultRepository.getItemTags(row.id)
    const secrets = this.decryptSecrets(row.encryptedData)
    const strength = scorePasswordStrength(secrets.password)
    const isWeak = strength <= 3
    const dupMap = await this.buildDuplicateMap()
    const isDuplicate = (dupMap.get(row.passwordHash)?.length ?? 0) > 1
    return vaultRepository.rowToListEntry(row, tags, strength, isWeak, isDuplicate)
  }

  async listFolders(): Promise<VaultFolder[]> {
    this.requireKey()
    this.touchActivity()
    return vaultRepository.listFolders()
  }

  async createFolder(input: CreateVaultFolderInput): Promise<VaultFolder> {
    this.requireKey()
    this.touchActivity()
    const folder = await vaultRepository.createFolder(input)
    await vaultRepository.logActivity('folder_create', null, folder.name)
    return folder
  }

  async updateFolder(id: string, input: UpdateVaultFolderInput): Promise<VaultFolder> {
    this.requireKey()
    this.touchActivity()
    const updated = await vaultRepository.updateFolder(id, input)
    if (!updated) throw new Error('Folder not found')
    return updated
  }

  async deleteFolder(id: string): Promise<void> {
    this.requireKey()
    await vaultRepository.updateFolder(id, { deletedAt: new Date().toISOString() })
  }

  async reorderFolders(orderedIds: string[]): Promise<void> {
    this.requireKey()
    await vaultRepository.reorderFolders(orderedIds)
  }

  async listTags(): Promise<VaultTag[]> {
    this.requireKey()
    return vaultRepository.listTags()
  }

  async listItems(filter?: {
    folderId?: string | null
    view?: 'all' | 'favorites' | 'recent' | 'archive' | 'trash'
  }): Promise<VaultItemListEntry[]> {
    this.requireKey()
    this.touchActivity()

    if (filter?.view === 'trash') {
      const rows = await vaultRepository.listItems({ includeDeleted: true, includeArchived: true })
      const trashed = rows.filter((r) => r.deletedAt)
      return Promise.all(trashed.map((r) => this.enrichListEntry(r)))
    }
    if (filter?.view === 'archive') {
      const rows = await vaultRepository.listItems({ includeArchived: true })
      const archived = rows.filter((r) => r.archivedAt && !r.deletedAt)
      return Promise.all(archived.map((r) => this.enrichListEntry(r)))
    }
    if (filter?.view === 'favorites') {
      const rows = await vaultRepository.listItems({ favoritesOnly: true })
      return Promise.all(rows.map((r) => this.enrichListEntry(r)))
    }
    if (filter?.view === 'recent') {
      const rows = await vaultRepository.listItems({ recentLimit: 50 })
      const sorted = [...rows].sort((a, b) => {
        const ta = a.lastUsedAt ? new Date(a.lastUsedAt).getTime() : 0
        const tb = b.lastUsedAt ? new Date(b.lastUsedAt).getTime() : 0
        return tb - ta
      })
      return Promise.all(sorted.slice(0, 20).map((r) => this.enrichListEntry(r)))
    }

    const rows = await vaultRepository.listItems({ folderId: filter?.folderId })
    return Promise.all(rows.map((r) => this.enrichListEntry(r)))
  }

  async getItem(id: string, includeSecrets = false): Promise<VaultItem | VaultItemListEntry> {
    this.requireKey()
    this.touchActivity()
    const row = await vaultRepository.getItem(id)
    if (!row) throw new Error('Item not found')
    const listEntry = await this.enrichListEntry(row)
    if (!includeSecrets) return listEntry
    const secrets = this.decryptSecrets(row.encryptedData)
    return { ...listEntry, ...secrets }
  }

  async createItem(input: CreateVaultItemInput): Promise<VaultItemListEntry> {
    this.requireKey()
    this.touchActivity()
    const secrets = this.mergeSecrets(input.secrets ?? {})
    const passwordHash = hashForDuplicateDetection(secrets.password)

    const id = await vaultRepository.createItem({
      folderId: input.folderId,
      projectId: input.projectId,
      itemType: input.itemType,
      title: input.title,
      encryptedData: this.encryptSecrets(secrets),
      urlPreview: this.preview(secrets.url),
      usernamePreview: this.preview(secrets.username || secrets.databaseUsername || secrets.sshUsername),
      passwordHash,
      expiresAt: input.expiresAt
    })

    if (input.tagIds?.length) {
      await vaultRepository.setItemTags(id, input.tagIds)
    }

    await vaultRepository.logActivity('item_create', id, input.title)
    return this.enrichListEntry((await vaultRepository.getItem(id))!)
  }

  async updateItem(id: string, input: UpdateVaultItemInput): Promise<VaultItemListEntry> {
    this.requireKey()
    this.touchActivity()
    const row = await vaultRepository.getItem(id)
    if (!row) throw new Error('Item not found')

    const currentSecrets = this.decryptSecrets(row.encryptedData)
    const nextSecrets = input.secrets ? this.mergeSecrets(input.secrets, currentSecrets) : currentSecrets
    const passwordChanged = input.secrets?.password !== undefined && input.secrets.password !== currentSecrets.password

    if (passwordChanged && currentSecrets.password) {
      await vaultRepository.addHistory({
        itemId: id,
        encryptedPassword: encryptString(currentSecrets.password, this.requireKey()),
        passwordHint: `${currentSecrets.password.slice(0, 2)}${'•'.repeat(Math.max(0, currentSecrets.password.length - 4))}${currentSecrets.password.slice(-2)}`,
        changeReason: 'Password updated'
      })
    }

    await vaultRepository.updateItem(id, {
      folderId: input.folderId,
      projectId: input.projectId,
      itemType: input.itemType,
      title: input.title,
      encryptedData: input.secrets ? this.encryptSecrets(nextSecrets) : undefined,
      urlPreview: input.secrets?.url !== undefined ? this.preview(nextSecrets.url) : undefined,
      usernamePreview:
        input.secrets?.username !== undefined ||
        input.secrets?.databaseUsername !== undefined ||
        input.secrets?.sshUsername !== undefined
          ? this.preview(nextSecrets.username || nextSecrets.databaseUsername || nextSecrets.sshUsername)
          : undefined,
      passwordHash: input.secrets?.password !== undefined ? hashForDuplicateDetection(nextSecrets.password) : undefined,
      favorite: input.favorite,
      isPinned: input.isPinned,
      expiresAt: input.expiresAt,
      sortOrder: input.sortOrder
    })

    if (input.tagIds) await vaultRepository.setItemTags(id, input.tagIds)
    if (input.isPinned) await vaultRepository.setFavoritePin(id, input.sortOrder ?? 0)
    if (input.isPinned === false) await vaultRepository.removeFavoritePin(id)

    await vaultRepository.logActivity('item_update', id, input.title ?? row.title)
    return this.enrichListEntry((await vaultRepository.getItem(id))!)
  }

  async archiveItem(id: string): Promise<void> {
    this.requireKey()
    await vaultRepository.updateItem(id, { archivedAt: new Date().toISOString() })
  }

  async restoreItem(id: string): Promise<void> {
    this.requireKey()
    await vaultRepository.updateItem(id, { archivedAt: null, deletedAt: null })
  }

  async trashItem(id: string): Promise<void> {
    this.requireKey()
    await vaultRepository.updateItem(id, { deletedAt: new Date().toISOString() })
  }

  async deleteItemPermanent(id: string): Promise<void> {
    this.requireKey()
    const row = await vaultRepository.getItem(id)
    await vaultRepository.deleteItemPermanent(id)
    await vaultRepository.logActivity('item_delete_permanent', id, row?.title ?? '')
  }

  async reorderItems(orderedIds: string[]): Promise<void> {
    this.requireKey()
    await vaultRepository.reorderItems(orderedIds)
  }

  async revealField(itemId: string, field: keyof VaultItemSecrets): Promise<VaultRevealResult> {
    this.requireKey()
    this.touchActivity()
    const row = await vaultRepository.getItem(itemId)
    if (!row) throw new Error('Item not found')
    const secrets = this.decryptSecrets(row.encryptedData)
    await vaultRepository.updateItem(itemId, { lastUsedAt: new Date().toISOString() })
    await vaultRepository.logActivity('reveal', itemId, row.title, field)
    return {
      field,
      value: secrets[field] ?? '',
      expiresAt: Date.now() + 30_000
    }
  }

  async copyToClipboard(itemId: string, field: keyof VaultItemSecrets): Promise<number> {
    this.requireKey()
    const revealed = await this.revealField(itemId, field)
    clipboard.writeText(revealed.value)
    const settings = await this.getSettings()
    if (this.clipboardTimer) clearTimeout(this.clipboardTimer)
    this.clipboardTimer = setTimeout(() => {
      if (clipboard.readText() === revealed.value) clipboard.clear()
    }, settings.clipboardClearSeconds * 1000)
    await vaultRepository.logActivity('copy', itemId, '', field)
    return settings.clipboardClearSeconds
  }

  async listHistory(itemId: string): Promise<VaultHistoryEntry[]> {
    this.requireKey()
    return vaultRepository.listHistory(itemId)
  }

  async restoreHistoryPassword(itemId: string, historyId: string): Promise<void> {
    this.requireKey()
    const blob = await vaultRepository.getHistoryPassword(historyId)
    if (!blob) throw new Error('History entry not found')
    const { decryptString } = await import('../crypto/vault-crypto')
    const password = decryptString(blob, this.requireKey())
    await this.updateItem(itemId, { secrets: { password } })
  }

  async search(query: VaultSearchQuery): Promise<VaultSearchResult> {
    this.requireKey()
    this.touchActivity()
    const q = query.query.trim().toLowerCase()
    const allRows = await vaultRepository.listItems({
      folderId: query.folderId,
      includeDeleted: query.filter === 'trash',
      includeArchived: query.filter === 'archive' || query.filter === 'trash'
    })

    let filteredRows = allRows
    if (query.filter === 'trash') filteredRows = allRows.filter((r) => r.deletedAt)
    else if (query.filter === 'archive') filteredRows = allRows.filter((r) => r.archivedAt && !r.deletedAt)
    else if (query.filter === 'favorites') filteredRows = allRows.filter((r) => r.favorite && !r.deletedAt)
    else filteredRows = allRows.filter((r) => !r.deletedAt && !r.archivedAt)

    const items: VaultItemListEntry[] = []
    for (const row of filteredRows) {
      const entry = await this.enrichListEntry(row)
      if (query.itemType && entry.itemType !== query.itemType) continue
      if (query.tagId && !entry.tagIds.includes(query.tagId)) continue
      if (q) {
        const secrets = this.decryptSecrets(row.encryptedData)
        const haystack = [entry.title, entry.username, entry.url, secrets.notes, ...entry.tagNames]
          .join(' ')
          .toLowerCase()
        if (!haystack.includes(q)) continue
      }
      items.push(entry)
    }

    const folders = (await vaultRepository.listFolders()).filter(
      (f) => !q || f.name.toLowerCase().includes(q)
    )
    const tags = (await vaultRepository.listTags()).filter(
      (t) => !q || t.name.toLowerCase().includes(q)
    )
    return { items, folders, tags }
  }

  generatePassword(options?: GeneratePasswordOptions): GeneratePasswordResult {
    const password = generatePassword(options ?? {})
    const strength = scorePasswordStrength(password)
    return { password, strength, label: strengthLabel(strength) }
  }

  generateApiKey(): string {
    return generateSecureToken(32)
  }

  async getDuplicates(): Promise<VaultDuplicateGroup[]> {
    this.requireKey()
    const map = await this.buildDuplicateMap()
    const groups: VaultDuplicateGroup[] = []
    for (const [passwordHash, itemIds] of map) {
      if (itemIds.length < 2) continue
      const titles: string[] = []
      for (const id of itemIds) {
        const row = await vaultRepository.getItem(id)
        if (row) titles.push(row.title)
      }
      groups.push({ passwordHash, itemIds, titles })
    }
    return groups
  }

  async getSecurityReport(): Promise<VaultSecurityReport> {
    this.requireKey()
    const items = await this.listItems()
    const weakCount = items.filter((i) => i.isWeak).length
    const expiredCount = items.filter((i) => i.isExpired).length
    const duplicates = await this.getDuplicates()
    const exposedPatterns: string[] = []
    const rotationSuggestions: VaultSecurityReport['rotationSuggestions'] = []

    for (const item of items) {
      const row = await vaultRepository.getItem(item.id)
      if (!row) continue
      const secrets = this.decryptSecrets(row.encryptedData)
      if (/password\s*=\s*\S+/i.test(secrets.notes)) exposedPatterns.push(item.title)
      if (item.isExpired) {
        rotationSuggestions.push({ itemId: item.id, title: item.title, reason: 'Credential has expired' })
      } else if (item.lastUsedAt) {
        const days = (Date.now() - new Date(item.lastUsedAt).getTime()) / (86400000)
        if (days > 90) {
          rotationSuggestions.push({ itemId: item.id, title: item.title, reason: 'Not rotated in 90+ days' })
        }
      }
    }

    return {
      weakCount,
      duplicateCount: duplicates.length,
      expiredCount,
      exposedPatterns,
      rotationSuggestions
    }
  }

  async getAiSuggestions(): Promise<VaultAiSuggestion[]> {
    this.requireKey()
    const report = await this.getSecurityReport()
    const suggestions: VaultAiSuggestion[] = []

    if (report.weakCount > 0) {
      suggestions.push({
        type: 'stronger_password',
        title: 'Weak passwords detected',
        message: `${report.weakCount} credential(s) use weak passwords. Consider generating stronger passwords.`,
        severity: 'warning'
      })
    }
    if (report.duplicateCount > 0) {
      suggestions.push({
        type: 'security_issue',
        title: 'Duplicate passwords',
        message: `${report.duplicateCount} password(s) are reused across multiple entries.`,
        severity: 'warning'
      })
    }
    for (const r of report.rotationSuggestions.slice(0, 5)) {
      suggestions.push({
        type: 'rotation',
        itemId: r.itemId,
        title: r.title,
        message: r.reason,
        severity: 'info'
      })
    }
    for (const title of report.exposedPatterns.slice(0, 3)) {
      suggestions.push({
        type: 'exposed_secret',
        title,
        message: 'Notes may contain plaintext secrets. Move secrets to dedicated fields.',
        severity: 'critical'
      })
    }
    return suggestions
  }

  async listActivity(): Promise<VaultActivityLog[]> {
    this.requireKey()
    return vaultRepository.listActivity()
  }

  async exportData(options: VaultExportOptions): Promise<string> {
    this.requireKey()
    const rows = await vaultRepository.listItems({
      folderId: options.folderId,
      includeDeleted: false,
      includeArchived: true
    })

    const items: Array<Record<string, unknown>> = []
    for (const row of rows) {
      const tags = await vaultRepository.getItemTags(row.id)
      const listEntry = await this.enrichListEntry(row)
      const record: Record<string, unknown> = {
        ...listEntry,
        tagNames: tags.map((t) => t.name)
      }
      if (options.includeSecrets !== false) {
        const secrets = this.decryptSecrets(row.encryptedData)
        Object.assign(record, secrets)
      }
      items.push(record)
    }

    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      items,
      folders: await vaultRepository.listFolders()
    }

    const json = JSON.stringify(payload, null, 2)
    if (options.format === 'encrypted') {
      if (!options.exportPassword) throw new Error('Export password required')
      const salt = generateSalt()
      const key = await deriveEncryptionKey(options.exportPassword, salt)
      return JSON.stringify({
        version: 1,
        salt,
        data: encryptString(json, key)
      })
    }

    if (options.format === 'csv') {
      const headers = ['title', 'itemType', 'username', 'url', 'folderId', 'tags']
      const lines = [headers.join(',')]
      for (const item of items) {
        lines.push(
          [
            csvEscape(String(item.title)),
            csvEscape(String(item.itemType)),
            csvEscape(String(item.username ?? '')),
            csvEscape(String(item.url ?? '')),
            csvEscape(String(item.folderId ?? '')),
            csvEscape(((item.tagNames as string[]) ?? []).join(';'))
          ].join(',')
        )
      }
      return lines.join('\n')
    }

    return json
  }

  async importData(options: VaultImportOptions): Promise<VaultImportResult> {
    this.requireKey()
    let parsed: unknown
    const errors: string[] = []
    let imported = 0
    let skipped = 0

    try {
      if (options.format === 'encrypted') {
        const wrapper = JSON.parse(options.data) as { salt: string; data: string }
        if (!options.importPassword) throw new Error('Import password required')
        const key = await deriveEncryptionKey(options.importPassword, wrapper.salt)
        const { decryptString } = await import('../crypto/vault-crypto')
        parsed = JSON.parse(decryptString(wrapper.data, key))
      } else if (options.format === 'csv') {
        parsed = parseCsvImport(options.data)
      } else if (options.format === 'bitwarden') {
        parsed = parseBitwardenImport(options.data)
      } else if (options.format === '1password') {
        parsed = parse1PasswordImport(options.data)
      } else if (options.format === 'keepass') {
        parsed = parseKeePassImport(options.data)
      } else {
        parsed = JSON.parse(options.data)
      }
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : 'Invalid import data')
    }

    const data = parsed as { items?: Array<Record<string, unknown>> }
    const items = data.items ?? (Array.isArray(parsed) ? (parsed as Array<Record<string, unknown>>) : [])

    for (const raw of items) {
      try {
        const title = String(raw.title ?? raw.name ?? 'Imported item')
        if (!title) {
          skipped++
          continue
        }
        await this.createItem({
          folderId: options.folderId ?? (raw.folderId as string | null) ?? null,
          itemType: mapImportType(String(raw.itemType ?? raw.type ?? 'password')),
          title,
          secrets: {
            username: String(raw.username ?? raw.login_username ?? ''),
            password: String(raw.password ?? raw.login_password ?? ''),
            url: String(raw.url ?? raw.login_uri ?? ''),
            notes: String(raw.notes ?? raw.note ?? ''),
            apiKey: String(raw.apiKey ?? raw.api_key ?? ''),
            token: String(raw.token ?? '')
          }
        })
        imported++
      } catch (e) {
        errors.push(e instanceof Error ? e.message : 'Import row failed')
        skipped++
      }
    }

    await vaultRepository.logActivity('import', null, 'Vault', `${imported} items imported`)
    return { imported, skipped, errors }
  }

  async getProjectCredentials(projectId: string): Promise<VaultProjectCredentialRef[]> {
    this.requireKey()
    const rows = await vaultRepository.listItems({ projectId })
    return Promise.all(
      rows.map(async (row) => {
        const entry = await this.enrichListEntry(row)
        return {
          itemId: entry.id,
          title: entry.title,
          itemType: entry.itemType,
          username: entry.username,
          url: entry.url
        }
      })
    )
  }

  async changeMasterPassword(currentPassword: string, newPassword: string): Promise<void> {
    const meta = await vaultRepository.getMeta()
    if (!meta) throw new Error('Vault not initialized')
    const valid = await verifyMasterPassword(meta.passwordHash, currentPassword)
    if (!valid) throw new Error('Invalid current password')

    const oldKey = await deriveEncryptionKey(currentPassword, meta.kdfSalt)
    const newKdfSalt = meta.kdfSalt
    const newKey = await deriveEncryptionKey(newPassword, newKdfSalt)

    const rows = await vaultRepository.listItems({ includeDeleted: true, includeArchived: true })
    for (const row of rows) {
      if (!row.encryptedData) continue
      const secrets = decryptJson<VaultItemSecrets>(row.encryptedData, oldKey)
      await vaultRepository.updateItem(row.id, {
        encryptedData: encryptJson(secrets, newKey)
      })
    }

    const passwordHash = await hashMasterPassword(newPassword, meta.kdfSalt)
    const verificationBlob = encryptString(VERIFICATION_PLAINTEXT, newKey)
    await vaultRepository.updateMetaPassword(passwordHash, verificationBlob)
    this.encryptionKey = newKey
    this.resetAutoLockTimer()
  }
}

function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

function mapImportType(type: string): import('@shared/types/vault').VaultItemType {
  const t = type.toLowerCase()
  if (t.includes('ssh')) return 'ssh'
  if (t.includes('database') || t.includes('db')) return 'database'
  if (t.includes('api')) return 'api_key'
  if (t.includes('card')) return 'credit_card'
  if (t.includes('license')) return 'license'
  if (t.includes('identity')) return 'identity'
  if (t.includes('note')) return 'secure_note'
  if (t.includes('server')) return 'server'
  return 'password'
}

function parseCsvImport(data: string): { items: Array<Record<string, unknown>> } {
  const lines = data.trim().split('\n')
  if (lines.length < 2) return { items: [] }
  const headers = lines[0]!.split(',').map((h) => h.trim())
  const items: Array<Record<string, unknown>> = []
  for (const line of lines.slice(1)) {
    const cols = line.split(',')
    const row: Record<string, unknown> = {}
    headers.forEach((h, i) => {
      row[h] = cols[i]?.trim() ?? ''
    })
    items.push(row)
  }
  return { items }
}

function parseBitwardenImport(data: string): { items: Array<Record<string, unknown>> } {
  const parsed = JSON.parse(data) as { items?: Array<Record<string, unknown>> }
  const items = (parsed.items ?? []).map((item) => ({
    title: item.name,
    itemType: item.type === 1 ? 'login' : 'secure_note',
    username: (item.login as Record<string, string> | undefined)?.username,
    password: (item.login as Record<string, string> | undefined)?.password,
    url: (item.login as Record<string, string> | undefined)?.uri,
    notes: item.notes
  }))
  return { items }
}

function parse1PasswordImport(data: string): { items: Array<Record<string, unknown>> } {
  const parsed = JSON.parse(data) as { items?: Array<Record<string, unknown>> }
  return { items: parsed.items ?? [] }
}

function parseKeePassImport(data: string): { items: Array<Record<string, unknown>> } {
  const parsed = JSON.parse(data) as { entries?: Array<Record<string, unknown>> }
  const items = (parsed.entries ?? []).map((e) => ({
    title: e.title ?? e.Title,
    username: e.username ?? e.UserName,
    password: e.password ?? e.Password,
    url: e.url ?? e.URL,
    notes: e.notes ?? e.Notes
  }))
  return { items }
}

export const vaultService = new VaultService()
