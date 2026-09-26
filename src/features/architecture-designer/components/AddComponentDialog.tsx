import { useMemo, useState } from 'react'
import type { ArchComponentKind } from '@shared/types/architecture'
import { ARCH_CATEGORIES, ARCH_COMPONENT_KINDS } from '@shared/lib/architecture-catalog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/shared/components/ui/dialog'
import { Input } from '@/shared/components/ui/input'
import { DynamicIcon } from '../lib/dynamic-icon'
import { cn } from '@/shared/lib/utils'

interface AddComponentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (kind: ArchComponentKind, label: string) => void
  /** Restricts the palette, e.g. the Database section only offers stores. */
  categories?: string[]
}

export function AddComponentDialog({
  open,
  onOpenChange,
  onSelect,
  categories
}: AddComponentDialogProps) {
  const [query, setQuery] = useState('')

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    return ARCH_CATEGORIES.filter((c) => !categories || categories.includes(c.id))
      .map((category) => ({
        category,
        kinds: ARCH_COMPONENT_KINDS.filter(
          (meta) =>
            meta.category === category.id &&
            (!q ||
              meta.label.toLowerCase().includes(q) ||
              meta.description.toLowerCase().includes(q) ||
              (meta.defaultTechnology ?? '').toLowerCase().includes(q))
        )
      }))
      .filter((group) => group.kinds.length > 0)
  }, [query, categories])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-sm">Add module</DialogTitle>
          <DialogDescription className="text-xs">
            Pick a module type. You can rename it and fill in details afterwards.
          </DialogDescription>
        </DialogHeader>

        <Input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search component types"
          className="h-8 text-[12px]"
        />

        <div className="max-h-96 overflow-y-auto pr-1">
          {groups.length === 0 ? (
            <p className="py-8 text-center text-[12px] text-muted-foreground">
              No component types match “{query}”.
            </p>
          ) : (
            groups.map(({ category, kinds }) => (
              <div key={category.id} className="mb-4 last:mb-0">
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {category.label}
                </p>
                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                  {kinds.map((meta) => (
                    <button
                      key={meta.kind}
                      type="button"
                      onClick={() => {
                        onSelect(meta.kind, meta.label)
                        onOpenChange(false)
                        setQuery('')
                      }}
                      className={cn(
                        'flex items-center gap-2 rounded-md border border-border/60 px-2 py-1.5 text-left',
                        'transition-colors duration-fast ease-out hover:border-border hover:bg-muted',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40'
                      )}
                    >
                      <div
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded"
                        style={{ backgroundColor: `${meta.color}1a`, color: meta.color }}
                      >
                        <DynamicIcon name={meta.icon} className="h-3.5 w-3.5" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-[12px] font-medium leading-tight">{meta.label}</p>
                        <p className="truncate text-[10px] leading-tight text-muted-foreground">
                          {meta.defaultTechnology ?? meta.description}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
