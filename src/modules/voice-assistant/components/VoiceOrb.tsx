import { useEffect, useRef } from 'react'
import { cn } from '@/shared/lib/utils'
import type { VoiceState } from '@shared/types/voice-assistant'
import { useVoiceAssistantStore } from '../stores/voice.store'

function toneClass(state: VoiceState): string {
  if (state === 'LISTENING') return 'text-voice-active'
  if (state === 'SPEAKING') return 'text-voice-speaking'
  if (state === 'THINKING' || state === 'PROCESSING') return 'text-voice-thinking'
  if (state === 'ERROR') return 'text-destructive'
  return 'text-voice-idle'
}

export function VoiceOrb({
  state,
  sessionActive = false,
  size = 'lg',
  interactive = true,
  onClick
}: {
  state: VoiceState
  sessionActive?: boolean
  size?: 'lg' | 'sm'
  interactive?: boolean
  onClick?: () => void
}) {
  const ringRef = useRef<HTMLSpanElement>(null)
  const coreRef = useRef<HTMLSpanElement>(null)
  const live = state === 'LISTENING' || state === 'SPEAKING'
  const working = state === 'PROCESSING' || state === 'THINKING'
  const compact = size === 'sm'
  const label = sessionActive
    ? live
      ? 'Stop listening'
      : 'Start listening'
    : 'Start conversation'

  useEffect(() => {
    if (compact) return
    let raf = 0
    const tick = () => {
      const level = useVoiceAssistantStore.getState().audioLevel
      const scale = live ? 1 + Math.min(0.1, level * 0.18) : 1
      const glow = live ? 18 + Math.min(36, level * 42) : 16
      if (ringRef.current) {
        ringRef.current.style.transform = `scale(${scale})`
        ringRef.current.style.boxShadow = live
          ? `0 0 0 ${glow}px color-mix(in srgb, currentColor 16%, transparent), 0 18px 50px color-mix(in srgb, currentColor 22%, transparent)`
          : '0 16px 40px hsl(var(--foreground) / 0.06)'
      }
      if (coreRef.current) {
        coreRef.current.style.transform = `scale(${1 + (live ? Math.min(0.06, level * 0.1) : 0)})`
      }
      raf = window.requestAnimationFrame(tick)
    }
    raf = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(raf)
  }, [compact, live])

  const className = cn(
    'group relative flex items-center justify-center rounded-full',
    compact ? 'h-10 w-10 shrink-0' : 'h-[11.5rem] w-[11.5rem]',
    interactive &&
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-4 focus-visible:ring-offset-background',
    toneClass(state)
  )

  const inner = (
    <>
      <span
        ref={ringRef}
        className={cn(
          'absolute inset-0 rounded-full border transition-[border-color,opacity] duration-500',
          live ? 'border-current/45' : 'border-violet-300/45 dark:border-violet-400/25',
          !sessionActive && state === 'IDLE' && 'motion-safe:animate-orb-breathe',
          state === 'ERROR' && 'border-destructive/70'
        )}
      />
      {working && (
        <span
          className={cn(
            'absolute rounded-full border border-current/20 border-t-current motion-safe:animate-orb-think',
            compact ? 'inset-[-6px]' : 'inset-[-14px]'
          )}
        />
      )}
      <span
        ref={coreRef}
        className={cn(
          'relative z-[1] flex items-center justify-center rounded-full border border-white/40',
          'bg-gradient-to-b from-white via-violet-50/80 to-violet-100/80 shadow-[0_0_38px_hsl(262_83%_70%/0.18)] backdrop-blur-md dark:border-white/10 dark:from-white/10 dark:via-violet-500/10 dark:to-violet-500/20',
          compact ? 'h-7 w-7' : 'h-[7.25rem] w-[7.25rem]',
          live && 'to-current/20'
        )}
      >
        <span
          className={cn(
            'rounded-full',
            state === 'IDLE' ? 'bg-violet-500' : 'bg-current/90',
            compact ? 'h-1.5 w-1.5' : 'h-3.5 w-3.5',
            live && 'motion-safe:animate-pulse'
          )}
        />
      </span>
    </>
  )

  if (!interactive) {
    return (
      <span className={className} aria-hidden>
        {inner}
      </span>
    )
  }

  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={sessionActive}
      className={className}
    >
      {inner}
    </button>
  )
}
