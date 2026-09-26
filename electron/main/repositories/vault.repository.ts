import { randomUUID } from 'crypto'
import { getPrismaClient } from '../database/client'
import { ensureVaultTables } from '../database/client'
import type {
  VaultActivityLog,
  VaultFolder,
  VaultHistoryEntry,
  VaultItemListEntry,
  VaultItemSecrets,
  VaultItemType,
  VaultTag
} from '@shared/types/vault'

interface VaultItemRow {
  id: string
  folderId: string | null
  projectId: string | null
  itemType: string
  title: string
  encryptedData: string
  urlPreview: string
  usernamePreview: string
  passwordHash: string
  favorite: number
  isPinned: number
  archivedAt: string | null
  deletedAt: string | null
  expiresAt: string | null
  sortOrder: number
  createdAt: string
  updatedAt: string
  lastUsedAt: string | null
}

interface VaultFolderRow {
  id: string
  parentId: string | null
  name: string
  icon: string
  sortOrder: number
  deletedAt: string | null
  createdAt: string
  updatedAt: string
}

function toIso(v: unknown): string {
  if (v instanceof Date) return v.toISOString()
  return String(v ?? '')
}

function toIsoOrNull(v: unknown): string | null {
  if (v == null) return null
  if (v instanceof Date) return v.toISOString()
  return String(v)
}

/** SQLite via Prisma may return integers as bigint — coerce for IPC serialization. */
function num(value: unknown): number {
  if (value === null || value === undefined) return 0
  const n = typeof value === 'bigint' ? Number(value) : Number(value)
  return Number.isFinite(n) ? n : 0
}

function boolInt(value: unknown): boolean {
  return num(value) === 1
}

export class VaultRepository {
  private async client() {
    await ensureVaultTables()
    return getPrismaClient()
  }

  async getMeta(): Promise<{
    passwordHash: string
    kdfSalt: string
    verificationBlob: string
    hint: string
  } | null> {
    const client = await this.client()
    const rows = await client.$queryRawUnsafe<
      Array<{
        passwordHash: string
        kdfSalt: string
        verificationBlob: string
        hint: string
      }>
    >(`SELECT "passwordHash", "kdfSalt", "verificationBlob", "hint" FROM "VaultMeta" WHERE "id" = 'vault' LIMIT 1`)
    return rows[0] ?? null
  }

  async createMeta(data: {
    passwordHash: string
    kdfSalt: string
    verificationBlob: string
    hint?: string
  }): Promise<void> {
    const client = await this.client()
    await client.$executeRawUnsafe(
      `INSERT INTO "VaultMeta" ("id", "passwordHash", "kdfSalt", "verificationBlob", "hint")
       VALUES ('vault', ?, ?, ?, ?)`,
      data.passwordHash,
      data.kdfSalt,
      data.verificationBlob,
      data.hint ?? ''
    )
  }

  async updateMetaPassword(passwordHash: string, verificationBlob: string): Promise<void> {
    const client = await this.client()
    await client.$executeRawUnsafe(
      `UPDATE "VaultMeta" SET "passwordHash" = ?, "verificationBlob" = ?, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'vault'`,
      passwordHash,
      verificationBlob
    )
  }

  async getSettings(): Promise<{ autoLockMinutes: number; clipboardClearSeconds: number }> {
    const client = await this.client()
    const rows = await client.$queryRawUnsafe<
      Array<{ autoLockMinutes: number; clipboardClearSeconds: number }>
    >(
      `SELECT "autoLockMinutes", "clipboardClearSeconds" FROM "VaultSettings" WHERE "id" = 'settings' LIMIT 1`
    )
    if (rows[0]) {
      return {
        autoLockMinutes: num(rows[0].autoLockMinutes),
        clipboardClearSeconds: num(rows[0].clipboardClearSeconds)
      }
    }
    await client.$executeRawUnsafe(
      `INSERT OR IGNORE INTO "VaultSettings" ("id") VALUES ('settings')`
    )
    return { autoLockMinutes: 10, clipboardClearSeconds: 30 }
  }

