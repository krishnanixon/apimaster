import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import { cn } from '@/shared/lib/utils'

function isMacPlatform(): boolean {
  if (typeof navigator === 'undefined') return false
  return /mac/i.test(navigator.userAgent)
}

/** Convert Ctrl/Shift/Alt shortcuts to Mac glyphs when appropriate. */
export function formatShortcut(keys: string): string {
  if (!keys) return keys
  if (!isMacPlatform()) return keys
  return keys
    .replace(/Ctrl\+Shift\+/gi, '⌘⇧')
    .replace(/Ctrl\+Alt\+/gi, '⌘⌥')
    .replace(/Ctrl\+/gi, '⌘')
    .replace(/Shift\+/gi, '⇧')
    .replace(/Alt\+/gi, '⌥')
}

interface WordScreenTipProps {
  label: string
  shortcut?: string
  description?: string
  children: React.ReactElement
  side?: 'top' | 'bottom' | 'left' | 'right'
  delayDuration?: number
  className?: string
  /** Skip the ScreenTip (for example while a dropdown is open). */
  disabled?: boolean
}

/**
 * Microsoft Word–style ScreenTip: command name, keyboard shortcut, and a
 * one-line description. Use instead of the native `title` attribute.
 */
export function WordScreenTip({
  label,
  shortcut,
  description,
  children,
  side = 'bottom',
  delayDuration = 400,
  className,
  disabled = false
}: WordScreenTipProps) {
  const keys = shortcut ? formatShortcut(shortcut) : undefined

  if (disabled) return children

  return (
    <TooltipPrimitive.Root delayDuration={delayDuration} disableHoverableContent>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={8}
          collisionPadding={8}
          className={cn(
            'word-screentip z-[420] max-w-[260px] rounded-sm px-3 py-2 text-left shadow-[0_3.2px_7.2px_rgba(0,0,0,.16),0_0.6px_1.8px_rgba(0,0,0,.12)]',
            'data-[state=delayed-open]:animate-fade-in',
            className
          )}
        >
          <div className="flex items-baseline justify-between gap-5">
            <span className="text-[13px] font-semibold leading-tight">{label}</span>
            {keys && (
              <span className="shrink-0 text-[11px] font-normal tracking-wide opacity-70">{keys}</span>
            )}
          </div>
          {description && (
            <p className="mt-1.5 text-[11px] leading-snug opacity-80">{description}</p>
          )}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  )
}
