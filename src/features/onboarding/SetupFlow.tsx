import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowRight,
  Check,
  Download,
  FolderTree,
  HardDrive,
  KeyRound,
  Loader2,
  Send,
  ShieldCheck,
  Sparkles,
  TestTube2,
  UserX,
  Variable,
  type LucideIcon
} from 'lucide-react'
import { AppLogo } from '@/shared/components/AppLogo'
import { Button } from '@/shared/components/ui/button'
import { cn } from '@/shared/lib/utils'
import { PRODUCT_DESCRIPTION, PRODUCT_NAME, PRODUCT_TAGLINE } from '@shared/constants/product'
import { TERMS_LAST_UPDATED, TERMS_TITLE, TERMS_VERSION } from '@shared/constants/terms'
import { OnboardingFrame } from './components/OnboardingFrame'
import { StepHeading } from './components/StepHeading'
import { TermsAcceptance } from './components/TermsAcceptance'
import { acceptCurrentTerms } from './onboarding-state'

/** Where to land once setup finishes. */
export type SetupDestination = 'workspace' | 'new-request' | 'import' | 'ai-settings'

type SetupStep = 'welcome' | 'features' | 'privacy' | 'terms' | 'ready'

const STEP_ORDER: SetupStep[] = ['welcome', 'features', 'privacy', 'terms', 'ready']

/** Steps with the Back / dots / Continue footer (welcome and ready have their own buttons). */
const FOOTER_STEPS: SetupStep[] = ['features', 'privacy', 'terms']

const EASE = [0.22, 1, 0.36, 1] as const

const FEATURES: Array<{ icon: LucideIcon; title: string; detail: string }> = [
  {
    icon: Send,
    title: 'HTTP & WebSocket',
    detail: 'JSON, form-data, and URL-encoded bodies, plus live WebSocket sessions.'
  },
  {
    icon: FolderTree,
    title: 'Collections & folders',
    detail: 'Organize requests and let folders share auth, headers, and settings.'
  },
  {
    icon: Variable,
    title: 'Environments',
    detail: 'Switch between local, staging, and production with {{variables}}.'
  },
  {
    icon: KeyRound,
    title: 'Every common auth',
    detail: 'Bearer, Basic, API key, OAuth 1 & 2, JWT, Digest, AWS SigV4, and Hawk.'
  },
  {
    icon: TestTube2,
    title: 'Scripts, tests & runner',
    detail: 'Pre-request and test scripts, then run a whole collection or folder.'
  },
  {
    icon: Sparkles,
    title: 'Built-in AI',
    detail: 'Generate requests, explain responses, and write tests with your own key.'
  }
]

const PRIVACY_POINTS: Array<{ icon: LucideIcon; title: string; detail: string }> = [
  {
    icon: UserX,
    title: 'No account, no telemetry',
    detail: 'Nothing to sign up for. The app does not collect analytics.'
  },
  {
    icon: HardDrive,
    title: 'Your data stays here',
    detail: 'Collections, environments, and history are saved on this device and export as plain files.'
  },
  {
    icon: Send,
    title: 'Requests go direct',
    detail: 'Calls travel straight from your machine to your API, with no proxy in between.'
  },
  {
    icon: ShieldCheck,
    title: 'AI only when you ask',
    detail: 'Request details reach an AI provider only when you run an AI action with a key you added.'
  }
]

const READY_OPTIONS: Array<{
  destination: SetupDestination
  icon: LucideIcon
  title: string
  detail: string
}> = [
  {
    destination: 'new-request',
    icon: Send,
    title: 'Send a first request',
    detail: 'Opens a sample GET you can run right away.'
  },
  {
    destination: 'import',
    icon: Download,
    title: 'Import a collection',
    detail: 'Bring in Postman, OpenAPI, or cURL.'
  },
  {
    destination: 'ai-settings',
    icon: Sparkles,
    title: 'Connect AI',
    detail: 'Add a provider key or point to Ollama.'
  }
]

interface SetupFlowProps {
  onComplete: (destination: SetupDestination) => void
}