  async updateSettings(autoLockMinutes: number, clipboardClearSeconds: number): Promise<void> {
    const client = await this.client()
    await client.$executeRawUnsafe(
      `INSERT INTO "VaultSettings" ("id", "autoLockMinutes", "clipboardClearSeconds", "updatedAt")
       VALUES ('settings', ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT("id") DO UPDATE SET
         "autoLockMinutes" = excluded."autoLockMinutes",
         "clipboardClearSeconds" = excluded."clipboardClearSeconds",
         "updatedAt" = CURRENT_TIMESTAMP`,
      autoLockMinutes,
      clipboardClearSeconds
    )
  }

  async seedDefaultFolders(): Promise<void> {
    const client = await this.client()
    const count = await client.$queryRawUnsafe<Array<{ c: number }>>(
      `SELECT COUNT(*) as c FROM "vault_folders" WHERE "deletedAt" IS NULL`
    )
    if ((count[0]?.c ?? 0) > 0) return

    const { DEFAULT_VAULT_FOLDERS } = await import('../database/vault-schema')
    for (const folder of DEFAULT_VAULT_FOLDERS) {
      await client.$executeRawUnsafe(
        `INSERT INTO "vault_folders" ("id", "name", "icon", "sortOrder") VALUES (?, ?, ?, ?)`,
        randomUUID(),
        folder.name,
        folder.icon,
        folder.sortOrder
      )
    }
  }

  async listFolders(includeDeleted = false): Promise<VaultFolder[]> {
    const client = await this.client()
    const rows = await client.$queryRawUnsafe<VaultFolderRow[]>(
      includeDeleted
        ? `SELECT * FROM "vault_folders" ORDER BY "sortOrder" ASC, "name" ASC`
        : `SELECT * FROM "vault_folders" WHERE "deletedAt" IS NULL ORDER BY "sortOrder" ASC, "name" ASC`
    )
    return rows.map((r) => ({
      id: r.id,
      parentId: r.parentId,
      name: r.name,
      icon: r.icon,
      sortOrder: num(r.sortOrder),
      createdAt: toIso(r.createdAt),
      updatedAt: toIso(r.updatedAt),
      deletedAt: toIsoOrNull(r.deletedAt)
    }))
  }

  async createFolder(input: {
    name: string
    parentId?: string | null
    icon?: string
    sortOrder?: number
  }): Promise<VaultFolder> {
    const client = await this.client()
    const id = randomUUID()
    const maxOrder = await client.$queryRawUnsafe<Array<{ m: number | null }>>(
      input.parentId
        ? `SELECT MAX("sortOrder") as m FROM "vault_folders" WHERE "parentId" = ?`
        : `SELECT MAX("sortOrder") as m FROM "vault_folders" WHERE "parentId" IS NULL`,
      ...(input.parentId ? [input.parentId] : [])
    )
    const sortOrder = input.sortOrder ?? (maxOrder[0]?.m ?? -1) + 1
    await client.$executeRawUnsafe(
      `INSERT INTO "vault_folders" ("id", "parentId", "name", "icon", "sortOrder")
       VALUES (?, ?, ?, ?, ?)`,
      id,
      input.parentId ?? null,
      input.name,
      input.icon ?? 'folder',
      sortOrder
    )
    const folders = await this.listFolders()
    return folders.find((f) => f.id === id)!
  }

  async updateFolder(
    id: string,
    data: Partial<{ name: string; parentId: string | null; icon: string; sortOrder: number; deletedAt: string | null }>
  ): Promise<VaultFolder | null> {
    const client = await this.client()
    const existing = await client.$queryRawUnsafe<VaultFolderRow[]>(
      `SELECT * FROM "vault_folders" WHERE "id" = ? LIMIT 1`,
      id
    )
    if (!existing[0]) return null
    const row = existing[0]
    await client.$executeRawUnsafe(
      `UPDATE "vault_folders" SET
        "name" = ?, "parentId" = ?, "icon" = ?, "sortOrder" = ?,
        "deletedAt" = ?, "updatedAt" = CURRENT_TIMESTAMP
       WHERE "id" = ?`,
      data.name ?? row.name,
      data.parentId !== undefined ? data.parentId : row.parentId,
      data.icon ?? row.icon,
      data.sortOrder ?? row.sortOrder,
      data.deletedAt !== undefined ? data.deletedAt : row.deletedAt,
      id
    )
    const folders = await this.listFolders(true)
    return folders.find((f) => f.id === id) ?? null
  }

