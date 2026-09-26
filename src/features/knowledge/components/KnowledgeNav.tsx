import { cn } from '@/shared/lib/utils'
import type { KnowledgeSection } from '@shared/types'
import { KNOWLEDGE_NAV } from '../lib/sections'

interface KnowledgeNavProps {
  active: KnowledgeSection
  onSelect: (section: KnowledgeSection) => void
  stats?: { modules: number; requirements: number; documents?: number } | null
}

export function KnowledgeNav({ active, onSelect, stats }: KnowledgeNavProps) {
  const counts: Partial<Record<KnowledgeSection, number>> = {
    modules: stats?.modules,
    requirements: stats?.requirements,
    documents: stats?.documents
  }

  return (
    <nav className="flex h-full w-48 shrink-0 flex-col border-r border-border bg-sidebar">
      <div className="shrink-0 border-b border-border px-3 py-2.5">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Knowledge</p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        <ul className="flex flex-col gap-0.5">
          {KNOWLEDGE_NAV.map(({ id, label, icon: Icon }) => {
            const isActive = active === id
            const count = counts[id]

            return (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => onSelect(id)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors',
                    isActive
                      ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                      : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground'
                  )}
                >
                  <Icon className={cn('h-3.5 w-3.5 shrink-0', isActive && 'text-primary')} />
                  <span className={cn('min-w-0 flex-1 truncate text-xs font-medium', isActive && 'text-foreground')}>
                    {label}
                  </span>
                  {count !== undefined && count > 0 && (
                    <span className="rounded-full bg-muted px-1.5 text-[10px] tabular-nums text-muted-foreground">
                      {count}
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </nav>
  )
}
