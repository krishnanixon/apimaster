import type { ReactNode } from 'react'
import { AppLogo } from '@/shared/components/AppLogo'
import { isMacClient } from '@/shared/hooks/useMacWindowChrome'
import { cn } from '@/shared/lib/utils'
import { PRODUCT_NAME } from '@shared/constants/product'

interface OnboardingFrameProps {
  /** Right side of the title bar, e.g. a step counter. */
  meta?: ReactNode
  /** Hide the small logo in the title bar (the welcome step shows a large one). */
  hideBrand?: boolean
  children: ReactNode
}

/** Full-window chrome for pre-shell screens: draggable title bar plus a soft primary-tinted backdrop. */
export function OnboardingFrame({ meta, hideBrand = false, children }: OnboardingFrameProps) {
  const mac = isMacClient()

  return (
    <div className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-background text-foreground">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,hsl(var(--primary)/0.14),transparent_70%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,hsl(var(--border)/0.35)_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border)/0.35)_1px,transparent_1px)] bg-[size:48px_48px] [mask-image:radial-gradient(ellipse_70%_50%_at_50%_0%,black,transparent_75%)]"
      />

      <header
        className={cn(
          // `mac-window-chrome` gets the traffic-light inset from globals.css (dropped in full screen).
          'mac-window-chrome drag-region relative z-10 flex shrink-0 items-center gap-2 px-4',
          mac ? 'h-[38px]' : 'h-11'
        )}
      >
        <div
          className={cn(
            'flex min-w-0 items-center gap-2 transition-opacity duration-base',
            hideBrand && 'opacity-0'
          )}
        >
          <AppLogo className="h-5 w-5" />
          <span className="truncate text-[13px] font-semibold">{PRODUCT_NAME}</span>
        </div>
        <div className="ml-auto text-[11px] tabular-nums text-muted-foreground">{meta}</div>
      </header>

      <div className="relative z-10 flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  )
}
