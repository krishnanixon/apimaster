import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, Clipboard } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/shared/components/ui/button'
import { ModulePage, PageHeader } from '@/shared/components/layout/ModulePage'
import { writeClipboardText } from '@/shared/lib/clipboard'
import { cn } from '@/shared/lib/utils'
import { PRODUCT_NAME } from '@shared/constants/product'
import {
  TERMS_LAST_UPDATED,
  TERMS_SECTIONS,
  TERMS_TITLE,
  TERMS_VERSION,
  formatTermsPlainText
} from '@shared/constants/terms'
import { TermsDocument, termsSectionAnchor } from '../components/TermsDocument'
import { readOnboardingRecord, type OnboardingRecord } from '@/features/onboarding/onboarding-state'

/** How far below the scroll container's top edge a heading counts as "current". */
const ACTIVE_OFFSET_PX = 96

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
}

export function TermsPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const scrollRef = useRef<HTMLDivElement>(null)
  const [record, setRecord] = useState<OnboardingRecord | null>(null)
  const [activeId, setActiveId] = useState(TERMS_SECTIONS[0]?.id)

  useEffect(() => {
    let cancelled = false
    void readOnboardingRecord().then((r) => {
      if (!cancelled) setRecord(r)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const container = scrollRef.current
    if (!container) return
    let frame = 0

    const update = () => {
      frame = 0
      const top = container.getBoundingClientRect().top + ACTIVE_OFFSET_PX
      let current = TERMS_SECTIONS[0]?.id
      for (const section of TERMS_SECTIONS) {
        const el = document.getElementById(termsSectionAnchor(section.id))
        if (el && el.getBoundingClientRect().top <= top) current = section.id
      }
      // At the very bottom the last sections can never reach the offset line.
      if (container.scrollTop + container.clientHeight >= container.scrollHeight - 2) {
        current = TERMS_SECTIONS[TERMS_SECTIONS.length - 1]?.id
      }
      setActiveId(current)
    }

    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    container.addEventListener('scroll', onScroll, { passive: true })
    update()
    return () => {
      container.removeEventListener('scroll', onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [])

  const jumpTo = useCallback((id: string) => {
    document
      .getElementById(termsSectionAnchor(id))
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  async function copyText() {
    try {
      await writeClipboardText(formatTermsPlainText())
      toast.success('Terms copied to clipboard')
    } catch {
      toast.error('Could not copy the terms')
    }
  }

  const acceptedCurrent = record?.termsAcceptedAt && record.termsVersion === TERMS_VERSION

  return (
    <ModulePage>
      <PageHeader
        title={TERMS_TITLE}
        description={`${PRODUCT_NAME} · Version ${TERMS_VERSION} · Last updated ${TERMS_LAST_UPDATED}`}
        actions={
          <>
            <Button
              variant="ghost"
              size="sm"
              // 'default' means /terms was the first entry (e.g. opened from the app menu on launch).
              onClick={() => (location.key === 'default' ? navigate('/') : navigate(-1))}
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back
            </Button>
            <Button variant="outline" size="sm" onClick={() => void copyText()}>
              <Clipboard className="h-3.5 w-3.5" /> Copy text
            </Button>
          </>
        }
      />

      <div
        ref={scrollRef}
        className="page-gutter page-stack min-h-0 flex-1 overflow-y-auto bg-background"
      >
        <div className="mx-auto flex w-full max-w-5xl gap-10">
          <nav aria-label="Sections" className="sticky top-0 hidden w-52 shrink-0 self-start lg:block">
            <p className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              On this page
            </p>
            <ul className="space-y-0.5">
              {TERMS_SECTIONS.map((section) => (
                <li key={section.id}>
                  <button
                    type="button"
                    onClick={() => jumpTo(section.id)}
                    aria-current={activeId === section.id ? 'location' : undefined}
                    className={cn(
                      'w-full truncate rounded-md px-2 py-1 text-left text-[12.5px] transition-colors',
                      activeId === section.id
                        ? 'bg-accent font-medium text-foreground'
                        : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'
                    )}
                  >
                    {section.heading}
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          <article className="min-w-0 max-w-2xl flex-1 pb-10">
            {record && (
              <div
                className={cn(
                  'mb-6 flex items-start gap-3 rounded-xl border p-3.5 text-[13px]',
                  acceptedCurrent
                    ? 'border-emerald-500/25 bg-emerald-500/5'
                    : 'border-border bg-muted/40'
                )}
              >
                <CheckCircle2
                  className={cn(
                    'mt-0.5 h-4 w-4 shrink-0',
                    acceptedCurrent ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'
                  )}
                  aria-hidden
                />
                <p className="leading-relaxed text-muted-foreground">
                  {acceptedCurrent && record.termsAcceptedAt ? (
                    <>
                      You accepted version{' '}
                      <span className="font-medium text-foreground">{record.termsVersion}</span> on{' '}
                      <span className="font-medium text-foreground">
                        {formatDate(record.termsAcceptedAt)}
                      </span>
                      .
                    </>
                  ) : (
                    'You have not accepted this version of the terms on this device yet.'
                  )}
                </p>
              </div>
            )}

            <TermsDocument />
          </article>
        </div>
      </div>
    </ModulePage>
  )
}
