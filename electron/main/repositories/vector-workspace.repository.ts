import { v4 as uuidv4 } from 'uuid'
import { getPrismaClient } from '../database/client'
import { ensureVectorWorkspaceTables } from '../database/vector-workspace-init'
import { encryptVectorSecrets, decryptVectorSecrets } from '../vector-workspace/vector-workspace-crypto'
import type { AppScope } from '@shared/types/scope'
import type {
  CreateVectorConnectionInput,
  UpdateVectorConnectionInput,
  VectorConnection,
  VectorConnectionSecrets,
  VectorWorkspaceSettings
} from '@shared/types/vector-workspace'
import { DEFAULT_VECTOR_WORKSPACE_SETTINGS } from '@shared/types/vector-workspace'

interface VectorConnectionRow {
  id: string
  name: string
  provider: string
  scope: string
  projectId: string | null
  configJson: string
  encryptedSecrets: string | null
  notes: string
  tagsJson: string
  isFavorite: number
  health: string
  latencyMs: number | null
  serverVersion: string | null
  lastConnectedAt: string | null
  sortOrder: number
  createdAt: string
  updatedAt: string
}

function serializeConnection(row: VectorConnectionRow): VectorConnection {
  return {
    id: row.id,
    name: row.name,
    provider: row.provider as VectorConnection['provider'],
    scope: row.scope as AppScope,
    projectId: row.projectId,
    config: JSON.parse(row.configJson || '{}'),
    notes: row.notes,
    tags: JSON.parse(row.tagsJson || '[]'),
    isFavorite: row.isFavorite === 1,
    health: row.health as VectorConnection['health'],
    latencyMs: row.latencyMs,
    serverVersion: row.serverVersion,
    lastConnectedAt: row.lastConnectedAt,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }
}

async function ready(): Promise<void> {
  await ensureVectorWorkspaceTables()
}

