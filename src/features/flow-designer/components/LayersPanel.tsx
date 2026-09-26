import { useState } from 'react'
import { Search, Eye, EyeOff, Lock, Unlock, Layers, Focus } from 'lucide-react'
import { useFlowEditorStore } from '../stores/flow-editor.store'
import { Input } from '@/shared/components/ui/input'
import { ScrollArea } from '@/shared/components/ui/scroll-area'
import { cn } from '@/shared/lib/utils'

export function LayersPanel() {
  const {
    nodes,
    selectedNodeIds,
    setSelection,
    toggleNodeHidden,
    toggleNodeLocked,
    focusSelection
  } = useFlowEditorStore()
  const [query, setQuery] = useState('')

  const filtered = nodes.filter((n) => {
    const label = String(n.data?.label ?? '').toLowerCase()
    return !query || label.includes(query.toLowerCase())
  })

  const handleSelect = (id: string, multi: boolean) => {
    if (multi) {
      const next = selectedNodeIds.includes(id)
        ? selectedNodeIds.filter((x) => x !== id)
        : [...selectedNodeIds, id]
      setSelection(next)
    } else {
      setSelection([id])
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border p-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search layers..."
            className="h-8 pl-9 text-xs"
          />
        </div>
        {selectedNodeIds.length > 0 && (
          <p className="mt-2 text-[10px] text-muted-foreground">
            {selectedNodeIds.length} selected · Shift+click to multi-select
          </p>
        )}
      </div>
      <ScrollArea className="flex-1">
        <div className="space-y-1 p-3">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center py-10 text-center">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                <Layers className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className="text-xs text-muted-foreground">No nodes on canvas</p>
            </div>
          ) : (
            filtered.map((node, index) => {
              const hidden = Boolean(node.hidden ?? node.data?.hidden)
              const locked = Boolean(node.data?.locked)
              const selected = selectedNodeIds.includes(node.id)
              const color = String(node.data?.color ?? 'hsl(var(--primary))')
              return (
                <div
                  key={node.id}
                  className={cn(
                    'group flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs shadow-sm transition-all',
                    selected
                      ? 'border-primary/50 bg-primary/5 ring-1 ring-primary/20'
                      : 'border-transparent bg-card hover:border-border hover:bg-accent/30',
                    hidden && 'opacity-50'
                  )}
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                  <span className="w-4 shrink-0 text-[10px] tabular-nums text-muted-foreground">
                    {index + 1}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => handleSelect(node.id, e.shiftKey)}
                    onDoubleClick={() => {
                      setSelection([node.id])
                      focusSelection()
                    }}
                    className="min-w-0 flex-1 truncate text-left font-medium"
                  >
                    {String(node.data?.label ?? node.id)}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelection([node.id])
                      focusSelection()
                    }}
                    className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-accent group-hover:opacity-100 [.border-primary\/50_&]:opacity-100"
                    title="Focus on canvas"
                  >
                    <Focus className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleNodeHidden(node.id)}
                    className="rounded p-1 text-muted-foreground hover:bg-accent"
                    title={hidden ? 'Show' : 'Hide'}
                  >
                    {hidden ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleNodeLocked(node.id)}
                    className="rounded p-1 text-muted-foreground hover:bg-accent"
                    title={locked ? 'Unlock' : 'Lock'}
                  >
                    {locked ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
                  </button>
                </div>
              )
            })
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