  async reorderFolders(orderedIds: string[]): Promise<void> {
    const client = await this.client()
    for (let i = 0; i < orderedIds.length; i++) {
      await client.$executeRawUnsafe(
        `UPDATE "vault_folders" SET "sortOrder" = ?, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = ?`,
        i,
        orderedIds[i]
      )
    }
  }

  async listTags(): Promise<VaultTag[]> {
    const client = await this.client()
    const rows = await client.$queryRawUnsafe<
      Array<{ id: string; name: string; color: string; createdAt: unknown }>
    >(`SELECT * FROM "vault_tags" ORDER BY "name" ASC`)
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      color: r.color,
      createdAt: toIso(r.createdAt)
    }))
  }

  async upsertTag(name: string, color = '#6366f1'): Promise<VaultTag> {
    const client = await this.client()
    const existing = await client.$queryRawUnsafe<
      Array<{ id: string; name: string; color: string; createdAt: unknown }>
    >(`SELECT * FROM "vault_tags" WHERE LOWER("name") = LOWER(?) LIMIT 1`, name)
    if (existing[0]) {
      return {
        id: existing[0].id,
        name: existing[0].name,
        color: existing[0].color,
        createdAt: toIso(existing[0].createdAt)
      }
    }
    const id = randomUUID()
    await client.$executeRawUnsafe(
      `INSERT INTO "vault_tags" ("id", "name", "color") VALUES (?, ?, ?)`,
      id,
      name,
      color
    )
    return { id, name, color, createdAt: new Date().toISOString() }
  }

  async setItemTags(itemId: string, tagIds: string[]): Promise<void> {
    const client = await this.client()
    await client.$executeRawUnsafe(`DELETE FROM "vault_item_tags" WHERE "itemId" = ?`, itemId)
    for (const tagId of tagIds) {
      await client.$executeRawUnsafe(
        `INSERT OR IGNORE INTO "vault_item_tags" ("itemId", "tagId") VALUES (?, ?)`,
        itemId,
        tagId
      )
    }
  }

  async getItemTags(itemId: string): Promise<VaultTag[]> {
    const client = await this.client()
    const rows = await client.$queryRawUnsafe<
      Array<{ id: string; name: string; color: string; createdAt: unknown }>
    >(
      `SELECT t.* FROM "vault_tags" t
       INNER JOIN "vault_item_tags" it ON it."tagId" = t."id"
       WHERE it."itemId" = ?`,
      itemId
    )
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      color: r.color,
      createdAt: toIso(r.createdAt)
    }))
  }

  async listItems(filter?: {
    folderId?: string | null
    projectId?: string | null
    includeDeleted?: boolean
    includeArchived?: boolean
    favoritesOnly?: boolean
    recentLimit?: number
  }): Promise<VaultItemRow[]> {
    const client = await this.client()
    const conditions: string[] = []
    const params: unknown[] = []

    if (!filter?.includeDeleted) {
      conditions.push(`"deletedAt" IS NULL`)
    }
    if (!filter?.includeArchived) {
      conditions.push(`"archivedAt" IS NULL`)
    }
    if (filter?.folderId !== undefined) {
      if (filter.folderId === null) {
        conditions.push(`"folderId" IS NULL`)
      } else {
        conditions.push(`"folderId" = ?`)
        params.push(filter.folderId)
      }
    }
    if (filter?.projectId) {
      conditions.push(`"projectId" = ?`)
      params.push(filter.projectId)
    }
    if (filter?.favoritesOnly) {
      conditions.push(`"favorite" = 1`)
    }

    let sql = `SELECT * FROM "vault_items"`
    if (conditions.length) sql += ` WHERE ${conditions.join(' AND ')}`
    sql += ` ORDER BY "isPinned" DESC, "sortOrder" ASC, "title" ASC`
    if (filter?.recentLimit) {
      sql += ` LIMIT ${filter.recentLimit}`
    }

    return client.$queryRawUnsafe<VaultItemRow[]>(sql, ...params)
  }

  async getItem(id: string): Promise<VaultItemRow | null> {
    const client = await this.client()
    const rows = await client.$queryRawUnsafe<VaultItemRow[]>(
      `SELECT * FROM "vault_items" WHERE "id" = ? LIMIT 1`,
      id
    )
    return rows[0] ?? null
  }

  async createItem(data: {
    folderId?: string | null
    projectId?: string | null
    itemType: VaultItemType
    title: string
    encryptedData: string
    urlPreview: string
    usernamePreview: string
    passwordHash: string
    expiresAt?: string | null
    sortOrder?: number
  }): Promise<string> {
    const client = await this.client()
    const id = randomUUID()
    await client.$executeRawUnsafe(
      `INSERT INTO "vault_items" (
        "id", "folderId", "projectId", "itemType", "title", "encryptedData",
        "urlPreview", "usernamePreview", "passwordHash", "expiresAt", "sortOrder"
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      data.folderId ?? null,
      data.projectId ?? null,
      data.itemType,
      data.title,
      data.encryptedData,
      data.urlPreview,
      data.usernamePreview,
      data.passwordHash,
      data.expiresAt ?? null,
      data.sortOrder ?? 0
    )
    return id
  }

  async updateItem(
    id: string,
    data: Partial<{
      folderId: string | null
      projectId: string | null
      itemType: VaultItemType
      title: string
      encryptedData: string
      urlPreview: string
      usernamePreview: string
      passwordHash: string
      favorite: boolean
      isPinned: boolean
      archivedAt: string | null
      deletedAt: string | null
      expiresAt: string | null
      sortOrder: number
      lastUsedAt: string | null
    }>
  ): Promise<void> {
    const client = await this.client()
    const row = await this.getItem(id)
    if (!row) throw new Error('Vault item not found')

    await client.$executeRawUnsafe(
      `UPDATE "vault_items" SET
        "folderId" = ?, "projectId" = ?, "itemType" = ?, "title" = ?,
        "encryptedData" = ?, "urlPreview" = ?, "usernamePreview" = ?,
        "passwordHash" = ?, "favorite" = ?, "isPinned" = ?,
        "archivedAt" = ?, "deletedAt" = ?, "expiresAt" = ?,
        "sortOrder" = ?, "lastUsedAt" = ?, "updatedAt" = CURRENT_TIMESTAMP
       WHERE "id" = ?`,
      data.folderId !== undefined ? data.folderId : row.folderId,
      data.projectId !== undefined ? data.projectId : row.projectId,
      data.itemType ?? row.itemType,
      data.title ?? row.title,
      data.encryptedData ?? row.encryptedData,
      data.urlPreview ?? row.urlPreview,
      data.usernamePreview ?? row.usernamePreview,
      data.passwordHash ?? row.passwordHash,
      data.favorite !== undefined ? (data.favorite ? 1 : 0) : row.favorite,
      data.isPinned !== undefined ? (data.isPinned ? 1 : 0) : row.isPinned,
      data.archivedAt !== undefined ? data.archivedAt : row.archivedAt,
      data.deletedAt !== undefined ? data.deletedAt : row.deletedAt,
      data.expiresAt !== undefined ? data.expiresAt : row.expiresAt,
      data.sortOrder ?? row.sortOrder,
      data.lastUsedAt !== undefined ? data.lastUsedAt : row.lastUsedAt,
      id
    )
  }

  async deleteItemPermanent(id: string): Promise<void> {
    const client = await this.client()
    await client.$executeRawUnsafe(`DELETE FROM "vault_items" WHERE "id" = ?`, id)
  }

  async reorderItems(orderedIds: string[]): Promise<void> {
    const client = await this.client()
    for (let i = 0; i < orderedIds.length; i++) {
      await client.$executeRawUnsafe(
        `UPDATE "vault_items" SET "sortOrder" = ?, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = ?`,
        i,
        orderedIds[i]
      )
    }
  }

  async addHistory(entry: {
    itemId: string
    encryptedPassword: string
    passwordHint: string
    changeReason?: string
  }): Promise<void> {
    const client = await this.client()
    await client.$executeRawUnsafe(
      `INSERT INTO "vault_history" ("id", "itemId", "encryptedPassword", "passwordHint", "changeReason")
       VALUES (?, ?, ?, ?, ?)`,
      randomUUID(),
      entry.itemId,
      entry.encryptedPassword,
      entry.passwordHint,
      entry.changeReason ?? ''
    )
  }

  async listHistory(itemId: string): Promise<VaultHistoryEntry[]> {
    const client = await this.client()
    const rows = await client.$queryRawUnsafe<
      Array<{ id: string; itemId: string; passwordHint: string; changeReason: string; changedAt: unknown }>
    >(
      `SELECT "id", "itemId", "passwordHint", "changeReason", "changedAt"
       FROM "vault_history" WHERE "itemId" = ? ORDER BY "changedAt" DESC LIMIT 20`,
      itemId
    )
    return rows.map((r) => ({
      id: r.id,
      itemId: r.itemId,
      passwordHint: r.passwordHint,
      changeReason: r.changeReason,
      changedAt: toIso(r.changedAt)
    }))
  }

  async getHistoryPassword(id: string): Promise<string | null> {
    const client = await this.client()
    const rows = await client.$queryRawUnsafe<Array<{ encryptedPassword: string }>>(
      `SELECT "encryptedPassword" FROM "vault_history" WHERE "id" = ? LIMIT 1`,
      id
    )
    return rows[0]?.encryptedPassword ?? null
  }

  async logActivity(action: string, itemId: string | null, itemTitle: string, details = ''): Promise<void> {
    const client = await this.client()
    await client.$executeRawUnsafe(
      `INSERT INTO "vault_activity_logs" ("id", "action", "itemId", "itemTitle", "details")
       VALUES (?, ?, ?, ?, ?)`,
      randomUUID(),
      action,
      itemId,
      itemTitle,
      details
    )
  }

  async listActivity(limit = 50): Promise<VaultActivityLog[]> {
    const client = await this.client()
    const rows = await client.$queryRawUnsafe<
      Array<{
        id: string
        action: string
        itemId: string | null
        itemTitle: string
        details: string
        createdAt: unknown
      }>
    >(
      `SELECT * FROM "vault_activity_logs" ORDER BY "createdAt" DESC LIMIT ?`,
      limit
    )
    return rows.map((r) => ({
      id: r.id,
      action: r.action,
      itemId: r.itemId,
      itemTitle: r.itemTitle,
      details: r.details,
      createdAt: toIso(r.createdAt)
    }))
  }

  async setFavoritePin(itemId: string, pinnedOrder: number): Promise<void> {
    const client = await this.client()
    await client.$executeRawUnsafe(
      `INSERT OR REPLACE INTO "vault_favorites" ("itemId", "pinnedOrder") VALUES (?, ?)`,
      itemId,
      pinnedOrder
    )
  }

  async removeFavoritePin(itemId: string): Promise<void> {
    const client = await this.client()
    await client.$executeRawUnsafe(`DELETE FROM "vault_favorites" WHERE "itemId" = ?`, itemId)
  }

  rowToListEntry(
    row: VaultItemRow,
    tags: VaultTag[],
    passwordStrength: number,
    isWeak: boolean,
    isDuplicate: boolean
  ): VaultItemListEntry {
    const now = Date.now()
    const isExpired = row.expiresAt ? new Date(row.expiresAt).getTime() < now : false
    return {
      id: row.id,
      folderId: row.folderId,
      projectId: row.projectId,
      itemType: row.itemType as VaultItemType,
      title: row.title,
      url: row.urlPreview,
      username: row.usernamePreview,
      favorite: boolInt(row.favorite),
      isPinned: boolInt(row.isPinned),
      archivedAt: toIsoOrNull(row.archivedAt),
      deletedAt: toIsoOrNull(row.deletedAt),
      expiresAt: toIsoOrNull(row.expiresAt),
      sortOrder: num(row.sortOrder),
      tagIds: tags.map((t) => t.id),
      tagNames: tags.map((t) => t.name),
      createdAt: toIso(row.createdAt),
      updatedAt: toIso(row.updatedAt),
      lastUsedAt: toIsoOrNull(row.lastUsedAt),
      hasPassword: Boolean(row.passwordHash),
      passwordStrength,
      isWeak,
      isDuplicate,
      isExpired
    }
  }

  emptySecrets(): VaultItemSecrets {
    return {
      username: '',
      password: '',
      url: '',
      notes: '',
      email: '',
      phone: '',
      apiKey: '',
      secretKey: '',
      privateKey: '',
      publicKey: '',
      jwtSecret: '',
      databaseUsername: '',
      databasePassword: '',
      sshUsername: '',
      sshPassword: '',
      token: ''
    }
  }
}

export const vaultRepository = new VaultRepository()
