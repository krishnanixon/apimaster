import type { ActivityKind, ActivityLog } from '@shared/types'
import { incrementActivity, normalizeActivityLog, pruneActivity } from '@shared/lib/activity-calendar'
import { readJsonFile, writeJsonFile } from '../infra/json-store'
import { logger } from '../infra/logger.service'

const STORE_FILE = 'activity.json'

let cache: ActivityLog | null = null

function load(): ActivityLog {
  if (!cache) cache = normalizeActivityLog(readJsonFile<unknown>(STORE_FILE, null))
  return cache
}

export class ActivityRepository {
  get(): ActivityLog {
    return pruneActivity(load())
  }

  /** Best-effort: activity tracking must never break the feature being tracked. */
  record(kind: ActivityKind, amount = 1): void {
    try {
      cache = incrementActivity(load(), kind, new Date(), amount)
      writeJsonFile(STORE_FILE, cache)
    } catch (e) {
      logger.warn(`Failed to record activity: ${e instanceof Error ? e.message : e}`, 'Activity')
    }
  }

  clear(): void {
    cache = { days: {} }
    writeJsonFile(STORE_FILE, cache)
  }
}

export const activityRepository = new ActivityRepository()
