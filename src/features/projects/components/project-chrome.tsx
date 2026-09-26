import type { ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/components/ui/button'

export const appleLink = 'text-sm text-primary hover:underline'

export function AppleCanvas({
  children,
  className,
  header,
  wide = false,
  muted = false
}: {
  children: ReactNode
  className?: string
  header?: ReactNode
  wide?: boolean
  muted?: boolean
}) {
  return (
    <div
      className={cn(
        'flex h-full min-h-0 flex-1 flex-col overflow-hidden',
        muted ? 'bg-muted/50 dark:bg-background' : 'bg-background',
        className
      )}
    >
      {header}
      <div className="page-gutter page-stack flex-1 overflow-y-auto">
        <div className={cn('mx-auto w-full space-y-6 pb-10', wide ? 'max-w-7xl' : 'max-w-6xl')}>
          {children}
        </div>
      </div>
    </div>
  )
}

export function AppleHero({
  eyebrow,
  title,
  subtitle,
  actions,
  compact = false
}: {
  eyebrow?: string
  title: string
  subtitle?: string
  actions?: ReactNode
  align?: 'center' | 'left'
  compact?: boolean
}) {
  return (
    <header
      className={cn(
        'flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between',
        compact ? 'gap-2' : 'sm:items-start'
      )}
    >
      <div className={cn('min-w-0', compact ? '' : 'space-y-1')}>
        {eyebrow && (
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{eyebrow}</p>
        )}
        <h1
          className={cn(
            'break-words font-semibold leading-tight tracking-tight',
            compact ? 'text-base' : 'text-xl md:text-2xl'
          )}
        >
          {title}
        </h1>
        {subtitle && (
          <p
            className={cn(
              'text-muted-foreground',
              compact ? 'truncate text-[11px]' : 'max-w-2xl text-sm leading-normal'
            )}
          >
            {subtitle}
          </p>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">{actions}</div>}
    </header>
  )
}

export function AppleSection({
  title,
  action,
  children,
  className,
  description
}: {
  title?: string
  action?: ReactNode
  children: ReactNode
  className?: string
  description?: string
}) {
  return (
    <section className={cn('space-y-3', className)}>
      {(title || action) && (
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            {title && <h2 className="text-sm font-semibold tracking-tight">{title}</h2>}
            {description && <p className="mt-0.5 text-[11px] text-muted-foreground">{description}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

export function AppleTile({
  children,
  onClick,
  featured = false,
  className,
  padded = true
}: {
  children: ReactNode
  onClick?: () => void
  featured?: boolean
  className?: string
  padded?: boolean
}) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'overflow-hidden rounded-2xl border border-border/80 bg-card text-card-foreground shadow-soft',
        featured && 'shadow-md',
        padded && 'p-5',
        onClick && 'cursor-pointer transition-[border-color,box-shadow] hover:border-foreground/15 hover:shadow-md',
        className
      )}
    >
      {children}
    </div>
  )
}

export function AppleLink({
  children,
  onClick,
  className,
  chevron = true,
  as = 'button'
}: {
  children: ReactNode
  onClick?: () => void
  className?: string
  chevron?: boolean
  as?: 'button' | 'span'
}) {
  const handleClick = onClick
    ? (event: { stopPropagation: () => void }) => {
        event.stopPropagation()
        onClick()
      }
    : undefined

  const classes = cn(
    'inline-flex items-center gap-0.5 text-sm font-medium',
    appleLink,
    (as === 'button' || onClick) && 'cursor-pointer',
    className
  )
  const content = (
    <>
      {children}
      {chevron && <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.2} />}
    </>
  )

  if (as === 'span') {
    return (
      <span className={classes} onClick={handleClick}>
        {content}
      </span>
    )
  }

  return (
    <button type="button" onClick={handleClick} className={classes}>
      {content}
    </button>
  )
}

export function ApplePill({
  children,
  onClick,
  variant = 'primary',
  disabled,
  type = 'button',
  className
}: {
  children: ReactNode
  onClick?: () => void
  variant?: 'primary' | 'neutral'
  disabled?: boolean
  type?: 'button' | 'submit'
  className?: string
}) {
  return (
    <Button
      type={type}
      size="sm"
      variant={variant === 'primary' ? 'default' : 'outline'}
      onClick={onClick}
      disabled={disabled}
      className={className}
    >
      {children}
    </Button>
  )
}

export function AppleStat({
  value,
  label,
  detail,
  inset = false
}: {
  value: string | number
  label: string
  detail?: string
  inset?: boolean
}) {
  return (
    <div className={cn(inset && 'rounded-xl bg-muted/60 px-3 py-2.5 dark:bg-muted/40')}>
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tracking-tight tabular-nums">{value}</p>
      {detail && <p className="mt-0.5 text-[11px] text-muted-foreground">{detail}</p>}
    </div>
  )
}

export function AppleChip({
  active,
  children,
  onClick
}: {
  active?: boolean
  children: ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'h-7 rounded-md px-2.5 text-xs font-medium transition-colors',
        active
          ? 'bg-primary text-primary-foreground'
          : 'bg-muted text-muted-foreground hover:bg-accent hover:text-foreground'
      )}
    >
      {children}
    </button>
  )
}

export function AppleSkeletonTile() {
  return (
    <div className="animate-pulse rounded-2xl border border-border/80 bg-card p-5 shadow-soft">
      <div className="mb-3 h-9 w-9 rounded-lg bg-muted" />
      <div className="mb-2 h-4 w-2/3 rounded bg-muted" />
      <div className="h-3 w-1/2 rounded bg-muted" />
    </div>
  )
}

export function AppleProgress({
  value,
  className
}: {
  value: number
  className?: string
}) {
  const pct = Math.max(0, Math.min(100, Math.round(value)))
  return (
    <div
      className={cn('h-1.5 overflow-hidden rounded-full bg-muted', className)}
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${pct}%` }} />
    </div>
  )
}
