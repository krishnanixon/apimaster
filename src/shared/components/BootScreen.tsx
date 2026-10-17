import { AppLogo } from '@/shared/components/AppLogo'
import { PRODUCT_NAME } from '@shared/constants/product'
import { cn } from '@/shared/lib/utils'

interface BootScreenProps {
  message?: string
  className?: string
}

/** Full-viewport boot / hydration screen used before the app shell is ready. */
export function BootScreen({ message = 'Loading…', className }: BootScreenProps) {
  return (
    <div
      className={cn(
        'boot-screen flex h-full min-h-0 flex-1 flex-col items-center justify-center gap-[18px] bg-background text-foreground',
        className
      )}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="boot-brand flex flex-col items-center gap-3">
        <AppLogo className="boot-logo h-12 w-12" />
        <p className="boot-title m-0 text-[15px] font-semibold tracking-tight text-foreground">
          {PRODUCT_NAME}
        </p>
      </div>
      <div className="boot-progress" aria-hidden="true" />
      <p className="boot-message m-0 min-h-[1.25em] text-[13px] text-muted-foreground">{message}</p>
    </div>
  )
}
