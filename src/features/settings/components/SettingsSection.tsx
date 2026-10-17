import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Check } from 'lucide-react'
import { cn } from '@/shared/lib/utils'

/**
 * Panel body wrapper. The page title + description are rendered by the settings
 * shell, so this only controls width and vertical rhythm.
 */
export function SettingsSection({
  children,
  maxWidth = '3xl'
}: {
  /** @deprecated rendered by the settings shell header */
  title?: string
  /** @deprecated rendered by the settings shell header */
  description?: string
  children: ReactNode
  maxWidth?: 'xl' | '3xl' | 'full'
}) {
  const widthClass =
    maxWidth === 'xl' ? 'max-w-2xl' : maxWidth === 'full' ? 'max-w-none' : 'max-w-3xl'
  return <div className={cn('space-y-6', widthClass)}>{children}</div>
}

/** A titled card that groups related settings. Children are typically SettingsRow. */
export function SettingsGroup({
  title,
  description,
  icon: Icon,
  actions,
  children,
  flush,
  className
}: {
  title: string
  description?: ReactNode
  icon?: LucideIcon
  actions?: ReactNode
  /** Omit for a header-only card (e.g. a single action) */
  children?: ReactNode
  /** Render children edge-to-edge with row dividers (for lists of SettingsRow) */
  flush?: boolean
  className?: string
}) {
  const hasBody = children != null && children !== false
  return (
    <section
      className={cn(
        'rounded-xl border border-border/70 bg-card shadow-soft transition-shadow hover:shadow-card',
        className
      )}
    >
      <div
        className={cn(
          'flex flex-wrap items-start justify-between gap-3 px-5 pt-4',
          !hasBody && 'pb-4'
        )}
      >
        <div className="flex min-w-0 items-start gap-3">
          {Icon && (
            <span className="mt-px flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <Icon className="h-3.5 w-3.5" />
            </span>
          )}
          <div className="min-w-0">
            <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
            {description && (
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{description}</p>
            )}
          </div>
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      {hasBody && (
        <div
          className={cn(
            flush ? 'mt-3 divide-y divide-border/60 border-t border-border/60' : 'space-y-5 p-5'
          )}
        >
          {children}
        </div>
      )}
    </section>
  )
}

/** One setting: label + help text on the left, control on the right (stacks on narrow widths). */
export function SettingsRow({
  label,
  description,
  htmlFor,
  children,
  stacked,
  className
}: {
  label: ReactNode
  description?: ReactNode
  htmlFor?: string
  children: ReactNode
  /** Put the control below the label (for wide controls like textareas) */
  stacked?: boolean
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex gap-x-6 gap-y-3 px-5 py-4',
        stacked ? 'flex-col' : 'flex-col sm:flex-row sm:items-center sm:justify-between',
        className
      )}
    >
      <div className="min-w-0 sm:flex-1">
        <label htmlFor={htmlFor} className="block text-sm font-medium">
          {label}
        </label>
        {description && (
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{description}</p>
        )}
      </div>
      <div className={cn('min-w-0', !stacked && 'sm:shrink-0')}>{children}</div>
    </div>
  )
}

/** Stacked label + control, for use inside a non-flush SettingsGroup. */
export function SettingsField({
  label,
  description,
  children
}: {
  label: string
  description?: ReactNode
  children: ReactNode
}) {
  return (
    <div>
      <label className="block text-sm font-medium">{label}</label>
      {description && (
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{description}</p>
      )}
      <div className="mt-2.5">{children}</div>
    </div>
  )
}

/** Compact pill-style single choice, e.g. Off / 1s / 3s. */
export function SegmentedControl<T extends string | number>({
  value,
  options,
  onChange,
  ariaLabel
}: {
  value: T
  options: ReadonlyArray<{ value: T; label: string }>
  onChange: (value: T) => void
  ariaLabel: string
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="inline-flex flex-wrap rounded-lg border border-border/70 bg-muted/50 p-0.5"
    >
      {options.map((opt) => {
        const selected = opt.value === value
        return (
          <button
            key={String(opt.value)}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(opt.value)}
            className={cn(
              'rounded-md px-3 py-1 text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30',
              selected
                ? 'bg-background text-foreground shadow-card ring-1 ring-border/80'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

/** Larger selectable cards with an icon and hint, for choices that need explanation. */
export function OptionCards<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  columns = 2
}: {
  value: T
  options: ReadonlyArray<{ value: T; label: string; hint?: string; icon?: LucideIcon }>
  onChange: (value: T) => void
  ariaLabel: string
  columns?: 2 | 3
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn('grid gap-2', columns === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2')}
    >
      {options.map(({ value: optValue, label, hint, icon: Icon }) => {
        const selected = optValue === value
        return (
          <button
            key={optValue}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(optValue)}
            className={cn(
              'relative flex items-start gap-3 rounded-xl border px-3.5 py-3 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30',
              selected
                ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                : 'border-border/70 hover:border-border hover:bg-accent/40'
            )}
          >
            {Icon && (
              <Icon
                className={cn(
                  'mt-0.5 h-4 w-4 shrink-0',
                  selected ? 'text-primary' : 'text-muted-foreground'
                )}
              />
            )}
            <span className="min-w-0 flex-1">
              <span className={cn('block text-sm font-medium', selected && 'text-primary')}>
                {label}
              </span>
              {hint && (
                <span className="mt-0.5 block text-[11px] text-muted-foreground">{hint}</span>
              )}
            </span>
            {selected && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
          </button>
        )
      })}
    </div>
  )
}

/** Soft informational callout. */
export function SettingsNote({
  icon: Icon,
  title,
  children,
  action
}: {
  icon?: LucideIcon
  title?: string
  children: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-start gap-3 rounded-xl border border-border/60 bg-muted/30 p-4">
      {Icon && <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />}
      <div className="min-w-0 flex-1 text-xs leading-relaxed text-muted-foreground">
        {title && <p className="mb-0.5 text-sm font-medium text-foreground">{title}</p>}
        {children}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}
