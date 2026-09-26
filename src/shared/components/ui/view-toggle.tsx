import { LayoutGrid, List } from 'lucide-react'
import { cn } from '@/shared/lib/utils'

export type ViewMode = 'grid' | 'list'

interface ViewToggleProps {
  value: ViewMode
  onChange: (mode: ViewMode) => void
  className?: string
}

/** Standardized grid/list switch used across list-style pages (Projects, Documents, Flows). */
export function ViewToggle({ value, onChange, className }: ViewToggleProps) {
  return (
    <div className={cn('flex shrink-0 rounded-lg border border-border bg-background p-0.5', className)}>
      <button
        type="button"
        onClick={() => onChange('grid')}
        aria-pressed={value === 'grid'}
        title="Grid view"
        className={cn(
          'flex items-center justify-center rounded-md p-1.5 transition-colors',
          value === 'grid' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
        )}
      >
        <LayoutGrid className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => onChange('list')}
        aria-pressed={value === 'list'}
        title="List view"
        className={cn(
          'flex items-center justify-center rounded-md p-1.5 transition-colors',
          value === 'list' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
        )}
      >
        <List className="h-4 w-4" />
      </button>
    </div>
  )
}
