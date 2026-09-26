/**
 * Render MongoDB Extended JSON wrappers ({ $oid }, { $date }, …) the way the Mongo shell does.
 * Returns null when the value is not an EJSON scalar wrapper.
 */
export function formatExtendedJsonScalar(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const keys = Object.keys(value)
  if (keys.length !== 1) return null
  const v = (value as Record<string, unknown>)[keys[0]]
  switch (keys[0]) {
    case '$oid':
      return `ObjectId("${String(v)}")`
    case '$date': {
      const raw = typeof v === 'object' && v && '$numberLong' in v ? Number((v as { $numberLong: string }).$numberLong) : (v as string | number)
      const d = new Date(raw)
      return Number.isNaN(d.getTime()) ? String(raw) : d.toISOString()
    }
    case '$numberLong':
    case '$numberDecimal':
    case '$numberInt':
    case '$numberDouble':
      return String(v)
    case '$uuid':
      return `UUID("${String(v)}")`
    default:
      return null
  }
}

/** Safely format any DB/API value for React text nodes. */
export function formatDisplayValue(value: unknown): string {
  if (value == null) return '—'
  if (value instanceof Date) return value.toLocaleString()
  const ejson = formatExtendedJsonScalar(value)
  if (ejson != null) return ejson
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value)
    } catch {
      return String(value)
    }
  }
  return String(value)
}

/** Format ISO date strings and Date objects for display. */
export function formatTimestamp(value: unknown): string {
  if (value == null) return '—'
  if (value instanceof Date) return value.toLocaleString()
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    if (!Number.isNaN(parsed)) return new Date(parsed).toLocaleString()
    return value
  }
  return formatDisplayValue(value)
}
