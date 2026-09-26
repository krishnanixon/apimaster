import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import type { ArchComponentCategory, ArchComponentKind } from '@shared/types/architecture'
import { ARCH_CATEGORIES, getComponentKindMeta } from '@shared/lib/architecture-catalog'
import { Button } from '@/shared/components/ui/button'
import { useArchitectureEditorStore } from '../stores/architecture-editor.store'
import { AddComponentDialog } from '../components/AddComponentDialog'
import { SectionShell, SectionEmpty } from './SectionShell'
import { DynamicIcon } from '../lib/dynamic-icon'
import { cn } from '@/shared/lib/utils'

interface ComponentsSectionProps {
  title: string
  description: string
  /** Restricts both the list and the add palette. Omit for all components. */
  categories?: ArchComponentCategory[]
  emptyTitle: string
  emptyDescription: string
}

type CategoryFilter = 'all' | ArchComponentCategory

export function ComponentsSection({
  title,
  description,
  categories,
  emptyTitle,
  emptyDescription
}: ComponentsSectionProps) {
  const { model, selectedComponentIds, selectComponents, dispatch, searchQuery } =
    useArchitectureEditorStore()
  const [pickerOpen, setPickerOpen] = useState(false)
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all')

  const allowCategoryTabs = !categories || categories.length > 1

  const filterOptions = useMemo(() => {
    if (!allowCategoryTabs) return [] as { id: CategoryFilter; label: string }[]
    const base = categories ?? ARCH_CATEGORIES.map((c) => c.id)
    return [
      { id: 'all' as const, label: 'All' },
      ...ARCH_CATEGORIES.filter((c) => base.includes(c.id)).map((c) => ({
        id: c.id as CategoryFilter,
        label: c.label
      }))
    ]
  }, [allowCategoryTabs, categories])

  const visible = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return model.components.filter((component) => {
      if (categories && !categories.includes(component.category)) return false
      if (categoryFilter !== 'all' && component.category !== categoryFilter) return false
      if (!q) return true
      return [component.name, component.technology, component.description, ...component.tags]
        .join(' ')
        .toLowerCase()
        .includes(q)
    })
  }, [model.components, categories, categoryFilter, searchQuery])

  const handleAdd = (kind: ArchComponentKind, label: string) => {
    dispatch({ type: 'ADD_COMPONENT', component: { name: label, kind } })
  }

  const pickerCategories =
    categoryFilter !== 'all'
      ? [categoryFilter]
      : categories

  return (
    <SectionShell
      title={title}
      description={description}
      actions={
        <Button size="sm" className="h-7" onClick={() => setPickerOpen(true)}>
          <Plus className="h-3.5 w-3.5" />
          Add
        </Button>
      }
    >
      {filterOptions.length > 1 && (
        <div className="mb-3 flex flex-wrap gap-1">
          {filterOptions.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setCategoryFilter(option.id)}
              className={cn(
                'rounded-md px-2 py-1 text-[11px] transition-colors duration-fast',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
                categoryFilter === option.id
                  ? 'bg-primary/10 font-medium text-primary'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}

      {visible.length === 0 ? (
        <SectionEmpty
          title={searchQuery || categoryFilter !== 'all' ? 'No matching components' : emptyTitle}
          description={
            searchQuery || categoryFilter !== 'all'
              ? 'Try a different filter or search term.'
              : emptyDescription
          }
          action={
            !searchQuery && (
              <Button size="sm" onClick={() => setPickerOpen(true)}>
                <Plus className="h-3.5 w-3.5" />
                Add component
              </Button>
            )
          }
        />
      ) : (
        <ul className="flex flex-col gap-1.5">
          {visible.map((component) => {
            const meta = getComponentKindMeta(component.kind)
            const isSelected = selectedComponentIds.includes(component.id)
            const connectionCount = model.connections.filter(
              (c) => c.from === component.id || c.to === component.id
            ).length

            return (
              <li key={component.id}>
                <button
                  type="button"
                  onClick={() => selectComponents([component.id])}
                  aria-pressed={isSelected}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-lg border p-2.5 text-left',
                    'transition-colors duration-fast ease-out',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
                    isSelected
                      ? 'border-primary/40 bg-primary/5'
                      : 'border-border/60 bg-card hover:border-border hover:bg-muted/50'
                  )}
                >
                  <div
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md"
                    style={{
                      backgroundColor: `${meta?.color ?? '#64748b'}1a`,
                      color: meta?.color ?? '#64748b'
                    }}
                  >
                    <DynamicIcon name={meta?.icon} className="h-4 w-4" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <p className="truncate text-[13px] font-medium leading-tight">{component.name}</p>
                      <span className="shrink-0 text-[10px] text-muted-foreground">
                        {meta?.label ?? component.kind}
                      </span>
                    </div>
                    <p className="truncate text-[11px] leading-tight text-muted-foreground">
                      {component.description || component.technology || 'No description'}
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-0.5 text-[10px] text-muted-foreground">
                    {component.technology && (
                      <span className="rounded bg-muted px-1.5 py-0.5">{component.technology}</span>
                    )}
                    <span className="tabular-nums">
                      {connectionCount} link{connectionCount === 1 ? '' : 's'}
                      {component.apis.length > 0 && ` · ${component.apis.length} API`}
                    </span>
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <AddComponentDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onSelect={handleAdd}
        categories={pickerCategories}
      />
    </SectionShell>
  )
}
