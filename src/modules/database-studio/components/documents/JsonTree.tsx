import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { formatExtendedJsonScalar } from '../../lib/formatValue'

function Scalar({ value }: { value: unknown }) {
  const ejson = formatExtendedJsonScalar(value)
  if (ejson != null) {
    const isId = ejson.startsWith('ObjectId')
    return <span className={isId ? 'text-violet-600 dark:text-violet-400' : 'text-sky-700 dark:text-sky-300'}>{ejson}</span>
  }
  if (value === null) return <span className="italic text-muted-foreground">null</span>
  if (typeof value === 'string') return <span className="break-all text-emerald-700 dark:text-emerald-400">"{value}"</span>
  if (typeof value === 'number') return <span className="text-amber-700 dark:text-amber-400">{value}</span>
  if (typeof value === 'boolean') return <span className="text-rose-600 dark:text-rose-400">{String(value)}</span>
  return <span>{String(value)}</span>
}

function isContainer(value: unknown): value is Record<string, unknown> | unknown[] {
  return value != null && typeof value === 'object' && formatExtendedJsonScalar(value) == null
}

function Node({ name, value, depth, defaultExpandDepth }: { name?: string; value: unknown; depth: number; defaultExpandDepth: number }) {
  const [open, setOpen] = useState(depth < defaultExpandDepth)
  const container = isContainer(value)
  const entries = container ? (Array.isArray(value) ? value.map((v, i) => [String(i), v] as const) : Object.entries(value)) : []
  const summary = Array.isArray(value) ? `Array(${entries.length})` : `{ ${entries.length} field${entries.length === 1 ? '' : 's'} }`

  return (
    <div style={{ paddingLeft: depth === 0 ? 0 : 14 }}>
      <div
        className={cn('flex items-start gap-1 rounded px-0.5 leading-5', container && 'cursor-pointer hover:bg-muted/40')}
        onClick={() => container && setOpen((o) => !o)}
      >
        {container ? (
          open ? <ChevronDown className="mt-1 h-3 w-3 shrink-0 text-muted-foreground" /> : <ChevronRight className="mt-1 h-3 w-3 shrink-0 text-muted-foreground" />
        ) : (
          <span className="w-3 shrink-0" />
        )}
        {name != null && <span className="shrink-0 text-foreground/90">{name}:</span>}
        {container ? <span className="text-muted-foreground">{summary}</span> : <Scalar value={value} />}
      </div>
      {container && open && entries.map(([k, v]) => <Node key={k} name={k} value={v} depth={depth + 1} defaultExpandDepth={defaultExpandDepth} />)}
    </div>
  )
}

/** Collapsible tree for a single document (Extended JSON aware). */
export function JsonTree({ value, defaultExpandDepth = 1 }: { value: Record<string, unknown>; defaultExpandDepth?: number }) {
  return (
    <div className="font-mono text-[11px]">
      {Object.entries(value).map(([k, v]) => (
        <Node key={k} name={k} value={v} depth={1} defaultExpandDepth={defaultExpandDepth + 1} />
      ))}
    </div>
  )
}
