import { v4 as uuidv4 } from 'uuid'
import type {
  ApiUsageDailyStat,
  ApiUsageFeatureStat,
  ApiUsageModelStat,
  ApiUsageRecord,
  ApiUsageSummary
} from '@shared/types'
import { readJsonFile, writeJsonFile } from '../infra/json-store'

const STORE_FILE = 'usage.json'
/** Keeps the store small; summaries only look back 30 days for daily stats anyway. */
const MAX_RECORDS = 5000

interface RecordUsageInput {
  feature: string
  projectId?: string | null
  model: string
  promptTokens: number
  completionTokens: number
  totalTokens: number
  estimatedCost: number
}

let cache: ApiUsageRecord[] | null = null

function load(): ApiUsageRecord[] {
  if (!cache) {
    const raw = readJsonFile<ApiUsageRecord[]>(STORE_FILE, [])
    cache = Array.isArray(raw) ? raw : []
  }
  return cache
}

function save(records: ApiUsageRecord[]): void {
  cache = records
  writeJsonFile(STORE_FILE, records)
}

function sum(records: ApiUsageRecord[], key: keyof ApiUsageRecord): number {
  return records.reduce((total, r) => total + (Number(r[key]) || 0), 0)
}

function groupBy(records: ApiUsageRecord[], key: (r: ApiUsageRecord) => string): Map<string, ApiUsageRecord[]> {
  const groups = new Map<string, ApiUsageRecord[]>()
  for (const r of records) {
    const k = key(r)
    const list = groups.get(k)
    if (list) list.push(r)
    else groups.set(k, [r])
  }
  return groups
}

export class UsageRepository {
  async record(input: RecordUsageInput): Promise<void> {
    const record: ApiUsageRecord = {
      id: uuidv4(),
      projectId: input.projectId ?? null,
      feature: input.feature,
      model: input.model,
      promptTokens: Math.round(input.promptTokens),
      completionTokens: Math.round(input.completionTokens),
      totalTokens: Math.round(input.totalTokens),
      estimatedCost: input.estimatedCost,
      createdAt: new Date().toISOString()
    }
    save([...load(), record].slice(-MAX_RECORDS))
  }

  async getTodayTokenTotal(): Promise<number> {
    const today = new Date().toISOString().slice(0, 10)
    return sum(
      load().filter((r) => r.createdAt.startsWith(today)),
      'totalTokens'
    )
  }

  async getSummary(): Promise<ApiUsageSummary> {
    const records = load()

    const byModel: ApiUsageModelStat[] = [...groupBy(records, (r) => r.model)]
      .map(([model, rs]) => ({
        model,
        requests: rs.length,
        promptTokens: sum(rs, 'promptTokens'),
        completionTokens: sum(rs, 'completionTokens'),
        totalTokens: sum(rs, 'totalTokens'),
        estimatedCost: sum(rs, 'estimatedCost')
      }))
      .sort((a, b) => b.estimatedCost - a.estimatedCost || b.totalTokens - a.totalTokens)

    const byFeature: ApiUsageFeatureStat[] = [...groupBy(records, (r) => r.feature)]
      .map(([feature, rs]) => ({
        feature,
        requests: rs.length,
        totalTokens: sum(rs, 'totalTokens'),
        estimatedCost: sum(rs, 'estimatedCost')
      }))
      .sort((a, b) => b.totalTokens - a.totalTokens)

    const since = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const daily: ApiUsageDailyStat[] = [
      ...groupBy(
        records.filter((r) => r.createdAt.slice(0, 10) >= since),
        (r) => r.createdAt.slice(0, 10)
      )
    ]
      .map(([date, rs]) => ({
        date,
        requests: rs.length,
        totalTokens: sum(rs, 'totalTokens'),
        estimatedCost: sum(rs, 'estimatedCost')
      }))
      .sort((a, b) => a.date.localeCompare(b.date))

    return {
      totalRequests: records.length,
      totalPromptTokens: sum(records, 'promptTokens'),
      totalCompletionTokens: sum(records, 'completionTokens'),
      totalTokens: sum(records, 'totalTokens'),
      totalCost: sum(records, 'estimatedCost'),
      firstRecordedAt: records[0]?.createdAt ?? null,
      lastRecordedAt: records[records.length - 1]?.createdAt ?? null,
      byModel,
      byFeature,
      daily,
      recent: records.slice(-30).reverse()
    }
  }

  async clear(): Promise<void> {
    save([])
  }
}

export const usageRepository = new UsageRepository()
