import { waitForDesktopApi } from '@/shared/lib/desktop-api'
import { TERMS_VERSION } from '@shared/constants/terms'

/** Browser-only fallback (e.g. `vite dev` without Electron). */
const FALLBACK_STORAGE_KEY = 'api-studio-onboarding'

export interface OnboardingRecord {
  termsVersion: string | null
  termsAcceptedAt: string | null
  setupCompletedAt: string | null
}

/**
 * - `setup`: first launch, show the full welcome flow.
 * - `terms-update`: setup was done before, but the terms changed since they were accepted.
 * - `complete`: nothing to show.
 */
export type OnboardingPhase = 'setup' | 'terms-update' | 'complete'

const EMPTY_RECORD: OnboardingRecord = {
  termsVersion: null,
  termsAcceptedAt: null,
  setupCompletedAt: null
}

function readFallback(): OnboardingRecord {
  try {
    const raw = localStorage.getItem(FALLBACK_STORAGE_KEY)
    if (!raw) return { ...EMPTY_RECORD }
    const parsed = JSON.parse(raw) as Partial<OnboardingRecord>
    return {
      termsVersion: typeof parsed.termsVersion === 'string' ? parsed.termsVersion : null,
      termsAcceptedAt: typeof parsed.termsAcceptedAt === 'string' ? parsed.termsAcceptedAt : null,
      setupCompletedAt: typeof parsed.setupCompletedAt === 'string' ? parsed.setupCompletedAt : null
    }
  } catch {
    return { ...EMPTY_RECORD }
  }
}

export async function readOnboardingRecord(): Promise<OnboardingRecord> {
  const api = await waitForDesktopApi()
  if (!api?.onboarding) return readFallback()
  const result = await api.onboarding.get()
  if (!result.success || !result.data) return { ...EMPTY_RECORD }
  const { termsVersion, termsAcceptedAt, setupCompletedAt } = result.data
  return { termsVersion, termsAcceptedAt, setupCompletedAt }
}

export function resolveOnboardingPhase(record: OnboardingRecord): OnboardingPhase {
  if (!record.setupCompletedAt) return 'setup'
  if (!record.termsAcceptedAt || record.termsVersion !== TERMS_VERSION) return 'terms-update'
  return 'complete'
}

export async function loadOnboardingPhase(): Promise<OnboardingPhase> {
  return resolveOnboardingPhase(await readOnboardingRecord())
}

/** Records acceptance of the current terms and marks setup complete. Throws on failure. */
export async function acceptCurrentTerms(): Promise<void> {
  const api = await waitForDesktopApi()
  if (api?.onboarding) {
    const result = await api.onboarding.complete(TERMS_VERSION)
    if (!result.success) throw new Error(result.error || 'Could not save your acceptance')
    return
  }

  const previous = readFallback()
  const now = new Date().toISOString()
  localStorage.setItem(
    FALLBACK_STORAGE_KEY,
    JSON.stringify({
      termsVersion: TERMS_VERSION,
      termsAcceptedAt: now,
      setupCompletedAt: previous.setupCompletedAt ?? now
    } satisfies OnboardingRecord)
  )
}
