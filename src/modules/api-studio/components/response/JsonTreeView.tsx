import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '@/shared/lib/utils'

interface JsonNodeProps {
  label: string | null
  value: unknown
  depth: number
  defaultCollapsed?: boolean
  search?: string
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
  if (typeof value === 'string') return `"${value}"`
  return String(value)
}

function matchesSearch(key: string | null, value: unknown, query: string): boolean {
  if (!query.trim()) return true
  const q = query.toLowerCase()
  if (key?.toLowerCase().includes(q)) return true
  if (typeof value === 'string' && value.toLowerCase().includes(q)) return true
  if (value !== null && typeof value === 'object') return true
  return String(value).toLowerCase().includes(q)
}

function JsonNode({ label, value, depth, defaultCollapsed, search = '' }: JsonNodeProps) {
  const isObject = value !== null && typeof value === 'object'
  const isArray = Array.isArray(value)
  const [collapsed, setCollapsed] = useState(defaultCollapsed ?? depth > 2)

  if (!isObject) {
    if (!matchesSearch(label, value, search)) return null
    return (
      <div className="flex items-start gap-1.5 py-0.5" style={{ paddingLeft: depth * 16 }}>
        {label !== null && <span className="text-sky-700 dark:text-sky-400">{label}</span>}
        {label !== null && <span className="text-muted-foreground">:</span>}
        <span className={cn('break-all', valueColorClass(value))}>{formatPrimitive(value)}</span>
      </div>
    )
  }

  const entries = isArray
    ? (value as unknown[]).map((v, i) => [String(i), v] as const)
    : Object.entries(value as Record<string, unknown>)
  const filtered = search.trim()
    ? entries.filter(([key, val]) => matchesSearch(isArray ? null : key, val, search))
    : entries

  if (search.trim() && filtered.length === 0 && !matchesSearch(label, value, search)) return null

  const bracket = isArray ? ['[', ']'] : ['{', '}']

  return (
    <div>
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="flex w-full items-start gap-1 rounded py-0.5 text-left hover:bg-accent/40"
        style={{ paddingLeft: depth * 16 }}
      >
        {collapsed ? (
          <ChevronRight className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronDown className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
        )}
        {label !== null && <span className="text-sky-700 dark:text-sky-400">{label}</span>}
        {label !== null && <span className="text-muted-foreground">:</span>}
        <span className="text-muted-foreground">
          {bracket[0]}
          {collapsed && (
            <span className="text-foreground/70">
              {filtered.length} {isArray ? 'items' : 'keys'}
            </span>
          )}
          {collapsed && bracket[1]}
        </span>
      </button>
      {!collapsed && (
        <div>
          {filtered.map(([key, val]) => (
            <JsonNode key={key} label={isArray ? null : key} value={val} depth={depth + 1} search={search} />
          ))}
          <div className="text-muted-foreground" style={{ paddingLeft: depth * 16 }}>
            {bracket[1]}
          </div>
        </div>
      )}
    </div>
  )
}

export function JsonTreeView({
  data,
  className,
  search = ''
}: {
  data: unknown
  className?: string
  search?: string
}) {
  return (
    <div className={cn('font-mono text-[13px] leading-relaxed', className)}>
      <JsonNode label={null} value={data} depth={0} defaultCollapsed={false} search={search} />
    </div>
  )
}
