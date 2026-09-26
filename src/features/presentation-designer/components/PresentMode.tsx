import { useEffect, useCallback, useRef } from 'react'
import { Maximize2, Minimize2, X } from 'lucide-react'
import { getPresentationTheme } from '@shared/lib/presentation-model'
import { usePresentationEditorStore } from '../stores/presentation-editor.store'
import { CardView } from './CardView'
import { Button } from '@/shared/components/ui/button'
import { presenterChannel } from './PresenterConsole'

async function enterBrowserFullscreen(el: HTMLElement) {
  const anyEl = el as HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void> | void
  }
  if (el.requestFullscreen) await el.requestFullscreen()
  else if (anyEl.webkitRequestFullscreen) await anyEl.webkitRequestFullscreen()
}

async function exitBrowserFullscreen() {
  const doc = document as Document & {
    webkitExitFullscreen?: () => Promise<void> | void
  }
  if (document.fullscreenElement) await document.exitFullscreen()
  else if (doc.webkitExitFullscreen) await doc.webkitExitFullscreen()
}

export function PresentMode({ presentationId }: { presentationId?: string }) {
  const isPresenting = usePresentationEditorStore((s) => s.isPresenting)
  const presentIndex = usePresentationEditorStore((s) => s.presentIndex)
  const cards = usePresentationEditorStore((s) => s.cards)
  const themeId = usePresentationEditorStore((s) => s.themeId)
  const themeOverrides = usePresentationEditorStore((s) => s.themeOverrides)
  const aspectRatio = usePresentationEditorStore((s) => s.aspectRatio)
  const setPresenting = usePresentationEditorStore((s) => s.setPresenting)
  const setPresentIndex = usePresentationEditorStore((s) => s.setPresentIndex)
  const rootRef = useRef<HTMLDivElement>(null)

  const theme = getPresentationTheme(themeId, themeOverrides)
  const card = cards[presentIndex] ?? null

  const go = useCallback(
    (delta: number) => {
      const next = Math.max(0, Math.min(cards.length - 1, presentIndex + delta))
      setPresentIndex(next)
    },
    [cards.length, presentIndex, setPresentIndex]
  )

  const exit = useCallback(() => {
    void exitBrowserFullscreen().finally(() => setPresenting(false))
  }, [setPresenting])

  useEffect(() => {
    if (!isPresenting || !rootRef.current) return
    void enterBrowserFullscreen(rootRef.current).catch(() => {
      /* browser may deny; overlay still works */
    })
    return () => {
      void exitBrowserFullscreen().catch(() => undefined)
    }
  }, [isPresenting])

  useEffect(() => {
    if (!isPresenting) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') exit()
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') {
        e.preventDefault()
        go(1)
      }
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault()
        go(-1)
      }
      if (e.key === 'Home') setPresentIndex(0)
      if (e.key === 'End') setPresentIndex(Math.max(0, cards.length - 1))
      if (e.key.toLowerCase() === 'f') {
        if (rootRef.current) void enterBrowserFullscreen(rootRef.current)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isPresenting, go, exit, setPresentIndex, cards.length])

  useEffect(() => {
    if (!presentationId) return
    const onStorage = (event: StorageEvent) => {
      if (event.key !== presenterChannel(presentationId) || !event.newValue) return
      try {
        const message = JSON.parse(event.newValue) as { index?: number }
        if (typeof message.index === 'number')
          setPresentIndex(Math.max(0, Math.min(cards.length - 1, message.index)))
      } catch {
        /* ignore malformed cross-window messages */
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [presentationId, cards.length, setPresentIndex])

  if (!isPresenting || !card) return null

  return (
    <div
      ref={rootRef}
      className="fixed inset-0 z-[90] flex flex-col"
      style={{ background: '#0b0b0c' }}
    >
      <div className="flex items-center justify-between px-4 py-2 text-sm text-white/70">
        <span>
          {presentIndex + 1} / {cards.length}
        </span>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="text-white/80 hover:bg-white/10 hover:text-white"
            onClick={() => {
              if (rootRef.current) void enterBrowserFullscreen(rootRef.current)
            }}
          >
            <Maximize2 className="h-4 w-4" />
            Fullscreen
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="text-white/80 hover:bg-white/10 hover:text-white"
            onClick={exit}
          >
            <X className="h-4 w-4" />
            Exit
          </Button>
        </div>
      </div>

      <div
        className="flex min-h-0 flex-1 items-center justify-center px-6 pb-6"
        onClick={() => go(1)}
      >
        <div className="w-full max-w-6xl" onClick={(e) => e.stopPropagation()}>
          <CardView card={card} theme={theme} stage aspectRatio={aspectRatio} />
        </div>
      </div>

      <div className="flex items-center justify-center gap-2 pb-5">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="border-white/20 bg-white/5 text-white hover:bg-white/10"
          disabled={presentIndex <= 0}
          onClick={() => go(-1)}
        >
          Previous
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="border-white/20 bg-white/5 text-white hover:bg-white/10"
          disabled={presentIndex >= cards.length - 1}
          onClick={() => go(1)}
        >
          Next
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="text-white/60 hover:bg-white/10 hover:text-white"
          onClick={() => void exitBrowserFullscreen()}
        >
          <Minimize2 className="h-4 w-4" />
          Window
        </Button>
      </div>
    </div>
  )
}
