import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useDocumentStore } from '@/features/documents/stores/document.store'
import { GenerationProgressPanel, type GenerationJob } from './GenerationProgressPanel'

function useClimbingProgress(active: boolean): number {
  const [percent, setPercent] = useState(0)

  useEffect(() => {
    if (!active) {
      setPercent(0)
      return
    }
    setPercent(10)
    const id = window.setInterval(() => {
      setPercent((current) => {
        if (current >= 92) return current
        const step = Math.max(0.35, (92 - current) * 0.045)
        return Math.min(92, current + step)
      })
    }, 350)
    return () => window.clearInterval(id)
  }, [active])

  return Math.round(percent)
}

/** Full-screen blocker so generation cannot be interrupted with other UI actions. */
export function GenerationBlockingOverlay() {
  const isGenerating = useDocumentStore((s) => s.isGenerating)
  const progress = useDocumentStore((s) => s.generationProgress)
  const livePercent = useClimbingProgress(isGenerating)

  useEffect(() => {
    if (!isGenerating) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKeyDown = (event: KeyboardEvent) => {
      event.preventDefault()
      event.stopPropagation()
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.body.style.overflow = previous
      window.removeEventListener('keydown', onKeyDown, true)
    }
  }, [isGenerating])

  if (!isGenerating) return null

  const jobs: GenerationJob[] =
    progress?.jobs?.length
      ? progress.jobs
      : [
          {
            id: 'generate',
            label: progress?.title ?? 'Document',
            status: 'writing',
            detail: progress?.detail ?? 'Writing from Knowledge…'
          }
        ]

  const current = progress?.current ?? 1
  const total = (progress?.total ?? jobs.length) || 1
  const combined =
    total <= 1 ? livePercent : Math.min(92, Math.round(((current - 1) / total) * 100 + livePercent / total))

  return createPortal(
    <div
      role="alertdialog"
      aria-modal="true"
      aria-busy="true"
      aria-label="Generating document"
      className="fixed inset-0 z-[500] flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm"
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <div className="w-full max-w-lg">
        <GenerationProgressPanel jobs={jobs} kbPercent={progress?.kbPercent} percent={combined} />
        <p className="mt-3 text-center text-[12px] text-muted-foreground">
          Stay on this screen until generation finishes. Extra clicks are blocked to avoid duplicate API use.
        </p>
      </div>
    </div>,
    document.body
  )
}
