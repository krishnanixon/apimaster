import { useEffect, useMemo, useState } from 'react'
import { cn } from '@/shared/lib/utils'
import type { IndexedSymbol, SymbolKind } from '@shared/types/code-intel'
import { useCodeEditorStore } from '../stores/codeEditor.store'
import { useOutlineStore } from '../stores/outline.store'

const KIND_COLOR: Record<SymbolKind, string> = {
  function: 'text-amber-400',
  method: 'text-amber-400',
  class: 'text-sky-400',
  interface: 'text-emerald-400',
  type: 'text-emerald-400',
  enum: 'text-purple-400',
  variable: 'text-blue-300',
  export: 'text-muted-foreground',
  import: 'text-muted-foreground',
  component: 'text-pink-400',
  hook: 'text-violet-400',
  route: 'text-orange-400',
  endpoint: 'text-orange-400'
}

export function OutlinePanel() {
  const activeTabPath = useCodeEditorStore((s) => s.activeTabPath)
  const cursor = useCodeEditorStore((s) => s.cursor)
  const goToLine = useCodeEditorStore((s) => s.goToLine)
  const symbols = useOutlineStore((s) => s.symbols)
  const loading = useOutlineStore((s) => s.loading)
  const load = useOutlineStore((s) => s.load)
  const [filter, setFilter] = useState('')

  useEffect(() => {
    void load(activeTabPath)
  }, [activeTabPath, load])

  const visible = useMemo(() => {
    const term = filter.trim().toLowerCase()
    if (!term) return symbols
    return symbols.filter((symbol) => symbol.name.toLowerCase().includes(term))
  }, [symbols, filter])

  const activeLine = cursor?.line ?? 0

  return (
    <div className="flex h-full min-h-0 flex-col text-[12px]">
      <input
        value={filter}
        onChange={(event) => setFilter(event.target.value)}
        placeholder="Filter symbols"
        className="h-6 border-b border-[var(--wb-border)] bg-transparent px-3 text-[12px] outline-none placeholder:text-[var(--wb-muted)]"
      />
      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        {!activeTabPath ? (
          <p className="px-3 py-4 text-xs text-muted-foreground">Open a file to see its outline.</p>
        ) : loading ? (
          <p className="px-3 py-4 text-xs text-muted-foreground">Loading…</p>
        ) : visible.length === 0 ? (
          <p className="px-3 py-4 text-xs text-muted-foreground">No symbols in this file.</p>
        ) : (
          visible.map((symbol) => (
            <OutlineRow
              key={`${symbol.name}:${symbol.startLine}:${symbol.kind}`}
              symbol={symbol}
              active={activeLine >= symbol.startLine && activeLine <= symbol.endLine}
              onOpen={() => goToLine(symbol.startLine, 1)}
            />
          ))
        )}
      </div>
    </div>
  )
}

function OutlineRow({
  symbol,
  active,
  onOpen
}: {
  symbol: IndexedSymbol
  active: boolean
  onOpen: () => void
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        'flex w-full items-center gap-1.5 px-2 py-0.5 text-left text-[12px] hover:bg-accent',
        active && 'bg-accent/70 text-foreground',
        symbol.container && 'pl-5'
      )}
      title={`${symbol.kind} · :${symbol.startLine}`}
    >
      <span className={cn('w-3.5 shrink-0 text-center font-mono text-[10px]', KIND_COLOR[symbol.kind])}>
        {symbol.kind.slice(0, 1).toUpperCase()}
      </span>
      <span className="truncate">{symbol.name}</span>
      <span className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground">:{symbol.startLine}</span>
    </button>
  )
}
