import { cn } from '@/shared/lib/utils'

const PAGE_MAX = 'mx-auto w-full max-w-6xl'
const PAGE_FLUID = 'w-full'

/**
 * Page headers always span the full content width so their actions line up with
 * the right edge of whatever sits below — split panes as well as centered pages.
 */

interface PageHeaderProps {
  title: string
  description?: string
  actions?: React.ReactNode
  className?: string
  /** @deprecated Headers are always full width; kept so existing call sites compile. */
  fluid?: boolean
}

export function PageHeader({ title, description, actions, className }: PageHeaderProps) {
  return (
    <header
      className={cn(
        'page-header shrink-0 border-b border-border/70 bg-background px-5',
        className
      )}
    >
      <div className="flex h-14 items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="truncate text-[14px] font-semibold leading-tight tracking-tight text-foreground">
            {title}
          </h1>
          {description && (
            <p className="mt-0.5 truncate text-[12px] leading-snug text-muted-foreground" title={description}>
              {description}
            </p>
          )}
        </div>

        {actions && (
          <div className="flex shrink-0 items-center gap-2">{actions}</div>
        )}
      </div>
    </header>
  )
}

export function PageContent({
  children,
  className = '',
  fullBleed = false,
  fluid = true
}: {
  children: React.ReactNode
  className?: string
  /** Skip max-width wrapper — use for split-pane layouts (e.g. Knowledge Base) */
  fullBleed?: boolean
  /** Full width (the default). Pass false to center content in a max-w-6xl column. */
  fluid?: boolean
}) {
  if (fullBleed) {
    return <div className={cn('flex min-h-0 flex-1 flex-col', className)}>{children}</div>
  }

  return (
    <div className={cn('min-h-0 flex-1 overflow-y-auto bg-background px-5 py-5', className)}>
      <div className={fluid ? PAGE_FLUID : PAGE_MAX}>{children}</div>
    </div>
  )
}
