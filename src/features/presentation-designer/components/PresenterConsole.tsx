import { useEffect, useMemo, useState } from 'react'
import { getPresentationTheme } from '@shared/lib/presentation-model'
import { usePresentationEditorStore } from '../stores/presentation-editor.store'
import { CardView } from './CardView'
import { Button } from '@/shared/components/ui/button'

export function presenterChannel(presentationId: string): string {
  return `presentation-stage:${presentationId}`
}

export function PresenterConsole({ presentationId }: { presentationId: string }) {
  const cards = usePresentationEditorStore((state) => state.cards)
  const themeId = usePresentationEditorStore((state) => state.themeId)
  const overrides = usePresentationEditorStore((state) => state.themeOverrides)
  const aspectRatio = usePresentationEditorStore((state) => state.aspectRatio)
  const [index, setIndex] = useState(0)
  const theme = useMemo(() => getPresentationTheme(themeId, overrides), [themeId, overrides])

  useEffect(() => {
    localStorage.setItem(
      presenterChannel(presentationId),
      JSON.stringify({ index, at: Date.now() })
    )
  }, [index, presentationId])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight' || event.key === 'PageDown' || event.key === ' ')
        setIndex((value) => Math.min(cards.length - 1, value + 1))
      if (event.key === 'ArrowLeft' || event.key === 'PageUp')
        setIndex((value) => Math.max(0, value - 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [cards.length])

  const current = cards[index]
  const next = cards[index + 1]
  if (!current) return null
  return (
    <div className="grid h-full grid-cols-[2fr_1fr] gap-4 overflow-hidden bg-zinc-950 p-4 text-white">
      <section className="min-h-0 overflow-auto">
        <p className="mb-2 text-xs text-white/60">
          Live slide · {index + 1} / {cards.length}
        </p>
        <CardView card={current} theme={theme} stage aspectRatio={aspectRatio} />
        <div className="mt-4 rounded-lg bg-white/10 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-white/50">
            Speaker notes
          </p>
          <p className="mt-2 whitespace-pre-wrap text-sm">
            {current.notes || 'No notes for this slide.'}
          </p>
        </div>
      </section>
      <aside className="space-y-4">
        <div>
          <p className="mb-2 text-xs text-white/60">Next</p>
          {next ? (
            <CardView card={next} theme={theme} compact />
          ) : (
            <div className="rounded-lg border border-white/20 p-8 text-center text-sm text-white/50">
              End of deck
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            disabled={index === 0}
            onClick={() => setIndex((value) => Math.max(0, value - 1))}
          >
            Previous
          </Button>
          <Button
            disabled={index >= cards.length - 1}
            onClick={() => setIndex((value) => Math.min(cards.length - 1, value + 1))}
          >
            Next
          </Button>
        </div>
      </aside>
    </div>
  )
}
