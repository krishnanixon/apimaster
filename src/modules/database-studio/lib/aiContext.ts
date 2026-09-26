const META_KEYS = new Set(['__localInsert', '__tempId'])

export function sanitizeRowsForAi(
  rows: Record<string, unknown>[] | undefined,
  limit = 30
): Record<string, unknown>[] {
  if (!rows?.length) return []
  return rows.slice(0, limit).map((row) => {
    const out: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(row)) {
      if (META_KEYS.has(key)) continue
      if (typeof value === 'string' && value.length > 400) out[key] = `${value.slice(0, 400)}…`
      else out[key] = value
    }
    return out
  })
}

export const dbTableClass = 'w-full border-collapse border border-border text-xs'
export const dbThClass =
  'whitespace-nowrap border border-border bg-muted/80 px-1.5 py-1 text-left text-[11px] font-medium text-muted-foreground'
export const dbTdClass = 'max-w-[280px] truncate border border-border px-1.5 py-0.5'

/** Alternating light / light-gray rows so tables are easier to scan. */
export function dbRowStripe(index: number): string {
  return index % 2 === 0 ? 'bg-background' : 'bg-muted/50'
}
