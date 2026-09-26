import { cn } from '@/shared/lib/utils'

const PAGE_MAX = 'mx-auto w-full max-w-6xl'
const PAGE_FLUID = 'w-full'

interface PageHeaderProps {
  title: string
  description?: string
  actions?: React.ReactNode
  className?: string
  /** Use full content width instead of the centered max-w-6xl column */
  fluid?: boolean
}

export function PageHeader({ title, description, actions, className, fluid = false }: PageHeaderProps) {
  return (
    <header
      className={cn(
        'page-header page-gutter shrink-0 border-b border-border/70 bg-background',
        'py-3',
        className
      )}
    >
      <div
        className={cn(
          fluid ? PAGE_FLUID : PAGE_MAX,
          'flex min-h-7 items-center justify-between gap-3'
        )}
      >
        <div className="min-w-0">
          <h1 className="truncate text-[14.5px] font-medium leading-none text-foreground">
            {title}
          </h1>
          {description && (
            <p className="mt-1.5 truncate text-[12px] leading-snug text-muted-foreground">
              {description}
            </p>
          )}
        </div>

        {actions && (
          <div className="flex shrink-0 flex-wrap items-center gap-1.5 sm:justify-end">{actions}</div>
        )}
      </div>
    </header>
  )
}

export function PageContent({
  children,
  className = '',
  fullBleed = false,
  fluid = false
}: {
  children: React.ReactNode
  className?: string
  /** Skip max-width wrapper — use for split-pane layouts (e.g. Knowledge Base) */
  fullBleed?: boolean
  /** Keep page gutters but drop the centered max-w-6xl column */
  fluid?: boolean
}) {
  if (fullBleed) {
    return <div className={cn('flex min-h-0 flex-1 flex-col', className)}>{children}</div>
  }

  return (
    <div className={cn('page-gutter page-stack min-h-0 flex-1 overflow-y-auto bg-background', className)}>
      <div className={fluid ? PAGE_FLUID : PAGE_MAX}>{children}</div>
    </div>
  )
}
