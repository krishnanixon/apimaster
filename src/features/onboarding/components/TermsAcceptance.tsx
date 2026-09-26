import { TermsDocument } from '@/features/legal/components/TermsDocument'
import { PRODUCT_NAME } from '@shared/constants/product'
import { TERMS_TITLE } from '@shared/constants/terms'

interface TermsAcceptanceProps {
  accepted: boolean
  onAcceptedChange: (value: boolean) => void
  error: string | null
}

/** Scrollable terms plus the agreement checkbox. Used by first-run setup and the terms-update prompt. */
export function TermsAcceptance({ accepted, onAcceptedChange, error }: TermsAcceptanceProps) {
  return (
    <>
      <div
        tabIndex={0}
        role="region"
        aria-label={TERMS_TITLE}
        className="min-h-[140px] flex-1 overflow-y-auto rounded-xl border border-border/70 bg-card/90 p-5 shadow-soft outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        <TermsDocument />
      </div>

      <label className="mt-3 flex shrink-0 cursor-pointer items-start gap-3 rounded-xl border border-border/70 bg-card/80 px-4 py-3 transition-colors hover:bg-accent/50">
        <input
          type="checkbox"
          checked={accepted}
          onChange={(e) => onAcceptedChange(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 accent-[hsl(var(--primary))]"
        />
        <span className="text-sm leading-snug">
          I have read and agree to the {TERMS_TITLE} for {PRODUCT_NAME}.
        </span>
      </label>

      {error && (
        <p role="alert" className="mt-2 shrink-0 text-sm text-destructive">
          {error}
        </p>
      )}
    </>
  )
}
