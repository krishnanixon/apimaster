import { memo, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Copy, Braces, Filter } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/shared/lib/utils'
import { formatJsonPath, type JsonPathSegment } from '@shared/lib/json-path'

/** Children beyond this count render behind a "show more" row so huge arrays stay responsive. */
const PAGE_SIZE = 200

interface TreeContext {
  query: string
  onQueryPath?: (path: string) => void
}

function valueColorClass(value: unknown): string {
  if (value === null) return 'text-red-500/90 dark:text-red-400'
  switch (typeof value) {
    case 'string':
      return 'text-emerald-700 dark:text-emerald-400'
    case 'number':
      return 'text-blue-700 dark:text-sky-400'
    case 'boolean':
      return 'text-amber-700 dark:text-amber-400'
    default:
      return 'text-foreground'
  }
}

function formatPrimitive(value: unknown): string {
  if (value === null) return 'null'
  if (typeof value === 'string') return JSON.stringify(value)
  return String(value)
}

function primitiveMatches(label: string | null, value: unknown, q: string): boolean {
  if (label?.toLowerCase().includes(q)) return true
  return formatPrimitive(value).toLowerCase().includes(q)
}

/**
 * Whether `value` (or anything beneath it) matches the filter. Memoized per
 * object identity so filtering a large document is linear, not quadratic.
 */
function buildMatcher(query: string) {
  const q = query.trim().toLowerCase()
  const cache = new WeakMap<object, boolean>()
  const subtreeMatches = (label: string | null, value: unknown): boolean => {
    if (!q) return true
    if (label?.toLowerCase().includes(q)) return true
    if (value === null || typeof value !== 'object') return primitiveMatches(null, value, q)
    const cached = cache.get(value)
    if (cached !== undefined) return cached
    const entries = Array.isArray(value) ? value.map((v, i) => [String(i), v] as const) : Object.entries(value)
    const hit = entries.some(([k, v]) => subtreeMatches(Array.isArray(value) ? null : k, v))
    cache.set(value, hit)
    return hit
  }
  return { q, subtreeMatches }
}

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>
  const idx = text.toLowerCase().indexOf(query)
  if (idx === -1) return <>{text}</>
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded-sm bg-yellow-300/50 text-inherit dark:bg-yellow-500/30">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  )
}

async function copy(label: string, text: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(`${label} copied`)
  } catch {
    toast.error('Copy failed')
  }
}

function NodeActions({ segments, value, ctx }: { segments: JsonPathSegment[]; value: unknown; ctx: TreeContext }) {
  const path = formatJsonPath(segments)
  const stop = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation()
    fn()
  }
  return (
    <span className="ml-2 hidden shrink-0 items-center gap-0.5 group-hover/node:inline-flex">
      <button
        type="button"
        className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
        title={`Copy path ${path}`}
        aria-label="Copy JSONPath"
        onClick={stop(() => void copy('Path', path))}
      >
        <Braces className="h-3 w-3" />
      </button>
      <button
        type="button"
        className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
        title="Copy value as JSON"
        aria-label="Copy value as JSON"
        onClick={stop(() => void copy('Value', typeof value === 'string' ? value : JSON.stringify(value, null, 2)))}
      >
        <Copy className="h-3 w-3" />
      </button>
      {ctx.onQueryPath && (
        <button
          type="button"
          className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          title="Query this path"
          aria-label="Query this path"
          onClick={stop(() => ctx.onQueryPath?.(path))}
        >
          <Filter className="h-3 w-3" />
        </button>
      )}
    </span>
  )
}

interface JsonNodeProps {
  label: string | null
  value: unknown
  segments: JsonPathSegment[]
  depth: number
  defaultCollapsed?: boolean
  ctx: TreeContext
  matcher: ReturnType<typeof buildMatcher>
}

