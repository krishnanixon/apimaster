import { v4 as uuidv4 } from 'uuid'
import { getPrismaClient } from '../database/client'
import { ensureDbWorkspaceTables } from '../database/db-workspace-init'
import { encryptDbSecrets, decryptDbSecrets } from '../database-workspace/db-workspace-crypto'
import type { AppScope } from '@shared/types/scope'
import type {
  CreateDbConnectionInput,
  DbConnection,
  DbConnectionFolder,
  DbConnectionSecrets,
  DbQueryHistoryEntry,
  DbSavedQuery,
  DbSchemaSnapshot,
  DbTableLink,
  DbWorkspaceSettings,
  UpdateDbConnectionInput
} from '@shared/types/database-workspace'
import { DEFAULT_DB_WORKSPACE_SETTINGS } from '@shared/types/database-workspace'

/**
 * Columns declared DATETIME come back from Prisma raw queries as `Date` objects,
 * not the strings the row types claim. Normalize at the boundary so the renderer
 * always receives ISO strings.
 */
function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString()
  return value == null ? '' : String(value)
}

function toIsoOrNull(value: unknown): string | null {
  return value == null ? null : toIso(value)
}

interface DbConnectionRow {
  id: string
  name: string
  provider: string
  scope: string
  projectId: string | null
  folderId: string | null
  configJson: string
  encryptedSecrets: string | null
  vaultItemId: string | null
  notes: string
  tagsJson: string
  isFavorite: number
  health: string
  latencyMs: number | null
  driverVersion: string | null
  lastConnectedAt: string | null
  sortOrder: number
  createdAt: string
  updatedAt: string
}

function serializeConnection(row: DbConnectionRow): DbConnection {
  return {
    id: row.id,
    name: row.name,
    provider: row.provider as DbConnection['provider'],
    scope: row.scope as AppScope,
    projectId: row.projectId,
    folderId: row.folderId,
    config: JSON.parse(row.configJson || '{}'),
    notes: row.notes,
    tags: JSON.parse(row.tagsJson || '[]'),
    isFavorite: row.isFavorite === 1,
    vaultItemId: row.vaultItemId,
    health: row.health as DbConnection['health'],
    latencyMs: row.latencyMs,
    driverVersion: row.driverVersion,
    lastConnectedAt: toIsoOrNull(row.lastConnectedAt),
    sortOrder: row.sortOrder,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt)
  }
}

function mergeWorkspaceSettings(parsed: Partial<DbWorkspaceSettings>): DbWorkspaceSettings {
  const { password: _defaultPassword, ...defaultConnWithoutPassword } =
    DEFAULT_DB_WORKSPACE_SETTINGS.defaultConnection
  const merged: DbWorkspaceSettings = {
    ...DEFAULT_DB_WORKSPACE_SETTINGS,
    ...parsed,
    defaultConnection: {
      ...defaultConnWithoutPassword,
      ...(parsed.defaultConnection ?? {}),
      password: ''
    },
    sshDefaults: {
      ...DEFAULT_DB_WORKSPACE_SETTINGS.sshDefaults,
      ...(parsed.sshDefaults ?? {})
    }
  }

  if (parsed.defaultConnectionPasswordEnc) {
    try {
      const secrets = decryptDbSecrets(parsed.defaultConnectionPasswordEnc)
      if (secrets.password) {
        merged.defaultConnection.password = secrets.password
      }
    } catch {
      // keep merged password from JSON or defaults
    }
  }

  return merged
}

function settingsForStorage(settings: DbWorkspaceSettings, existingEnc?: string | null): DbWorkspaceSettings {
  const password = settings.defaultConnection?.password?.trim()
  const stored: DbWorkspaceSettings = {
    ...settings,
    defaultConnection: {
      ...settings.defaultConnection,
      password: ''
    }
  }

  if (password) {
    stored.defaultConnectionPasswordEnc = encryptDbSecrets({ password })
  } else if (existingEnc) {
    stored.defaultConnectionPasswordEnc = existingEnc
  }

  return stored
}

export class DbWorkspaceRepository {
  private async db() {
    await ensureDbWorkspaceTables()
    return getPrismaClient()
  }

