import { cn } from '@/shared/lib/utils'
import { PageContent, PageHeader } from '@/shared/components/layout/PageHeader'

export { PageContent, PageHeader }

/**
 * Standard module shell — every non-immersive page should start with this.
 * Pair with PageHeader (+ optional ModuleToolbar) and PageContent.
 */
export function ModulePage({
  children,
  className
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex h-full min-h-0 flex-col overflow-hidden bg-background',
        className
      )}
    >
      {children}
    </div>
  )
}

/** Secondary strip under PageHeader for tabs, search, and filters. */
export function ModuleToolbar({
  children,
  className
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'page-gutter flex h-10 shrink-0 items-center gap-2 border-b border-border/60 bg-background',
        className
      )}
    >
      {children}
    </div>
  )
}

/** Compact tab control used inside ModuleToolbar. */
export function ModuleTab({
  active,
  onClick,
  children,
  count
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  count?: number
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex h-7 items-center gap-1 rounded-md px-2.5 text-xs font-medium transition-colors',
        active
          ? 'bg-muted text-foreground'
          : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
      )}
    >
      {children}
      {typeof count === 'number' && (
        <span className="tabular-nums text-[10px] text-muted-foreground">{count}</span>
      )}
    </button>
  )
}