const JsonNode = memo(function JsonNode({ label, value, segments, depth, defaultCollapsed, ctx, matcher }: JsonNodeProps) {
  const isObject = value !== null && typeof value === 'object'
  const isArray = Array.isArray(value)
  const [collapsed, setCollapsed] = useState(defaultCollapsed ?? depth > 2)
  const [visible, setVisible] = useState(PAGE_SIZE)
  const filtering = matcher.q.length > 0

  if (!isObject) {
    return (
      <div className="group/node flex items-start gap-1.5 rounded py-0.5 hover:bg-accent/30" style={{ paddingLeft: depth * 16 + 16 }}>
        {label !== null && (
          <span className="shrink-0 text-sky-700 dark:text-sky-400">
            <Highlight text={label} query={matcher.q} />
          </span>
        )}
        {label !== null && <span className="text-muted-foreground">:</span>}
        <span className={cn('min-w-0 break-all', valueColorClass(value))}>
          <Highlight text={formatPrimitive(value)} query={matcher.q} />
        </span>
        <NodeActions segments={segments} value={value} ctx={ctx} />
      </div>
    )
  }

  const allEntries = isArray
    ? (value as unknown[]).map((v, i) => [i, v] as const)
    : Object.entries(value as Record<string, unknown>)
  // A matching container label shows all its children; otherwise keep only matching branches.
  const labelHit = filtering && label !== null && label.toLowerCase().includes(matcher.q)
  const entries =
    filtering && !labelHit
      ? allEntries.filter(([k, v]) => matcher.subtreeMatches(typeof k === 'number' ? null : k, v))
      : allEntries
  // While filtering, expand everything so matches are visible without clicking.
  const isCollapsed = filtering ? false : collapsed
  const bracket = isArray ? ['[', ']'] : ['{', '}']
  const shown = entries.slice(0, visible)

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setCollapsed((c) => !c)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setCollapsed((c) => !c)
          }
        }}
        className="group/node flex w-full cursor-pointer items-start gap-1 rounded py-0.5 text-left hover:bg-accent/40"
        style={{ paddingLeft: depth * 16 }}
      >
        {isCollapsed ? (
          <ChevronRight className="mt-1 h-3 w-3 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronDown className="mt-1 h-3 w-3 shrink-0 text-muted-foreground" />
        )}
        {label !== null && (
          <span className="text-sky-700 dark:text-sky-400">
            <Highlight text={label} query={matcher.q} />
          </span>
        )}
        {label !== null && <span className="text-muted-foreground">:</span>}
        <span className="text-muted-foreground">
          {bracket[0]}
          {isCollapsed && (
            <span className="text-foreground/70">
              {' '}
              {allEntries.length} {isArray ? 'items' : 'keys'}{' '}
            </span>
          )}
          {isCollapsed && bracket[1]}
        </span>
        <NodeActions segments={segments} value={value} ctx={ctx} />
      </div>
      {!isCollapsed && (
        <div>
          {shown.map(([key, val]) => (
            <JsonNode
              key={key}
              label={isArray ? null : String(key)}
              value={val}
              segments={[...segments, key]}
              depth={depth + 1}
              ctx={ctx}
              matcher={matcher}
            />
          ))}
          {entries.length > visible && (
            <button
              type="button"
              className="py-0.5 text-[11px] text-primary hover:underline"
              style={{ paddingLeft: (depth + 1) * 16 + 16 }}
              onClick={() => setVisible((v) => v + PAGE_SIZE * 5)}
            >
              Show more ({(entries.length - visible).toLocaleString()} remaining)
            </button>
          )}
          <div className="text-muted-foreground" style={{ paddingLeft: depth * 16 + 16 }}>
            {bracket[1]}
          </div>
        </div>
      )}
    </div>
  )
})

export function JsonTreeView({
  data,
  className,
  search = '',
  onQueryPath,
  rootSegments = []
}: {
  data: unknown
  className?: string
  search?: string
  /** When set, each node offers "Query this path" which calls back with its JSONPath. */
  onQueryPath?: (path: string) => void
  /** Path of `data` within a larger document (used for JSONPath query results). */
  rootSegments?: JsonPathSegment[]
}) {
  const matcher = useMemo(() => buildMatcher(search), [search])
  const ctx = useMemo<TreeContext>(() => ({ query: matcher.q, onQueryPath }), [matcher.q, onQueryPath])
  const noMatches = matcher.q.length > 0 && !matcher.subtreeMatches(null, data)
  return (
    <div className={cn('font-mono text-[13px] leading-relaxed', className)}>
      {noMatches ? (
        <p className="font-sans text-xs text-muted-foreground">No keys or values match “{search}”.</p>
      ) : (
        <JsonNode
          label={null}
          value={data}
          segments={rootSegments}
          depth={0}
          defaultCollapsed={false}
          ctx={ctx}
          matcher={matcher}
        />
      )}
    </div>
  )
}
