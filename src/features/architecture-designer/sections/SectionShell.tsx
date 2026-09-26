import type { ReactNode } from 'react'
import { cn } from '@/shared/lib/utils'

interface SectionShellProps {
  title: string
  description?: string
  actions?: ReactNode
  children: ReactNode
  className?: string
}

/** Consistent header + scroll body for every workspace section. */
export function SectionShell({ title, description, actions, children, className }: SectionShellProps) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-10 shrink-0 items-center justify-between gap-3 border-b border-border/60 px-4">
        <div className="min-w-0">
          <h2 className="truncate text-[13px] font-semibold leading-tight">{title}</h2>
          {description && (
            <p className="truncate text-[11px] leading-tight text-muted-foreground">{description}</p>
          )}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
      </div>

      <div className={cn('min-h-0 flex-1 overflow-y-auto p-4', className)}>{children}</div>
    </div>
  )
}

export function SectionEmpty({
  title,
  description,
  action
}: {
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border/70 px-6 py-12 text-center">
      <p className="text-[13px] font-medium">{title}</p>
      <p className="mt-1 max-w-md text-[12px] leading-relaxed text-muted-foreground">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
