import { v4 as uuidv4 } from 'uuid'
import { ensureVoiceAssistantTables, getPrismaClient } from '../database/client'
import type { VoiceConversation } from '@shared/types/voice-assistant'
import { logger } from '../infra/logger.service'

export interface VoiceMemoryRecord {
  id: string
  topic: string
  content: string
  projectId: string | null
  source: string
  createdAt: string
  updatedAt: string
}

interface MemoryRow {
  id: string
  topic: string
  content: string
  projectId: string | null
  source: string
  createdAt: string
  updatedAt: string
}

async function ready(): Promise<void> {
  await ensureVoiceAssistantTables()
}

export const voiceMemoryRepository = {
  async list(limit = 24): Promise<VoiceMemoryRecord[]> {
    await ready()
    const client = getPrismaClient()
    const rows = await client.$queryRawUnsafe<MemoryRow[]>(
      `SELECT * FROM "VoiceMemory" ORDER BY datetime("updatedAt") DESC LIMIT ?`,
      Math.max(1, Math.min(limit, 80))
    )
    return rows
  },

  async search(query: string, limit = 12): Promise<VoiceMemoryRecord[]> {
    await ready()
    const q = `%${query.trim()}%`
    if (!query.trim()) return this.list(limit)
    const client = getPrismaClient()
    const rows = await client.$queryRawUnsafe<MemoryRow[]>(
      `SELECT * FROM "VoiceMemory"
       WHERE "content" LIKE ? OR "topic" LIKE ?
       ORDER BY datetime("updatedAt") DESC LIMIT ?`,
      q,
      q,
      Math.max(1, Math.min(limit, 40))
    )
    return rows
  },

  async remember(input: {
    content: string
    topic?: string
    projectId?: string | null
    source?: string
  }): Promise<VoiceMemoryRecord> {
    await ready()
    const content = input.content.trim()
    if (!content) throw new Error('Nothing to remember.')
    const topic = (input.topic ?? '').trim().slice(0, 80)
    const now = new Date().toISOString()
    const client = getPrismaClient()

    const existing = topic
      ? await client.$queryRawUnsafe<MemoryRow[]>(
          `SELECT * FROM "VoiceMemory" WHERE lower("topic") = lower(?) LIMIT 1`,
          topic
        )
      : []

    if (existing[0]) {
      await client.$executeRawUnsafe(
        `UPDATE "VoiceMemory" SET "content" = ?, "projectId" = ?, "source" = ?, "updatedAt" = ? WHERE "id" = ?`,
        content,
        input.projectId ?? existing[0].projectId,
        input.source ?? existing[0].source,
        now,
        existing[0].id
      )
      return { ...existing[0], content, updatedAt: now, topic: existing[0].topic }
    }

    const id = uuidv4()
    await client.$executeRawUnsafe(
      `INSERT INTO "VoiceMemory" ("id", "topic", "content", "projectId", "source", "createdAt", "updatedAt")
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      id,
      topic,
      content,
      input.projectId ?? null,
      input.source ?? 'spoken',
      now,
      now
    )
    return {
      id,
      topic,
      content,
      projectId: input.projectId ?? null,
      source: input.source ?? 'spoken',
      createdAt: now,
      updatedAt: now
    }
  },

  async clearAll(): Promise<void> {
    await ready()
    const client = getPrismaClient()
    await client.$executeRawUnsafe(`DELETE FROM "VoiceMemory"`)
  }
}

export const voiceConversationDb = {
  async upsert(conversation: VoiceConversation): Promise<void> {
    try {
      await ready()
      const client = getPrismaClient()
      const payload = JSON.stringify(conversation)
      await client.$executeRawUnsafe(
        `INSERT INTO "VoiceConversationRecord" ("id", "title", "createdAt", "updatedAt", "payload")
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT("id") DO UPDATE SET
           "title" = excluded."title",
           "updatedAt" = excluded."updatedAt",
           "payload" = excluded."payload"`,
        conversation.id,
        conversation.title,
        conversation.createdAt,
        conversation.updatedAt,
        payload
      )
    } catch (error) {
      logger.warn(
        `Voice conversation DB persist skipped: ${error instanceof Error ? error.message : String(error)}`,
        'Voice'
      )
    }
  },

  async remove(id: string): Promise<void> {
    try {
      await ready()
      const client = getPrismaClient()
      await client.$executeRawUnsafe(`DELETE FROM "VoiceConversationRecord" WHERE "id" = ?`, id)
    } catch {
      // best-effort
    }
  },

  async clearAll(): Promise<void> {
    try {
      await ready()
      const client = getPrismaClient()
      await client.$executeRawUnsafe(`DELETE FROM "VoiceConversationRecord"`)
    } catch {
      // best-effort
    }
  }
}
