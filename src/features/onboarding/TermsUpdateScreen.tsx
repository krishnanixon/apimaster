import { useState } from 'react'
import { Check, Loader2 } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { TERMS_LAST_UPDATED, TERMS_TITLE, TERMS_VERSION } from '@shared/constants/terms'
import { OnboardingFrame } from './components/OnboardingFrame'
import { TermsAcceptance } from './components/TermsAcceptance'
import { StepHeading } from './components/StepHeading'
import { acceptCurrentTerms } from './onboarding-state'

interface TermsUpdateScreenProps {
  /** Version the user accepted previously, if known. */
  previousVersion: string | null
  onAccepted: () => void
}

/** Shown to returning users when TERMS_VERSION changed since they last accepted. */
export function TermsUpdateScreen({ previousVersion, onAccepted }: TermsUpdateScreenProps) {
  const [accepted, setAccepted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function accept() {
    if (!accepted || saving) return
    setSaving(true)
    setError(null)
    try {
      await acceptCurrentTerms()
      onAccepted()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save your acceptance')
      setSaving(false)
    }
  }

  return (
    <OnboardingFrame>
      <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col px-6 pb-6 sm:px-10">
        <StepHeading eyebrow="Action needed" title={`We’ve updated our ${TERMS_TITLE}`}>
          {previousVersion ? `You previously accepted version ${previousVersion}. ` : ''}
          Please review version {TERMS_VERSION} (updated {TERMS_LAST_UPDATED}) to keep using the app.
          Your collections and settings are untouched.
        </StepHeading>
        <TermsAcceptance accepted={accepted} onAcceptedChange={setAccepted} error={error} />
        <footer className="mt-5 flex shrink-0 justify-end">
          <Button onClick={() => void accept()} disabled={!accepted || saving}>
            {saving ? <Loader2 className="animate-spin" /> : <Check />}
            Accept & continue
          </Button>
        </footer>
      </div>
    </OnboardingFrame>
  )
}