/** First-launch welcome: product intro, privacy model, and required terms acceptance. */
export function SetupFlow({ onComplete }: SetupFlowProps) {
  const [step, setStep] = useState<SetupStep>('welcome')
  const [direction, setDirection] = useState<1 | -1>(1)
  const [accepted, setAccepted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const index = STEP_ORDER.indexOf(step)
  const hasFooter = FOOTER_STEPS.includes(step)

  function go(next: SetupStep) {
    setError(null)
    setDirection(STEP_ORDER.indexOf(next) >= index ? 1 : -1)
    setStep(next)
  }

  const goNext = () => go(STEP_ORDER[Math.min(index + 1, STEP_ORDER.length - 1)])
  const goBack = () => go(STEP_ORDER[Math.max(index - 1, 0)])

  async function acceptTerms() {
    if (!accepted || saving) return
    setSaving(true)
    setError(null)
    try {
      await acceptCurrentTerms()
      go('ready')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save your acceptance')
    } finally {
      setSaving(false)
    }
  }

  return (
    <OnboardingFrame
      hideBrand={step === 'welcome'}
      meta={
        hasFooter ? `Step ${FOOTER_STEPS.indexOf(step) + 1} of ${FOOTER_STEPS.length}` : null
      }
    >
      <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col px-6 pb-6 sm:px-10">
        <AnimatePresence mode="wait" custom={direction} initial={false}>
          <motion.div
            key={step}
            custom={direction}
            initial={{ opacity: 0, x: 24 * direction }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 * direction }}
            transition={{ duration: 0.28, ease: EASE }}
            className="flex min-h-0 flex-1 flex-col"
          >
            {step === 'welcome' && <WelcomeStep onContinue={goNext} />}
            {step === 'features' && <FeaturesStep />}
            {step === 'privacy' && <PrivacyStep />}
            {step === 'terms' && (
              <div className="flex min-h-0 flex-1 flex-col">
                <StepHeading eyebrow="Required" title={TERMS_TITLE}>
                  Please read and accept to continue. Version {TERMS_VERSION} · Updated{' '}
                  {TERMS_LAST_UPDATED}. You can read them again any time from Settings → About.
                </StepHeading>
                <TermsAcceptance accepted={accepted} onAcceptedChange={setAccepted} error={error} />
              </div>
            )}
            {step === 'ready' && <ReadyStep onFinish={onComplete} />}
          </motion.div>
        </AnimatePresence>

        {hasFooter && (
          <footer className="mt-5 flex shrink-0 items-center justify-between gap-3">
            <Button variant="ghost" onClick={goBack} disabled={saving}>
              Back
            </Button>
            <StepDots current={FOOTER_STEPS.indexOf(step)} count={FOOTER_STEPS.length} />
            {step === 'terms' ? (
              <Button onClick={() => void acceptTerms()} disabled={!accepted || saving}>
                {saving ? <Loader2 className="animate-spin" /> : <Check />}
                Accept & continue
              </Button>
            ) : (
              <Button onClick={goNext}>
                {step === 'privacy' ? 'Review terms' : 'Continue'}
                <ArrowRight />
              </Button>
            )}
          </footer>
        )}
      </div>
    </OnboardingFrame>
  )
}

function StepDots({ current, count }: { current: number; count: number }) {
  return (
    <div className="flex items-center gap-1.5" aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          className={cn(
            'h-1.5 rounded-full transition-all duration-base',
            i === current ? 'w-5 bg-primary' : i < current ? 'w-1.5 bg-primary/50' : 'w-1.5 bg-border'
          )}
        />
      ))}
    </div>
  )
}

