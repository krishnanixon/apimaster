import { Check } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { TERMS_SECTIONS, TERMS_SUMMARY } from '@shared/constants/terms'

export function termsSectionAnchor(id: string): string {
  return `terms-${id}`
}

interface TermsDocumentProps {
  /** Show the plain-language highlights above the full text. */
  showSummary?: boolean
  className?: string
}

/** Full Terms & Conditions text. Shared by the setup flow, the update prompt, and the /terms page. */
export function TermsDocument({ showSummary = true, className }: TermsDocumentProps) {
  return (
    <div className={cn('space-y-6', className)}>
      {showSummary && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">
            The short version
          </p>
          <ul className="mt-2.5 space-y-2">
            {TERMS_SUMMARY.map((point) => (
              <li key={point} className="flex gap-2.5 text-[13px] leading-relaxed text-foreground">
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-5">
        {TERMS_SECTIONS.map((section) => (
          <section
            key={section.id}
            id={termsSectionAnchor(section.id)}
            aria-labelledby={`${termsSectionAnchor(section.id)}-heading`}
            className="scroll-mt-4"
          >
            <h3
              id={`${termsSectionAnchor(section.id)}-heading`}
              className="text-sm font-semibold text-foreground"
            >
              {section.heading}
            </h3>
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{section.body}</p>
          </section>
        ))}
      </div>
    </div>
  )
}
