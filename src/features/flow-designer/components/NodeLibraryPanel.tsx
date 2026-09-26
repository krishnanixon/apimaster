import { useEffect, useMemo, useState } from 'react'
import { Search, ChevronDown, ChevronRight, PanelLeftClose, X } from 'lucide-react'
import {
  NODE_LIBRARY,
  LIBRARY_ORDER_BY_FLOW,
  type NodeLibraryItem
} from '../lib/node-definitions'
import { DynamicIcon } from '../lib/dynamic-icon'
import { Input } from '@/shared/components/ui/input'
import { ScrollArea } from '@/shared/components/ui/scroll-area'
import { Button } from '@/shared/components/ui/button'
import { cn } from '@/shared/lib/utils'
import { PanelResizeHandle } from './PanelResizeHandle'
import { useFlowEditorStore } from '../stores/flow-editor.store'
import type { FlowCategory } from '@shared/types'

interface NodeLibraryPanelProps {
  collapsed?: boolean
  width?: number
  flowCategory?: FlowCategory
  onToggle?: () => void
  onResize?: (delta: number) => void
}

const COLLAPSED_STORAGE_KEY = 'flow-designer:library-collapsed-categories'

function loadCollapsedCategories(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(COLLAPSED_STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

export function NodeLibraryPanel({
  collapsed,
  width = 272,
  flowCategory,
  onToggle,
  onResize
}: NodeLibraryPanelProps) {
  const [query, setQuery] = useState('')
  const [collapsedCats, setCollapsedCats] = useState<Record<string, boolean>>(loadCollapsedCategories)
  const addLibraryNode = useFlowEditorStore((s) => s.addLibraryNode)

  useEffect(() => {
    localStorage.setItem(COLLAPSED_STORAGE_KEY, JSON.stringify(collapsedCats))
  }, [collapsedCats])

  const ordered = useMemo(() => {
    const order = LIBRARY_ORDER_BY_FLOW[flowCategory ?? 'process'] ?? LIBRARY_ORDER_BY_FLOW.process
    return [...NODE_LIBRARY].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id))
  }, [flowCategory])

  const totalCount = NODE_LIBRARY.reduce((sum, c) => sum + c.items.length, 0)

  if (collapsed) {
    return (
      <div className="flex w-11 shrink-0 flex-col items-center border-r border-border/60 bg-sidebar py-3">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={onToggle}
          title="Expand node library"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    )
  }

  const q = query.trim().toLowerCase()
  const filtered = ordered
    .map((cat) => ({
      ...cat,
      items: cat.items.filter(
        (item) =>
          !q ||
          item.label.toLowerCase().includes(q) ||
          item.category.toLowerCase().includes(q) ||
          item.nodeType.toLowerCase().includes(q)
      )
    }))
    .filter((cat) => cat.items.length > 0)

  const onDragStart = (e: React.DragEvent, item: NodeLibraryItem) => {
    e.dataTransfer.setData('application/flow-node', JSON.stringify(item))
    e.dataTransfer.effectAllowed = 'move'
  }

  return (
    <div
      className="relative flex shrink-0 flex-col border-r border-border/60 bg-sidebar"
      style={{ width }}
    >
      {onResize && <PanelResizeHandle side="left" onResize={onResize} />}
      <div className="flex items-center justify-between border-b border-border/40 px-3 py-2.5">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Node library
          </p>
          <p className="text-xs text-muted-foreground">Click or drag · {totalCount}</p>
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={onToggle} title="Collapse">
          <PanelLeftClose className="h-4 w-4" />
        </Button>
      </div>

      <div className="border-b border-border/40 p-2.5">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search nodes…"
            className="h-8 pl-9 pr-8 text-xs"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-1.5 p-2.5">
          {filtered.map((cat) => {
            const isOpen = !collapsedCats[cat.id]
            return (
              <div key={cat.id} className="overflow-hidden rounded-lg border border-border/50 bg-card">
                <button
                  type="button"
                  onClick={() => setCollapsedCats((c) => ({ ...c, [cat.id]: !c[cat.id] }))}
                  className={cn(
                    'flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-accent/40',
                    isOpen && 'bg-accent/10'
                  )}
                >
                  {isOpen ? (
                    <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  )}
                  <span className="flex-1 text-xs font-semibold">{cat.label}</span>
                  <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
                    {cat.items.length}
                  </span>
                </button>
                {isOpen && (
                  <div className="grid grid-cols-2 gap-1.5 border-t border-border/40 p-2">
                    {cat.items.map((item) => (
                      <div
                        key={item.id}
                        role="button"
                        tabIndex={0}
                        draggable
                        onDragStart={(e) => onDragStart(e, item)}
                        onClick={() => addLibraryNode(item)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            addLibraryNode(item)
                          }
                        }}
                        className="group flex cursor-grab items-center gap-1.5 rounded-md border border-border/50 bg-background px-1.5 py-1.5 text-left transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md active:cursor-grabbing active:translate-y-0"
                        title={item.description ?? `Add ${item.label}`}
                      >
                        <span
                          className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded text-white transition-transform group-hover:scale-105"
                          style={{ backgroundColor: item.color }}
                        >
                          <DynamicIcon name={item.icon} className="h-3 w-3" />
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[10px] font-medium leading-tight">
                          {item.label}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
          {filtered.length === 0 && (
            <div className="flex flex-col items-center gap-1 py-10 text-center">
              <Search className="h-5 w-5 text-muted-foreground/50" />
              <p className="text-xs text-muted-foreground">No nodes match “{query}”</p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