function WelcomeStep({ onContinue }: { onContinue: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center pb-8 text-center">
      <motion.div
        initial={{ scale: 0.9, opacity: 0, y: 8 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: EASE }}
        className="relative mb-7"
      >
        <div
          aria-hidden
          className="absolute inset-0 -z-10 scale-150 rounded-full bg-primary/25 blur-2xl"
        />
        <div className="flex h-20 w-20 items-center justify-center rounded-[1.4rem] border border-border/70 bg-card shadow-float">
          <AppLogo className="h-12 w-12 rounded-xl" />
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.12, ease: EASE }}
        className="space-y-3"
      >
        <p className="text-sm font-medium text-muted-foreground">Welcome to</p>
        <h1 className="text-[2.5rem] font-semibold leading-none tracking-tight">{PRODUCT_NAME}</h1>
        <p className="text-base text-foreground/80">{PRODUCT_TAGLINE}</p>
        <p className="mx-auto max-w-md text-sm leading-relaxed text-muted-foreground">
          {PRODUCT_DESCRIPTION}
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.24, ease: EASE }}
        className="mt-9 flex flex-col items-center gap-3"
      >
        <Button size="lg" className="min-w-[200px] rounded-full" onClick={onContinue} autoFocus>
          Get started <ArrowRight />
        </Button>
        <p className="text-xs text-muted-foreground">Three quick screens, then you’re in.</p>
      </motion.div>
    </div>
  )
}

function FeaturesStep() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <StepHeading eyebrow="What’s inside" title="Everything you need to work with APIs">
        Build, organize, and test requests on your desktop. Import from Postman, OpenAPI, or cURL,
        and export back to Postman or OpenAPI whenever you like.
      </StepHeading>
      <div className="grid min-h-0 flex-1 auto-rows-min grid-cols-1 gap-2.5 overflow-y-auto sm:grid-cols-2 md:grid-cols-3">
        {FEATURES.map((item, i) => (
          <FeatureCard key={item.title} {...item} delay={0.04 * i} />
        ))}
      </div>
    </div>
  )
}

function PrivacyStep() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <StepHeading eyebrow="Local-first" title="Your APIs, your machine">
        {PRODUCT_NAME} works offline and keeps everything on this device. Here’s what that means.
      </StepHeading>
      <div className="grid min-h-0 flex-1 auto-rows-min gap-2.5 overflow-y-auto sm:grid-cols-2">
        {PRIVACY_POINTS.map((item, i) => (
          <FeatureCard key={item.title} {...item} delay={0.05 * i} inline />
        ))}
      </div>
    </div>
  )
}

function FeatureCard({
  icon: Icon,
  title,
  detail,
  delay,
  inline = false
}: {
  icon: LucideIcon
  title: string
  detail: string
  delay: number
  /** Icon beside the text instead of above it. */
  inline?: boolean
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.3, ease: EASE }}
      className={cn(
        'rounded-xl border border-border/70 bg-card/80 p-3.5 shadow-soft backdrop-blur-sm',
        inline && 'flex gap-3'
      )}
    >
      <div
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary',
          !inline && 'mb-2.5'
        )}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <h3 className="text-[13px] font-semibold">{title}</h3>
        <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">{detail}</p>
      </div>
    </motion.div>
  )
}

function ReadyStep({ onFinish }: { onFinish: (destination: SetupDestination) => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center pb-6 text-center">
      <motion.div
        initial={{ scale: 0.7, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 18 }}
        className="mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
      >
        <Check className="h-7 w-7" strokeWidth={2.5} />
      </motion.div>
      <h2 className="text-[1.75rem] font-semibold tracking-tight">You’re all set</h2>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
        Pick a place to start, or jump straight into the workspace.
      </p>

      <div className="mt-7 grid w-full max-w-2xl gap-2.5 sm:grid-cols-3">
        {READY_OPTIONS.map((option, i) => (
          <motion.button
            key={option.destination}
            type="button"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + 0.05 * i, duration: 0.3, ease: EASE }}
            onClick={() => onFinish(option.destination)}
            className="group flex flex-col items-start rounded-xl border border-border/70 bg-card/80 p-4 text-left shadow-soft transition-colors hover:border-primary/40 hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <option.icon className="h-4 w-4" />
            </div>
            <span className="flex items-center gap-1 text-[13px] font-semibold">
              {option.title}
              <ArrowRight className="h-3.5 w-3.5 -translate-x-1 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
            </span>
            <span className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
              {option.detail}
            </span>
          </motion.button>
        ))}
      </div>

      <Button
        size="lg"
        className="mt-7 min-w-[200px] rounded-full"
        onClick={() => onFinish('workspace')}
        autoFocus
      >
        Open {PRODUCT_NAME} <ArrowRight />
      </Button>
    </div>
  )
}
