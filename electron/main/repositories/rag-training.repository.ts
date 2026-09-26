import { createHash } from 'crypto'
import { v4 as uuidv4 } from 'uuid'
import { getPrismaClient } from '../database/client'
import { ensureRagTrainingTables } from '../database/rag-training-init'
import type { AppScope } from '@shared/types/scope'
import type {
  CreateRagTrainingDocumentInput,
  RagTrainingDocument,
  RagTrainingSettings,
  UpdateRagTrainingDocumentInput
} from '@shared/types/rag-training'
import { DEFAULT_RAG_TRAINING_SETTINGS } from '@shared/types/rag-training'

interface Row {
  id: string
  scope: string
  projectId: string | null
  title: string
  source: string
  purpose: string
  category: string
  tagsJson: string
  content: string
  contentHash: string
  enabled: number
  sortOrder: number
  createdAt: string
  updatedAt: string
}

function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 24)
}

function serialize(row: Row): RagTrainingDocument {
  return {
    id: row.id,
    scope: row.scope as AppScope,
    projectId: row.projectId,
    title: row.title,
    source: row.source,
    purpose: row.purpose,
    category: row.category as RagTrainingDocument['category'],
    tags: JSON.parse(row.tagsJson || '[]'),
    content: row.content,
    contentHash: row.contentHash,
    enabled: row.enabled === 1,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }
}

async function ready(): Promise<void> {
  await ensureRagTrainingTables()
}

export const ragTrainingRepository = {
  async list(filter?: {
    scope?: AppScope
    projectId?: string | null
    enabledOnly?: boolean
  }): Promise<RagTrainingDocument[]> {
    await ready()
    const client = getPrismaClient()
    const clauses: string[] = []
    const params: unknown[] = []

    if (filter?.scope === 'PROJECT' && filter.projectId) {
      clauses.push(`"scope" = ? AND "projectId" = ?`)
      params.push('PROJECT', filter.projectId)
    } else if (filter?.scope === 'GLOBAL') {
      clauses.push(`"scope" = 'GLOBAL'`)
    } else if (filter?.projectId) {
      clauses.push(`(("scope" = 'GLOBAL') OR ("scope" = 'PROJECT' AND "projectId" = ?))`)
      params.push(filter.projectId)
    }

    if (filter?.enabledOnly) {
      clauses.push(`"enabled" = 1`)
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
    const rows = await client.$queryRawUnsafe<Row[]>(
      `SELECT * FROM "RagTrainingDocument" ${where} ORDER BY "sortOrder", "updatedAt" DESC`,
      ...params
    )
    return rows.map(serialize)
  },

  async get(id: string): Promise<RagTrainingDocument | null> {
    await ready()
    const client = getPrismaClient()
    const rows = await client.$queryRawUnsafe<Row[]>(
      `SELECT * FROM "RagTrainingDocument" WHERE "id" = ? LIMIT 1`,
      id
    )
    return rows[0] ? serialize(rows[0]) : null
  },

  async create(input: CreateRagTrainingDocumentInput): Promise<RagTrainingDocument> {
    await ready()
    const now = new Date().toISOString()
    const id = uuidv4()
    const content = input.content ?? ''
    const client = getPrismaClient()
    await client.$executeRawUnsafe(
      `INSERT INTO "RagTrainingDocument"
        ("id","scope","projectId","title","source","purpose","category","tagsJson","content","contentHash","enabled","sortOrder","createdAt","updatedAt")
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      id,
      input.scope,
      input.scope === 'PROJECT' ? (input.projectId ?? null) : null,
      input.title.trim(),
      input.source?.trim() ?? '',
      input.purpose?.trim() ?? '',
      input.category ?? 'other',
      JSON.stringify(input.tags ?? []),
      content,
      hashContent(content),
      input.enabled === false ? 0 : 1,
      0,
      now,
      now
    )
    const doc = await this.get(id)
    if (!doc) throw new Error('Failed to create training document')
    return doc
  },

  async update(id: string, input: UpdateRagTrainingDocumentInput): Promise<RagTrainingDocument | null> {
    await ready()
    const existing = await this.get(id)
    if (!existing) return null

    const next = {
      title: input.title?.trim() ?? existing.title,
      source: input.source !== undefined ? input.source.trim() : existing.source,
      purpose: input.purpose !== undefined ? input.purpose.trim() : existing.purpose,
      category: input.category ?? existing.category,
      tags: input.tags ?? existing.tags,
      content: input.content !== undefined ? input.content : existing.content,
      enabled: input.enabled ?? existing.enabled,
      sortOrder: input.sortOrder ?? existing.sortOrder
    }
    const now = new Date().toISOString()
    const client = getPrismaClient()
    await client.$executeRawUnsafe(
      `UPDATE "RagTrainingDocument" SET
        "title" = ?, "source" = ?, "purpose" = ?, "category" = ?, "tagsJson" = ?,
        "content" = ?, "contentHash" = ?, "enabled" = ?, "sortOrder" = ?, "updatedAt" = ?
       WHERE "id" = ?`,
      next.title,
      next.source,
      next.purpose,
      next.category,
      JSON.stringify(next.tags),
      next.content,
      hashContent(next.content),
      next.enabled ? 1 : 0,
      next.sortOrder,
      now,
      id
    )
    return this.get(id)
  },

  async delete(id: string): Promise<void> {
    await ready()
    const client = getPrismaClient()
    await client.$executeRawUnsafe(`DELETE FROM "RagTrainingDocument" WHERE "id" = ?`, id)
  },

  async getSettings(): Promise<RagTrainingSettings> {
    await ready()
    const client = getPrismaClient()
    const rows = await client.$queryRawUnsafe<Array<{ settingsJson: string }>>(
      `SELECT "settingsJson" FROM "RagTrainingSettings" WHERE "id" = 'default' LIMIT 1`
    )
    if (!rows[0]) return structuredClone(DEFAULT_RAG_TRAINING_SETTINGS)
    try {
      const parsed = JSON.parse(rows[0].settingsJson) as Partial<RagTrainingSettings>
      return {
        ...DEFAULT_RAG_TRAINING_SETTINGS,
        ...parsed,
        modelProfile: {
          ...DEFAULT_RAG_TRAINING_SETTINGS.modelProfile,
          ...(parsed.modelProfile ?? {})
        },
        indexMeta: {
          ...DEFAULT_RAG_TRAINING_SETTINGS.indexMeta,
          ...(parsed.indexMeta ?? {})
        }
      }
    } catch {
      return structuredClone(DEFAULT_RAG_TRAINING_SETTINGS)
    }
  },

  async saveSettings(patch: Partial<RagTrainingSettings>): Promise<RagTrainingSettings> {
    await ready()
    const current = await this.getSettings()
    const next: RagTrainingSettings = {
      ...current,
      ...patch,
      modelProfile: {
        ...current.modelProfile,
        ...(patch.modelProfile ?? {})
      },
      indexMeta: patch.indexMeta ?? current.indexMeta
    }
    const client = getPrismaClient()
    await client.$executeRawUnsafe(
      `INSERT INTO "RagTrainingSettings" ("id", "settingsJson") VALUES ('default', ?)
       ON CONFLICT("id") DO UPDATE SET "settingsJson" = excluded."settingsJson"`,
      JSON.stringify(next)
    )
    return next
  }
}
