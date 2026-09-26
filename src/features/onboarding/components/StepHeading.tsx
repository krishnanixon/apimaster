import type { ReactNode } from 'react'

/** Eyebrow + title + lead paragraph used at the top of onboarding screens. */
export function StepHeading({
  eyebrow,
  title,
  children
}: {
  eyebrow: string
  title: string
  children?: ReactNode
}) {
  return (
    <div className="mb-5 shrink-0 space-y-1.5 pt-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">{eyebrow}</p>
      <h2 className="text-[1.625rem] font-semibold leading-tight tracking-tight">{title}</h2>
      {children && (
        <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">{children}</p>
      )}
    </div>
  )
}