export const vectorWorkspaceRepository = {
  async listConnections(filter?: {
    scope?: AppScope
    projectId?: string | null
  }): Promise<VectorConnection[]> {
    await ready()
    const client = getPrismaClient()
    let rows: VectorConnectionRow[]

    if (filter?.scope === 'PROJECT' && filter.projectId) {
      rows = await client.$queryRawUnsafe<VectorConnectionRow[]>(
        `SELECT * FROM "VectorConnection" WHERE "scope" = ? AND "projectId" = ? ORDER BY "sortOrder", "name"`,
        filter.scope,
        filter.projectId
      )
    } else if (filter?.scope === 'GLOBAL') {
      rows = await client.$queryRawUnsafe<VectorConnectionRow[]>(
        `SELECT * FROM "VectorConnection" WHERE "scope" = 'GLOBAL' ORDER BY "sortOrder", "name"`
      )
    } else {
      rows = await client.$queryRawUnsafe<VectorConnectionRow[]>(
        `SELECT * FROM "VectorConnection" ORDER BY "sortOrder", "name"`
      )
    }

    return rows.map(serializeConnection)
  },

  async getConnection(id: string): Promise<VectorConnection | null> {
    await ready()
    const client = getPrismaClient()
    const rows = await client.$queryRawUnsafe<VectorConnectionRow[]>(
      `SELECT * FROM "VectorConnection" WHERE "id" = ? LIMIT 1`,
      id
    )
    return rows[0] ? serializeConnection(rows[0]) : null
  },

  async getConnectionSecrets(id: string): Promise<VectorConnectionSecrets> {
    await ready()
    const client = getPrismaClient()
    const rows = await client.$queryRawUnsafe<Array<{ encryptedSecrets: string | null }>>(
      `SELECT "encryptedSecrets" FROM "VectorConnection" WHERE "id" = ? LIMIT 1`,
      id
    )
    const blob = rows[0]?.encryptedSecrets
    if (!blob) return {}
    try {
      return decryptVectorSecrets(blob)
    } catch {
      return {}
    }
  },

  async createConnection(input: CreateVectorConnectionInput): Promise<VectorConnection> {
    await ready()
    const client = getPrismaClient()
    const now = new Date().toISOString()
    const id = uuidv4()
    const secrets = input.secrets ?? {}
    const encrypted =
      secrets.apiKey && secrets.apiKey.length > 0 ? encryptVectorSecrets(secrets) : null

    await client.$executeRawUnsafe(
      `INSERT INTO "VectorConnection"
        ("id","name","provider","scope","projectId","configJson","encryptedSecrets","notes","tagsJson","isFavorite","health","latencyMs","serverVersion","lastConnectedAt","sortOrder","createdAt","updatedAt")
       VALUES (?,?,?,?,?,?,?,?,?,0,'unknown',NULL,NULL,NULL,0,?,?)`,
      id,
      input.name,
      input.provider,
      input.scope,
      input.projectId ?? null,
      JSON.stringify(input.config),
      encrypted,
      input.notes ?? '',
      JSON.stringify(input.tags ?? []),
      now,
      now
    )

    const created = await this.getConnection(id)
    if (!created) throw new Error('Failed to create vector connection')
    return created
  },

  async updateConnection(
    id: string,
    input: UpdateVectorConnectionInput
  ): Promise<VectorConnection | null> {
    await ready()
    const existing = await this.getConnection(id)
    if (!existing) return null

    const client = getPrismaClient()
    const now = new Date().toISOString()
    const name = input.name ?? existing.name
    const config = input.config ?? existing.config
    const notes = input.notes ?? existing.notes
    const tags = input.tags ?? existing.tags
    const isFavorite = input.isFavorite ?? existing.isFavorite

    let encryptedSecrets: string | null | undefined
    if (input.secrets !== undefined) {
      encryptedSecrets =
        input.secrets.apiKey && input.secrets.apiKey.length > 0
          ? encryptVectorSecrets(input.secrets)
          : null
    }

    if (encryptedSecrets !== undefined) {
      await client.$executeRawUnsafe(
        `UPDATE "VectorConnection" SET "name"=?, "configJson"=?, "notes"=?, "tagsJson"=?, "isFavorite"=?, "encryptedSecrets"=?, "updatedAt"=? WHERE "id"=?`,
        name,
        JSON.stringify(config),
        notes,
        JSON.stringify(tags),
        isFavorite ? 1 : 0,
        encryptedSecrets,
        now,
        id
      )
    } else {
      await client.$executeRawUnsafe(
        `UPDATE "VectorConnection" SET "name"=?, "configJson"=?, "notes"=?, "tagsJson"=?, "isFavorite"=?, "updatedAt"=? WHERE "id"=?`,
        name,
        JSON.stringify(config),
        notes,
        JSON.stringify(tags),
        isFavorite ? 1 : 0,
        now,
        id
      )
    }

    return this.getConnection(id)
  },

  async deleteConnection(id: string): Promise<void> {
    await ready()
    const client = getPrismaClient()
    await client.$executeRawUnsafe(`DELETE FROM "VectorConnection" WHERE "id" = ?`, id)
  },

  async duplicateConnection(id: string): Promise<VectorConnection | null> {
    const existing = await this.getConnection(id)
    if (!existing) return null
    const secrets = await this.getConnectionSecrets(id)
    return this.createConnection({
      name: `${existing.name} (copy)`,
      provider: existing.provider,
      scope: existing.scope,
      projectId: existing.projectId,
      config: existing.config,
      notes: existing.notes,
      tags: existing.tags,
      secrets
    })
  },

  async updateHealth(
    id: string,
    patch: {
      health: VectorConnection['health']
      latencyMs?: number | null
      serverVersion?: string | null
      lastConnectedAt?: string | null
    }
  ): Promise<void> {
    await ready()
    const client = getPrismaClient()
    const now = new Date().toISOString()
    await client.$executeRawUnsafe(
      `UPDATE "VectorConnection" SET "health"=?, "latencyMs"=?, "serverVersion"=?, "lastConnectedAt"=COALESCE(?, "lastConnectedAt"), "updatedAt"=? WHERE "id"=?`,
      patch.health,
      patch.latencyMs ?? null,
      patch.serverVersion ?? null,
      patch.lastConnectedAt ?? null,
      now,
      id
    )
  },

  async getSettings(): Promise<VectorWorkspaceSettings> {
    await ready()
    const client = getPrismaClient()
    const rows = await client.$queryRawUnsafe<Array<{ settingsJson: string }>>(
      `SELECT "settingsJson" FROM "VectorWorkspaceSettings" WHERE "id" = 'default' LIMIT 1`
    )
    if (!rows[0]) return { ...DEFAULT_VECTOR_WORKSPACE_SETTINGS }
    try {
      return { ...DEFAULT_VECTOR_WORKSPACE_SETTINGS, ...JSON.parse(rows[0].settingsJson) }
    } catch {
      return { ...DEFAULT_VECTOR_WORKSPACE_SETTINGS }
    }
  },

  async saveSettings(
    patch: Partial<VectorWorkspaceSettings>
  ): Promise<VectorWorkspaceSettings> {
    await ready()
    const current = await this.getSettings()
    const next = { ...current, ...patch }
    const client = getPrismaClient()
    await client.$executeRawUnsafe(
      `INSERT INTO "VectorWorkspaceSettings" ("id", "settingsJson") VALUES ('default', ?)
       ON CONFLICT("id") DO UPDATE SET "settingsJson" = excluded."settingsJson"`,
      JSON.stringify(next)
    )
    return next
  }
}
