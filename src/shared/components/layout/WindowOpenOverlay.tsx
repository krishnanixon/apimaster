import { Spinner } from '@/shared/components/ui/spinner'
import { AppLogo } from '@/shared/components/AppLogo'
import { useWindowOpenStore } from '@/shared/stores/window-open.store'

/** Soft overlay on the current window while a new one is opening. */
export function WindowOpenOverlay() {
  const active = useWindowOpenStore((s) => s.active)
  const message = useWindowOpenStore((s) => s.message)

  if (!active) return null

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[200] flex items-center justify-center bg-background/55 backdrop-blur-[2px]"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="pointer-events-none flex items-center gap-3 rounded-xl border border-border bg-card/95 px-4 py-3 shadow-float">
        <AppLogo className="h-6 w-6 rounded-md" />
        <Spinner size="sm" />
        <span className="text-sm font-medium text-foreground">{message}</span>
      </div>
    </div>
  )
}