  async listConnections(filter?: { scope?: AppScope; projectId?: string | null }): Promise<DbConnection[]> {
    const client = await this.db()
    let sql = `SELECT * FROM "DbConnection" WHERE 1=1`
    const params: unknown[] = []
    if (filter?.scope) {
      sql += ` AND "scope" = ?`
      params.push(filter.scope)
    }
    if (filter?.projectId !== undefined) {
      if (filter.projectId === null) {
        sql += ` AND "projectId" IS NULL`
      } else {
        sql += ` AND "projectId" = ?`
        params.push(filter.projectId)
      }
    }
    sql += ` ORDER BY "sortOrder" ASC, "name" ASC`
    const rows = await client.$queryRawUnsafe<DbConnectionRow[]>(sql, ...params)
    return rows.map(serializeConnection)
  }

  async getConnection(id: string): Promise<DbConnection | null> {
    const client = await this.db()
    const rows = await client.$queryRawUnsafe<DbConnectionRow[]>(
      `SELECT * FROM "DbConnection" WHERE "id" = ?`,
      id
    )
    return rows[0] ? serializeConnection(rows[0]) : null
  }

  async getConnectionSecrets(id: string): Promise<DbConnectionSecrets> {
    const client = await this.db()
    const rows = await client.$queryRawUnsafe<Array<{ encryptedSecrets: string | null }>>(
      `SELECT "encryptedSecrets" FROM "DbConnection" WHERE "id" = ?`,
      id
    )
    const blob = rows[0]?.encryptedSecrets
    if (!blob) return {}
    return decryptDbSecrets(blob)
  }

