import type { ActivityCounts, ActivityKind, ActivityLog } from '../types/profile'

export const ACTIVITY_KINDS: ActivityKind[] = ['request', 'test', 'ai', 'mock']
export type ActivityFilter = ActivityKind | 'all'

export const ACTIVITY_KIND_LABELS: Record<ActivityKind, { one: string; many: string }> = {
  request: { one: 'request sent', many: 'requests sent' },
  test: { one: 'test run', many: 'test runs' },
  ai: { one: 'AI call', many: 'AI calls' },
  mock: { one: 'mock server created', many: 'mock servers created' }
}

/** How long daily counts are kept on disk — a little over the 53 weeks the calendar shows. */
export const ACTIVITY_RETENTION_DAYS = 400

const DAY_MS = 24 * 60 * 60 * 1000
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** YYYY-MM-DD in the local time zone, so "today" matches the user's calendar. */
export function localDateKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

/** Calendar-day arithmetic (DST-safe because it goes through the Date constructor). */
export function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)
}

export function countFor(counts: ActivityCounts | undefined, filter: ActivityFilter): number {
  if (!counts) return 0
  if (filter !== 'all') return counts[filter] ?? 0
  return ACTIVITY_KINDS.reduce((total, kind) => total + (counts[kind] ?? 0), 0)
}

export function normalizeActivityLog(raw: unknown): ActivityLog {
  const days: ActivityLog['days'] = {}
  const source =
    raw && typeof raw === 'object' && 'days' in raw ? (raw as { days: unknown }).days : null
  if (!source || typeof source !== 'object') return { days }
  for (const [key, value] of Object.entries(source as Record<string, unknown>)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || !value || typeof value !== 'object') continue
    const counts: ActivityCounts = {}
    for (const kind of ACTIVITY_KINDS) {
      const n = (value as Record<string, unknown>)[kind]
      if (typeof n === 'number' && Number.isFinite(n) && n > 0) counts[kind] = Math.floor(n)
    }
    if (Object.keys(counts).length) days[key] = counts
  }
  return { days }
}

/** Returns a new log with one more `kind` event on `date`, dropping days past retention. */
export function incrementActivity(
  log: ActivityLog,
  kind: ActivityKind,
  date = new Date(),
  amount = 1
): ActivityLog {
  const key = localDateKey(date)
  const today = log.days[key] ?? {}
  return pruneActivity(
    { days: { ...log.days, [key]: { ...today, [kind]: (today[kind] ?? 0) + amount } } },
    date
  )
}

export function pruneActivity(log: ActivityLog, today = new Date()): ActivityLog {
  const cutoff = localDateKey(addDays(today, -ACTIVITY_RETENTION_DAYS))
  return {
    days: Object.fromEntries(Object.entries(log.days).filter(([key]) => key >= cutoff))
  }
}

/** 0 = none, 1–4 = quartiles of the busiest day, like GitHub's contribution graph. */
export function activityLevel(count: number, max: number): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0 || max <= 0) return 0
  return Math.min(4, Math.max(1, Math.ceil((count / max) * 4))) as 1 | 2 | 3 | 4
}

export interface CalendarCell {
  date: string
  count: number
  counts: ActivityCounts
  level: 0 | 1 | 2 | 3 | 4
}

export interface ActivityCalendar {
  /** Columns of 7 days, Sunday first. `null` pads days after today. */
  weeks: Array<Array<CalendarCell | null>>
  /** Month labels and the week column they start in */
  months: Array<{ label: string; week: number }>
  total: number
  activeDays: number
  max: number
  busiest: CalendarCell | null
  byKind: Record<ActivityKind, number>
  start: string
  end: string
}

export function buildActivityCalendar(
  log: ActivityLog,
  { today = new Date(), weeks = 53, filter = 'all' as ActivityFilter } = {}
): ActivityCalendar {
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const start = addDays(end, -(weeks - 1) * 7 - end.getDay())

  let max = 0
  for (let d = start; d <= end; d = addDays(d, 1)) {
    max = Math.max(max, countFor(log.days[localDateKey(d)], filter))
  }

  const columns: ActivityCalendar['weeks'] = []
  const months: ActivityCalendar['months'] = []
  const byKind: Record<ActivityKind, number> = { request: 0, test: 0, ai: 0, mock: 0 }
  let total = 0
  let activeDays = 0
  let busiest: CalendarCell | null = null

  for (let w = 0; w < weeks; w++) {
    const column: Array<CalendarCell | null> = []
    for (let dow = 0; dow < 7; dow++) {
      const date = addDays(start, w * 7 + dow)
      if (date > end) {
        column.push(null)
        continue
      }
      const key = localDateKey(date)
      const counts = log.days[key] ?? {}
      const count = countFor(counts, filter)
      const cell: CalendarCell = { date: key, count, counts, level: activityLevel(count, max) }
      column.push(cell)

      if (date.getDate() === 1 || (w === 0 && dow === 0)) {
        months.push({ label: MONTHS[date.getMonth()], week: w })
      }

      total += count
      if (count > 0) activeDays++
      if (!busiest || count > busiest.count) busiest = cell
      for (const kind of ACTIVITY_KINDS) byKind[kind] += counts[kind] ?? 0
    }
    columns.push(column)
  }

  // The partial first month would overlap the next label, so drop it (as GitHub does)
  if (months.length > 1 && months[1].week - months[0].week < 3) months.shift()

  return {
    weeks: columns,
    months,
    total,
    activeDays,
    max,
    busiest: busiest && busiest.count > 0 ? busiest : null,
    byKind,
    start: localDateKey(start),
    end: localDateKey(end)
  }
}

export interface ActivityStreaks {
  current: number
  longest: number
}

/** The current streak stays alive until the end of today, so it counts back from yesterday if today is empty. */
export function computeStreaks(
  log: ActivityLog,
  { today = new Date(), filter = 'all' as ActivityFilter } = {}
): ActivityStreaks {
  const active = (d: Date) => countFor(log.days[localDateKey(d)], filter) > 0
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate())

  let current = 0
  let cursor = active(end) ? end : addDays(end, -1)
  while (active(cursor)) {
    current++
    cursor = addDays(cursor, -1)
  }

  const keys = Object.keys(log.days)
    .filter((key) => countFor(log.days[key], filter) > 0)
    .sort()
  let longest = 0
  let run = 0
  let prev: Date | null = null
  for (const key of keys) {
    const date = parseDateKey(key)
    run = prev && Math.round((date.getTime() - prev.getTime()) / DAY_MS) === 1 ? run + 1 : 1
    longest = Math.max(longest, run)
    prev = date
  }

  return { current, longest: Math.max(longest, current) }
}
