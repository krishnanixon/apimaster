import { v4 as uuidv4 } from 'uuid'
import { getPrismaClient, ensureUsageTable } from '../database/client'
import type {
  ApiUsageDailyStat,
  ApiUsageFeatureStat,
  ApiUsageModelStat,
  ApiUsageRecord,
  ApiUsageSummary
} from '@shared/types'

interface RecordUsageInput {
  feature: string
  projectId?: string | null
  model: string
  promptTokens: number
  completionTokens: number
  totalTokens: number
  estimatedCost: number
}

function num(value: unknown): number {
  if (value === null || value === undefined) return 0
  const n = typeof value === 'bigint' ? Number(value) : Number(value)
  return Number.isFinite(n) ? n : 0
}

/** SQLite CURRENT_TIMESTAMP is UTC 'YYYY-MM-DD HH:MM:SS'; normalize to ISO. */
function toIso(value: unknown): string {
  const raw = String(value ?? '')
  if (!raw) return new Date().toISOString()
  const parsed = new Date(raw.replace(' ', 'T') + 'Z')
  return Number.isNaN(parsed.getTime()) ? raw : parsed.toISOString()
}

export class UsageRepository {
  async record(input: RecordUsageInput): Promise<void> {
    await ensureUsageTable()
    const prisma = getPrismaClient()
    await prisma.$executeRawUnsafe(
      `INSERT INTO "ApiUsage"
        ("id", "projectId", "feature", "model", "promptTokens", "completionTokens", "totalTokens", "estimatedCost")
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      uuidv4(),
      input.projectId ?? null,
      input.feature,
      input.model,
      Math.round(input.promptTokens),
      Math.round(input.completionTokens),
      Math.round(input.totalTokens),
      input.estimatedCost
    )
  }

  async getTodayTokenTotal(): Promise<number> {
    await ensureUsageTable()
    const prisma = getPrismaClient()
    const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT COALESCE(SUM("totalTokens"), 0) AS totalTokens
       FROM "ApiUsage"
       WHERE date("createdAt") = date('now')`
    )
    return num(rows[0]?.totalTokens)
  }

  async getSummary(projectId?: string): Promise<ApiUsageSummary> {
    await ensureUsageTable()
    const prisma = getPrismaClient()

    const where = projectId ? `WHERE "projectId" = ?` : ''
    const args = projectId ? [projectId] : []

    const totalsRows = await prisma.$queryRawUnsafe<
      Array<Record<string, unknown>>
    >(
      `SELECT
         COUNT(*) AS requests,
         COALESCE(SUM("promptTokens"), 0) AS promptTokens,
         COALESCE(SUM("completionTokens"), 0) AS completionTokens,
         COALESCE(SUM("totalTokens"), 0) AS totalTokens,
         COALESCE(SUM("estimatedCost"), 0) AS estimatedCost,
         MIN("createdAt") AS firstAt,
         MAX("createdAt") AS lastAt
       FROM "ApiUsage" ${where}`,
      ...args
    )
    const totals = totalsRows[0] ?? {}

    const modelRows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT
         "model" AS model,
         COUNT(*) AS requests,
         COALESCE(SUM("promptTokens"), 0) AS promptTokens,
         COALESCE(SUM("completionTokens"), 0) AS completionTokens,
         COALESCE(SUM("totalTokens"), 0) AS totalTokens,
         COALESCE(SUM("estimatedCost"), 0) AS estimatedCost
       FROM "ApiUsage" ${where}
       GROUP BY "model"
       ORDER BY estimatedCost DESC, totalTokens DESC`,
      ...args
    )

    const featureRows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT
         "feature" AS feature,
         COUNT(*) AS requests,
         COALESCE(SUM("totalTokens"), 0) AS totalTokens,
         COALESCE(SUM("estimatedCost"), 0) AS estimatedCost
       FROM "ApiUsage" ${where}
       GROUP BY "feature"
       ORDER BY totalTokens DESC`,
      ...args
    )

    const dailyWhere = projectId
      ? `WHERE "projectId" = ? AND "createdAt" >= datetime('now', '-29 days')`
      : `WHERE "createdAt" >= datetime('now', '-29 days')`
    const dailyRows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT
         date("createdAt") AS date,
         COUNT(*) AS requests,
         COALESCE(SUM("totalTokens"), 0) AS totalTokens,
         COALESCE(SUM("estimatedCost"), 0) AS estimatedCost
       FROM "ApiUsage" ${dailyWhere}
       GROUP BY date("createdAt")
       ORDER BY date("createdAt") ASC`,
      ...args
    )

    const recentRows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT * FROM "ApiUsage" ${where}
       ORDER BY "createdAt" DESC
       LIMIT 30`,
      ...args
    )

    const byModel: ApiUsageModelStat[] = modelRows.map((r) => ({
      model: String(r.model ?? ''),
      requests: num(r.requests),
      promptTokens: num(r.promptTokens),
      completionTokens: num(r.completionTokens),
      totalTokens: num(r.totalTokens),
      estimatedCost: num(r.estimatedCost)
    }))

    const byFeature: ApiUsageFeatureStat[] = featureRows.map((r) => ({
      feature: String(r.feature ?? ''),
      requests: num(r.requests),
      totalTokens: num(r.totalTokens),
      estimatedCost: num(r.estimatedCost)
    }))

    const daily: ApiUsageDailyStat[] = dailyRows.map((r) => ({
      date: String(r.date ?? ''),
      requests: num(r.requests),
      totalTokens: num(r.totalTokens),
      estimatedCost: num(r.estimatedCost)
    }))

    const recent: ApiUsageRecord[] = recentRows.map((r) => ({
      id: String(r.id ?? ''),
      projectId: r.projectId == null ? null : String(r.projectId),
      feature: String(r.feature ?? ''),
      model: String(r.model ?? ''),
      promptTokens: num(r.promptTokens),
      completionTokens: num(r.completionTokens),
      totalTokens: num(r.totalTokens),
      estimatedCost: num(r.estimatedCost),
      createdAt: toIso(r.createdAt)
    }))

    return {
      totalRequests: num(totals.requests),
      totalPromptTokens: num(totals.promptTokens),
      totalCompletionTokens: num(totals.completionTokens),
      totalTokens: num(totals.totalTokens),
      totalCost: num(totals.estimatedCost),
      firstRecordedAt: totals.firstAt ? toIso(totals.firstAt) : null,
      lastRecordedAt: totals.lastAt ? toIso(totals.lastAt) : null,
      byModel,
      byFeature,
      daily,
      recent
    }
  }

  async clear(projectId?: string): Promise<void> {
    await ensureUsageTable()
    const prisma = getPrismaClient()
    if (projectId) {
      await prisma.$executeRawUnsafe(`DELETE FROM "ApiUsage" WHERE "projectId" = ?`, projectId)
    } else {
      await prisma.$executeRawUnsafe(`DELETE FROM "ApiUsage"`)
    }
  }
}

export const usageRepository = new UsageRepository()
