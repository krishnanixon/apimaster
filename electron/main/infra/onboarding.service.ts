import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { TERMS_VERSION } from '@shared/constants/terms'

export interface OnboardingState {
  termsVersion: string | null
  termsAcceptedAt: string | null
  setupCompletedAt: string | null
}

const STORE_FILE = 'onboarding.json'

const DEFAULT_STATE: OnboardingState = {
  termsVersion: null,
  termsAcceptedAt: null,
  setupCompletedAt: null
}

function storePath(): string {
  const dir = join(app.getPath('userData'), 'data')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return join(dir, STORE_FILE)
}

class OnboardingService {
  get(): OnboardingState {
    const path = storePath()
    if (!existsSync(path)) return { ...DEFAULT_STATE }
    try {
      const parsed = JSON.parse(readFileSync(path, 'utf-8')) as Partial<OnboardingState>
      return {
        termsVersion: typeof parsed.termsVersion === 'string' ? parsed.termsVersion : null,
        termsAcceptedAt: typeof parsed.termsAcceptedAt === 'string' ? parsed.termsAcceptedAt : null,
        setupCompletedAt:
          typeof parsed.setupCompletedAt === 'string' ? parsed.setupCompletedAt : null
      }
    } catch {
      return { ...DEFAULT_STATE }
    }
  }

  isSetupComplete(currentTermsVersion = TERMS_VERSION): boolean {
    const state = this.get()
    return Boolean(
      state.setupCompletedAt &&
        state.termsAcceptedAt &&
        state.termsVersion === currentTermsVersion
    )
  }

  acceptTermsAndComplete(termsVersion = TERMS_VERSION): OnboardingState {
    const now = new Date().toISOString()
    const state: OnboardingState = {
      termsVersion,
      termsAcceptedAt: now,
      setupCompletedAt: now
    }
    writeFileSync(storePath(), JSON.stringify(state, null, 2), 'utf-8')
    return state
  }
}

export const onboardingService = new OnboardingService()