  async createConnection(input: CreateDbConnectionInput): Promise<DbConnection> {
    const client = await this.db()
    const id = uuidv4()
    const now = new Date().toISOString()
    const encryptedSecrets = input.secrets ? encryptDbSecrets(input.secrets) : null
    const countRows = await client.$queryRawUnsafe<Array<{ cnt: number }>>(
      `SELECT COUNT(*) AS cnt FROM "DbConnection"`
    )
    const sortOrder = Number(countRows[0]?.cnt ?? 0)

    await client.$executeRawUnsafe(
      `INSERT INTO "DbConnection" ("id","name","provider","scope","projectId","folderId","configJson","encryptedSecrets","vaultItemId","notes","tagsJson","sortOrder","createdAt","updatedAt")
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      id,
      input.name,
      input.provider,
      input.scope,
      input.projectId ?? null,
      input.folderId ?? null,
      JSON.stringify(input.config),
      encryptedSecrets,
      input.vaultItemId ?? null,
      input.notes ?? '',
      JSON.stringify(input.tags ?? []),
      sortOrder,
      now,
      now
    )
    const created = await this.getConnection(id)
    if (!created) throw new Error('Failed to create connection')
    return created
  }

  async updateConnection(id: string, input: UpdateDbConnectionInput): Promise<DbConnection | null> {
    const existing = await this.getConnection(id)
    if (!existing) return null
    const client = await this.db()
    const now = new Date().toISOString()

    const name = input.name ?? existing.name
    const folderId = input.folderId !== undefined ? input.folderId : existing.folderId
    const configJson = input.config ? JSON.stringify(input.config) : JSON.stringify(existing.config)
    const notes = input.notes ?? existing.notes
    const tagsJson = input.tags ? JSON.stringify(input.tags) : JSON.stringify(existing.tags)
    const isFavorite = input.isFavorite !== undefined ? (input.isFavorite ? 1 : 0) : (existing.isFavorite ? 1 : 0)
    const vaultItemId = input.vaultItemId !== undefined ? input.vaultItemId : existing.vaultItemId

    let encryptedUpdate = ''
    const params: unknown[] = [name, folderId, configJson, notes, tagsJson, isFavorite, vaultItemId, now, id]

    if (input.secrets !== undefined) {
      encryptedUpdate = `, "encryptedSecrets" = ?`
      params.splice(8, 0, encryptDbSecrets(input.secrets))
    }

    await client.$executeRawUnsafe(
      `UPDATE "DbConnection" SET "name"=?, "folderId"=?, "configJson"=?, "notes"=?, "tagsJson"=?, "isFavorite"=?, "vaultItemId"=?${encryptedUpdate}, "updatedAt"=? WHERE "id"=?`,
      ...params
    )
    return this.getConnection(id)
  }

  async deleteConnection(id: string): Promise<boolean> {
    const client = await this.db()
    await client.$executeRawUnsafe(`DELETE FROM "DbConnection" WHERE "id" = ?`, id)
    return true
  }

  async duplicateConnection(id: string): Promise<DbConnection | null> {
    const existing = await this.getConnection(id)
    if (!existing) return null
    const secrets = await this.getConnectionSecrets(id)
    return this.createConnection({
      name: `${existing.name} (Copy)`,
      provider: existing.provider,
      scope: existing.scope,
      projectId: existing.projectId,
      folderId: existing.folderId,
      config: { ...existing.config },
      notes: existing.notes,
      tags: [...existing.tags],
      secrets: Object.keys(secrets).length ? secrets : undefined,
      vaultItemId: existing.vaultItemId
    })
  }

  async updateConnectionHealth(
    id: string,
    health: DbConnection['health'],
    latencyMs: number | null,
    driverVersion: string | null
  ): Promise<void> {
    const client = await this.db()
    const now = new Date().toISOString()
    await client.$executeRawUnsafe(
      `UPDATE "DbConnection" SET "health"=?, "latencyMs"=?, "driverVersion"=?, "lastConnectedAt"=?, "updatedAt"=? WHERE "id"=?`,
      health,
      latencyMs,
      driverVersion,
      now,
      now,
      id
    )
  }

  async listFolders(filter?: { scope?: AppScope; projectId?: string | null }): Promise<DbConnectionFolder[]> {
    const client = await this.db()
    let sql = `SELECT * FROM "DbConnectionFolder" WHERE 1=1`
    const params: unknown[] = []
    if (filter?.scope) {
      sql += ` AND "scope" = ?`
      params.push(filter.scope)
    }
    if (filter?.projectId !== undefined) {
      if (filter.projectId === null) sql += ` AND "projectId" IS NULL`
      else {
        sql += ` AND "projectId" = ?`
        params.push(filter.projectId)
      }
    }
    sql += ` ORDER BY "sortOrder" ASC`
    const rows = await client.$queryRawUnsafe<
      Array<{
        id: string
        name: string
        scope: string
        projectId: string | null
        parentId: string | null
        sortOrder: number
        createdAt: string
        updatedAt: string
      }>
    >(sql, ...params)
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      scope: r.scope as AppScope,
      projectId: r.projectId,
      parentId: r.parentId,
      sortOrder: r.sortOrder,
      createdAt: toIso(r.createdAt),
      updatedAt: toIso(r.updatedAt)
    }))
  }

  async createFolder(input: {
    name: string
    scope: AppScope
    projectId?: string | null
    parentId?: string | null
  }): Promise<DbConnectionFolder> {
    const client = await this.db()
    const id = uuidv4()
    const now = new Date().toISOString()
    await client.$executeRawUnsafe(
      `INSERT INTO "DbConnectionFolder" ("id","name","scope","projectId","parentId","createdAt","updatedAt") VALUES (?,?,?,?,?,?,?)`,
      id,
      input.name,
      input.scope,
      input.projectId ?? null,
      input.parentId ?? null,
      now,
      now
    )
    const folders = await this.listFolders()
    const folder = folders.find((f) => f.id === id)
    if (!folder) throw new Error('Failed to create folder')
    return folder
  }

  async getSettings(): Promise<DbWorkspaceSettings> {
    const client = await this.db()
    const rows = await client.$queryRawUnsafe<Array<{ settingsJson: string }>>(
      `SELECT "settingsJson" FROM "DbWorkspaceSettings" WHERE "id" = 'default'`
    )
    if (!rows[0]) {
      await client.$executeRawUnsafe(
        `INSERT INTO "DbWorkspaceSettings" ("id","settingsJson") VALUES ('default', ?)`,
        JSON.stringify(settingsForStorage(DEFAULT_DB_WORKSPACE_SETTINGS))
      )
      return { ...DEFAULT_DB_WORKSPACE_SETTINGS }
    }
    return mergeWorkspaceSettings(JSON.parse(rows[0].settingsJson || '{}') as Partial<DbWorkspaceSettings>)
  }

  async saveSettings(settings: Partial<DbWorkspaceSettings>): Promise<DbWorkspaceSettings> {
    const client = await this.db()
    const rows = await client.$queryRawUnsafe<Array<{ settingsJson: string }>>(
      `SELECT "settingsJson" FROM "DbWorkspaceSettings" WHERE "id" = 'default'`
    )
    const raw = rows[0]
      ? (JSON.parse(rows[0].settingsJson || '{}') as Partial<DbWorkspaceSettings>)
      : {}
    const existingEnc = raw.defaultConnectionPasswordEnc ?? null

    const current = await this.getSettings()
    const merged = mergeWorkspaceSettings({
      ...current,
      ...settings,
      ...(settings.defaultConnection
        ? {
            defaultConnection: {
              ...current.defaultConnection,
              ...settings.defaultConnection
            }
          }
        : {})
    })

    if (settings.defaultConnection) {
      const incomingPassword = settings.defaultConnection.password?.trim()
      if (!incomingPassword && current.defaultConnection.password) {
        merged.defaultConnection.password = current.defaultConnection.password
      }
    }

    const now = new Date().toISOString()
    await client.$executeRawUnsafe(
      `INSERT INTO "DbWorkspaceSettings" ("id","settingsJson","updatedAt") VALUES ('default', ?, ?)
       ON CONFLICT("id") DO UPDATE SET "settingsJson"=excluded."settingsJson", "updatedAt"=excluded."updatedAt"`,
      JSON.stringify(settingsForStorage(merged, existingEnc)),
      now
    )
    return merged
  }

  async addQueryHistory(entry: Omit<DbQueryHistoryEntry, 'id'>): Promise<DbQueryHistoryEntry> {
    const client = await this.db()
    const id = uuidv4()
    await client.$executeRawUnsafe(
      `INSERT INTO "DbQueryHistory" ("id","connectionId","sql","executionTimeMs","rowCount","success","error","executedAt") VALUES (?,?,?,?,?,?,?,?)`,
      id,
      entry.connectionId,
      entry.sql,
      entry.executionTimeMs,
      entry.rowCount,
      entry.success ? 1 : 0,
      entry.error,
      entry.executedAt
    )
    const settings = await this.getSettings()
    await client.$executeRawUnsafe(
      `DELETE FROM "DbQueryHistory" WHERE "id" NOT IN (
        SELECT "id" FROM "DbQueryHistory" ORDER BY "executedAt" DESC LIMIT ?
      )`,
      settings.queryHistoryLimit
    )
    return { id, ...entry }
  }

  async listQueryHistory(connectionId?: string, limit = 100): Promise<DbQueryHistoryEntry[]> {
    const client = await this.db()
    let sql = `SELECT * FROM "DbQueryHistory"`
    const params: unknown[] = []
    if (connectionId) {
      sql += ` WHERE "connectionId" = ?`
      params.push(connectionId)
    }
    sql += ` ORDER BY "executedAt" DESC LIMIT ?`
    params.push(limit)
    const rows = await client.$queryRawUnsafe<
      Array<{
        id: string
        connectionId: string
        sql: string
        executionTimeMs: number
        rowCount: number
        success: number
        error: string | null
        executedAt: string
      }>
    >(sql, ...params)
    return rows.map((r) => ({
      id: r.id,
      connectionId: r.connectionId,
      sql: r.sql,
      executionTimeMs: r.executionTimeMs,
      rowCount: r.rowCount,
      success: r.success === 1,
      error: r.error,
      executedAt: toIso(r.executedAt)
    }))
  }

  async listSavedQueries(filter?: { scope?: AppScope; projectId?: string | null }): Promise<DbSavedQuery[]> {
    const client = await this.db()
    let sql = `SELECT * FROM "DbSavedQuery" WHERE 1=1`
    const params: unknown[] = []
    if (filter?.scope) {
      sql += ` AND "scope" = ?`
      params.push(filter.scope)
    }
    if (filter?.projectId !== undefined) {
      if (filter.projectId === null) sql += ` AND "projectId" IS NULL`
      else {
        sql += ` AND "projectId" = ?`
        params.push(filter.projectId)
      }
    }
    sql += ` ORDER BY "sortOrder" ASC, "name" ASC`
    const rows = await client.$queryRawUnsafe<
      Array<{
        id: string
        connectionId: string | null
        scope: string
        projectId: string | null
        name: string
        sql: string
        folderId: string | null
        tagsJson: string
        isFavorite: number
        isPinned: number
        sortOrder: number
        createdAt: string
        updatedAt: string
      }>
    >(sql, ...params)
    return rows.map((r) => ({
      id: r.id,
      connectionId: r.connectionId,
      scope: r.scope as AppScope,
      projectId: r.projectId,
      name: r.name,
      sql: r.sql,
      folderId: r.folderId,
      tags: JSON.parse(r.tagsJson || '[]'),
      isFavorite: r.isFavorite === 1,
      isPinned: r.isPinned === 1,
      sortOrder: r.sortOrder,
      createdAt: toIso(r.createdAt),
      updatedAt: toIso(r.updatedAt)
    }))
  }

  async saveQuery(input: Omit<DbSavedQuery, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<DbSavedQuery> {
    const client = await this.db()
    const id = input.id ?? uuidv4()
    const now = new Date().toISOString()
    const existing = input.id
      ? await client.$queryRawUnsafe<Array<{ id: string }>>(`SELECT "id" FROM "DbSavedQuery" WHERE "id" = ?`, input.id)
      : []
    if (existing.length) {
      await client.$executeRawUnsafe(
        `UPDATE "DbSavedQuery" SET "connectionId"=?, "name"=?, "sql"=?, "folderId"=?, "tagsJson"=?, "isFavorite"=?, "isPinned"=?, "updatedAt"=? WHERE "id"=?`,
        input.connectionId,
        input.name,
        input.sql,
        input.folderId,
        JSON.stringify(input.tags),
        input.isFavorite ? 1 : 0,
        input.isPinned ? 1 : 0,
        now,
        id
      )
    } else {
      await client.$executeRawUnsafe(
        `INSERT INTO "DbSavedQuery" ("id","connectionId","scope","projectId","name","sql","folderId","tagsJson","isFavorite","isPinned","sortOrder","createdAt","updatedAt")
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        id,
        input.connectionId,
        input.scope,
        input.projectId,
        input.name,
        input.sql,
        input.folderId,
        JSON.stringify(input.tags),
        input.isFavorite ? 1 : 0,
        input.isPinned ? 1 : 0,
        input.sortOrder,
        now,
        now
      )
    }
    const queries = await this.listSavedQueries()
    const saved = queries.find((q) => q.id === id)
    if (!saved) throw new Error('Failed to save query')
    return saved
  }

  async deleteSavedQuery(id: string): Promise<void> {
    const client = await this.db()
    await client.$executeRawUnsafe(`DELETE FROM "DbSavedQuery" WHERE "id" = ?`, id)
  }

  async listTableLinks(connectionId: string, table?: string): Promise<DbTableLink[]> {
    const client = await this.db()
    let sql = `SELECT * FROM "DbTableLink" WHERE "connectionId" = ?`
    const params: unknown[] = [connectionId]
    if (table) {
      sql += ` AND "table" = ?`
      params.push(table)
    }
    const rows = await client.$queryRawUnsafe<
      Array<{
        id: string
        connectionId: string
        database: string
        schema: string
        table: string
        linkType: string
        targetId: string
        targetLabel: string
        createdAt: string
      }>
    >(sql, ...params)
    return rows.map((r) => ({
      id: r.id,
      connectionId: r.connectionId,
      database: r.database,
      schema: r.schema,
      table: r.table,
      linkType: r.linkType as DbTableLink['linkType'],
      targetId: r.targetId,
      targetLabel: r.targetLabel,
      createdAt: toIso(r.createdAt)
    }))
  }

  async createTableLink(input: Omit<DbTableLink, 'id' | 'createdAt'>): Promise<DbTableLink> {
    const client = await this.db()
    const id = uuidv4()
    const now = new Date().toISOString()
    await client.$executeRawUnsafe(
      `INSERT INTO "DbTableLink" ("id","connectionId","database","schema","table","linkType","targetId","targetLabel","createdAt") VALUES (?,?,?,?,?,?,?,?,?)`,
      id,
      input.connectionId,
      input.database,
      input.schema,
      input.table,
      input.linkType,
      input.targetId,
      input.targetLabel,
      now
    )
    return { id, ...input, createdAt: now }
  }

  async createSnapshot(connectionId: string, label: string, schemaJson: string): Promise<DbSchemaSnapshot> {
    const client = await this.db()
    const id = uuidv4()
    const now = new Date().toISOString()
    await client.$executeRawUnsafe(
      `INSERT INTO "DbSchemaSnapshot" ("id","connectionId","label","schemaJson","createdAt") VALUES (?,?,?,?,?)`,
      id,
      connectionId,
      label,
      schemaJson,
      now
    )
    return { id, connectionId, label, schemaJson, createdAt: now }
  }

  aiSchemaLabel(database: string, schema: string): string {
    return `ai-schema:${database}:${schema}`
  }

  async getAiSchemaSnapshot(connectionId: string, database: string, schema: string): Promise<DbSchemaSnapshot | null> {
    const client = await this.db()
    const label = this.aiSchemaLabel(database, schema)
    const rows = await client.$queryRawUnsafe<
      Array<{ id: string; connectionId: string; label: string; schemaJson: string; createdAt: string }>
    >(
      `SELECT * FROM "DbSchemaSnapshot" WHERE "connectionId" = ? AND "label" = ? ORDER BY "createdAt" DESC LIMIT 1`,
      connectionId,
      label
    )
    return rows[0] ?? null
  }

  async upsertAiSchemaSnapshot(
    connectionId: string,
    database: string,
    schema: string,
    schemaJson: string
  ): Promise<DbSchemaSnapshot> {
    const client = await this.db()
    const label = this.aiSchemaLabel(database, schema)
    const now = new Date().toISOString()
    const existing = await this.getAiSchemaSnapshot(connectionId, database, schema)
    if (existing) {
      await client.$executeRawUnsafe(
        `UPDATE "DbSchemaSnapshot" SET "schemaJson" = ?, "createdAt" = ? WHERE "id" = ?`,
        schemaJson,
        now,
        existing.id
      )
      return { ...existing, schemaJson, createdAt: now }
    }
    return this.createSnapshot(connectionId, label, schemaJson)
  }

  async listSnapshots(connectionId: string): Promise<DbSchemaSnapshot[]> {
    const client = await this.db()
    const rows = await client.$queryRawUnsafe<
      Array<{ id: string; connectionId: string; label: string; schemaJson: string; createdAt: string }>
    >(`SELECT * FROM "DbSchemaSnapshot" WHERE "connectionId" = ? ORDER BY "createdAt" DESC`, connectionId)
    return rows
  }

  async getAiCache(connectionId: string, action: string, cacheKey: string): Promise<string | null> {
    const client = await this.db()
    const rows = await client.$queryRawUnsafe<Array<{ content: string }>>(
      `SELECT "content" FROM "DbAiCache" WHERE "connectionId"=? AND "action"=? AND "cacheKey"=? ORDER BY "createdAt" DESC LIMIT 1`,
      connectionId,
      action,
      cacheKey
    )
    return rows[0]?.content ?? null
  }

  async setAiCache(connectionId: string, action: string, cacheKey: string, content: string): Promise<void> {
    const client = await this.db()
    const id = uuidv4()
    await client.$executeRawUnsafe(
      `INSERT INTO "DbAiCache" ("id","connectionId","action","cacheKey","content") VALUES (?,?,?,?,?)`,
      id,
      connectionId,
      action,
      cacheKey,
      content
    )
  }
}

export const dbWorkspaceRepository = new DbWorkspaceRepository()
