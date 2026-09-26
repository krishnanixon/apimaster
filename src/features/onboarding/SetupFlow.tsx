import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  BookOpen,
  Check,
  HardDrive,
  KeyRound,
  Layers,
  Loader2,
  MessageSquare,
  ShieldCheck,
  Sparkles,
  Workflow
} from 'lucide-react'
import { AppLogo } from '@/shared/components/AppLogo'
import { Button } from '@/shared/components/ui/button'
import { ScrollArea } from '@/shared/components/ui/scroll-area'
import { cn } from '@/shared/lib/utils'
import { waitForDesktopApi } from '@/shared/lib/desktop-api'
import {
  PRODUCT_DESCRIPTION,
  PRODUCT_NAME,
  PRODUCT_TAGLINE
} from '@shared/constants/product'
import {
  TERMS_LAST_UPDATED,
  TERMS_SECTIONS,
  TERMS_TITLE,
  TERMS_VERSION
} from '@shared/constants/terms'

type SetupStep = 'welcome' | 'product' | 'local' | 'terms' | 'prepare' | 'ready'

const STEP_ORDER: SetupStep[] = ['welcome', 'product', 'local', 'terms', 'prepare', 'ready']

const PRODUCT_HIGHLIGHTS = [
  {
    icon: MessageSquare,
    title: 'AI chat & generation',
    detail: 'Stream responses, generate requirement docs, and edit with AI assistance.'
  },
  {
    icon: BookOpen,
    title: 'Knowledge-driven projects',
    detail: 'Keep context in a local knowledge base that powers chat, docs, and diagrams.'
  },
  {
    icon: Workflow,
    title: 'Flows, architecture & decks',
    detail: 'Design processes, system diagrams, and presentations in one workspace.'
  },
  {
    icon: Layers,
    title: 'Developer tools built in',
    detail: 'API Studio, Terminal, Code Editor, Vault, VPS, Voice, and more — all local.'
  }
]

const PREPARE_STAGES = [
  { label: 'Preparing local workspace', detail: 'Creating your private app data folder' },
  { label: 'Setting up local storage', detail: 'Projects and documents stay on this device' },
  { label: 'Finishing installation', detail: 'Almost ready — no cloud account required' }
]

const FALLBACK_STORAGE_KEY = 'ai-workbench-onboarding'

function stepIndex(step: SetupStep): number {
  return STEP_ORDER.indexOf(step)
}

interface SetupFlowProps {
  onComplete: () => void
}

export function SetupFlow({ onComplete }: SetupFlowProps) {
  const [step, setStep] = useState<SetupStep>('welcome')
  const [accepted, setAccepted] = useState(false)
  const [prepareIndex, setPrepareIndex] = useState(0)
  const [prepareProgress, setPrepareProgress] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const finishingRef = useRef(false)

  const goNext = useCallback(() => {
    setError(null)
    setStep((current) => {
      const i = stepIndex(current)
      return STEP_ORDER[Math.min(i + 1, STEP_ORDER.length - 1)]
    })
  }, [])

  const goBack = useCallback(() => {
    setError(null)
    setStep((current) => {
      const i = stepIndex(current)
      if (i <= 0) return current
      if (current === 'ready') return 'terms'
      return STEP_ORDER[i - 1]
    })
  }, [])

  const finishSetup = useCallback(async () => {
    if (finishingRef.current) return
    finishingRef.current = true
    setSaving(true)
    setError(null)
    try {
      const api = await waitForDesktopApi()
      if (api?.onboarding) {
        const result = await api.onboarding.complete(TERMS_VERSION)
        if (!result.success) {
          throw new Error(result.error || 'Could not save acceptance')
        }
      } else {
        localStorage.setItem(
          FALLBACK_STORAGE_KEY,
          JSON.stringify({
            termsVersion: TERMS_VERSION,
            termsAcceptedAt: new Date().toISOString(),
            setupCompletedAt: new Date().toISOString()
          })
        )
      }
      setStep('ready')
    } catch (e) {
      finishingRef.current = false
      setError(e instanceof Error ? e.message : 'Setup failed')
      setStep('terms')
    } finally {
      setSaving(false)
    }
  }, [])

  useEffect(() => {
    if (step !== 'prepare') return

    finishingRef.current = false
    setPrepareIndex(0)
    setPrepareProgress(0)

    const duration = 2800
    const started = performance.now()
    let frame = 0
    let cancelled = false

    const tick = (now: number) => {
      if (cancelled) return
      const t = Math.min(1, (now - started) / duration)
      setPrepareProgress(t)
      setPrepareIndex(Math.min(PREPARE_STAGES.length - 1, Math.floor(t * PREPARE_STAGES.length)))
      if (t < 1) {
        frame = requestAnimationFrame(tick)
      } else {
        void finishSetup()
      }
    }

    frame = requestAnimationFrame(tick)
    return () => {
      cancelled = true
      cancelAnimationFrame(frame)
    }
  }, [step, finishSetup])

  const progressPct = ((stepIndex(step) + (step === 'prepare' ? prepareProgress : 1)) /
    STEP_ORDER.length) *
    100

  return (
    <div className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      {/* Apple-inspired soft atmosphere */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(0,122,255,0.08),_transparent_55%),linear-gradient(180deg,_#f5f5f7_0%,_#ffffff_42%,_#fbfbfd_100%)] dark:bg-[radial-gradient(ellipse_at_top,_rgba(10,132,255,0.16),_transparent_50%),linear-gradient(180deg,_#1c1c1e_0%,_#000000_55%,_#111113_100%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -left-24 top-24 h-72 w-72 rounded-full bg-[#007AFF]/10 blur-3xl dark:bg-[#0A84FF]/20"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 bottom-10 h-80 w-80 rounded-full bg-[#5856D6]/8 blur-3xl dark:bg-[#5E5CE6]/15"
      />

      <div className="relative z-10 mx-auto flex h-full w-full max-w-3xl flex-col px-6 py-8 sm:px-10 sm:py-10">
        <header className="mb-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <AppLogo className="h-9 w-9 rounded-[1.1rem] shadow-sm" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold tracking-tight text-[#1d1d1f] dark:text-white">
                {PRODUCT_NAME}
              </p>
              <p className="text-[11px] text-[#86868b]">Setup</p>
            </div>
          </div>
          <p className="text-[11px] tabular-nums text-[#86868b]">
            {Math.min(stepIndex(step) + 1, STEP_ORDER.length)} / {STEP_ORDER.length}
          </p>
        </header>

        <div className="mb-8 h-[3px] overflow-hidden rounded-full bg-black/5 dark:bg-white/10">
          <motion.div
            className="h-full rounded-full bg-[#007AFF]"
            initial={false}
            animate={{ width: `${Math.min(100, Math.max(8, progressPct))}%` }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          />
        </div>

        <div className="relative min-h-0 flex-1">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              className="flex h-full min-h-0 flex-col"
            >
              {step === 'welcome' && <WelcomeStep onContinue={goNext} />}
              {step === 'product' && <ProductStep onBack={goBack} onContinue={goNext} />}
              {step === 'local' && <LocalStep onBack={goBack} onContinue={goNext} />}
              {step === 'terms' && (
                <TermsStep
                  accepted={accepted}
                  onAcceptedChange={setAccepted}
                  onBack={goBack}
                  onContinue={() => {
                    if (!accepted) {
                      setError('Please accept the Terms & Conditions to continue.')
                      return
                    }
                    setStep('prepare')
                  }}
                  error={error}
                />
              )}
              {step === 'prepare' && (
                <PrepareStep
                  stageIndex={prepareIndex}
                  progress={prepareProgress}
                  saving={saving}
                />
              )}
              {step === 'ready' && <ReadyStep onFinish={onComplete} />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}

function WelcomeStep({ onContinue }: { onContinue: () => void }) {
  return (
    <div className="flex h-full flex-col justify-between gap-10">
      <div className="mx-auto max-w-xl space-y-6 pt-6 text-center sm:pt-12">
        <motion.div
          initial={{ scale: 0.92, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="mx-auto flex h-20 w-20 items-center justify-center rounded-[1.75rem] bg-white/80 shadow-[0_12px_40px_rgba(0,0,0,0.08)] ring-1 ring-black/5 backdrop-blur dark:bg-white/10 dark:ring-white/10"
        >
          <AppLogo className="h-12 w-12 rounded-2xl" />
        </motion.div>
        <div className="space-y-3">
          <h1 className="text-[2rem] font-semibold leading-tight tracking-tight text-[#1d1d1f] sm:text-[2.5rem] dark:text-white">
            {PRODUCT_NAME}
          </h1>
          <p className="text-base text-[#86868b] sm:text-lg">{PRODUCT_TAGLINE}</p>
          <p className="mx-auto max-w-md text-sm leading-relaxed text-[#6e6e73] dark:text-[#a1a1a6]">
            {PRODUCT_DESCRIPTION} Let’s finish setup — it only takes a minute.
          </p>
        </div>
      </div>
      <div className="flex justify-center pb-2">
        <Button
          size="lg"
          className="min-w-[200px] rounded-full bg-[#007AFF] px-8 text-white shadow-sm hover:bg-[#0071e3]"
          onClick={onContinue}
        >
          Continue
        </Button>
      </div>
    </div>
  )
}

function ProductStep({ onBack, onContinue }: { onBack: () => void; onContinue: () => void }) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-6 space-y-2">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[#86868b]">
          What you get
        </p>
        <h2 className="text-2xl font-semibold tracking-tight text-[#1d1d1f] dark:text-white">
          Your AI developer workbench
        </h2>
        <p className="max-w-2xl text-sm leading-relaxed text-[#6e6e73] dark:text-[#a1a1a6]">
          From idea to delivery-ready specs: chat, knowledge, documents, diagrams, and tools —
          organized in projects on your machine.
        </p>
      </div>
      <div className="grid min-h-0 flex-1 gap-3 overflow-y-auto sm:grid-cols-2">
        {PRODUCT_HIGHLIGHTS.map((item, i) => (
          <motion.div
            key={item.title}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 * i, duration: 0.35 }}
            className="rounded-2xl border border-black/5 bg-white/70 p-4 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/5"
          >
            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-[#007AFF]/10 text-[#007AFF]">
              <item.icon className="h-4 w-4" />
            </div>
            <h3 className="text-sm font-semibold text-[#1d1d1f] dark:text-white">{item.title}</h3>
            <p className="mt-1 text-[13px] leading-relaxed text-[#6e6e73] dark:text-[#a1a1a6]">
              {item.detail}
            </p>
          </motion.div>
        ))}
      </div>
      <StepFooter onBack={onBack} onContinue={onContinue} />
    </div>
  )
}

function LocalStep({ onBack, onContinue }: { onBack: () => void; onContinue: () => void }) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-6 space-y-2">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[#86868b]">
          Privacy first
        </p>
        <h2 className="text-2xl font-semibold tracking-tight text-[#1d1d1f] dark:text-white">
          Everything stays on your device
        </h2>
        <p className="max-w-2xl text-sm leading-relaxed text-[#6e6e73] dark:text-[#a1a1a6]">
          No cloud workspace account. Add an API key when you want AI — then start working.
        </p>
      </div>

      <div className="space-y-3">
        <InfoRow
          icon={HardDrive}
          title="Stored locally"
          detail="Projects, documents, chat history, and settings live in a local database on this computer."
        />
        <InfoRow
          icon={KeyRound}
          title="Just add your API key"
          detail="Open Settings → AI, paste your OpenAI key or connect Ollama. Keys use OS secure storage."
        />
        <InfoRow
          icon={ShieldCheck}
          title="You control when AI is used"
          detail="Network calls happen only when you run an AI action with a provider you configured."
        />
        <InfoRow
          icon={Sparkles}
          title="Ready in minutes"
          detail="After setup, create a project and start chatting, generating docs, or designing flows."
        />
      </div>

      <StepFooter onBack={onBack} onContinue={onContinue} continueLabel="Review terms" />
    </div>
  )
}

function TermsStep({
  accepted,
  onAcceptedChange,
  onBack,
  onContinue,
  error
}: {
  accepted: boolean
  onAcceptedChange: (v: boolean) => void
  onBack: () => void
  onContinue: () => void
  error: string | null
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-4 space-y-2">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[#86868b]">
          Required
        </p>
        <h2 className="text-2xl font-semibold tracking-tight text-[#1d1d1f] dark:text-white">
          {TERMS_TITLE}
        </h2>
        <p className="text-sm text-[#6e6e73] dark:text-[#a1a1a6]">
          Please read and accept before installation finishes. Version {TERMS_VERSION} · Updated{' '}
          {TERMS_LAST_UPDATED}
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-black/5 bg-white/80 shadow-sm dark:border-white/10 dark:bg-white/5">
        <ScrollArea className="h-full max-h-[min(42vh,360px)] sm:max-h-[min(48vh,420px)]">
          <div className="space-y-5 p-5 pr-6">
            {TERMS_SECTIONS.map((section) => (
              <div key={section.heading}>
                <h3 className="text-sm font-semibold text-[#1d1d1f] dark:text-white">
                  {section.heading}
                </h3>
                <p className="mt-1.5 text-[13px] leading-relaxed text-[#6e6e73] dark:text-[#a1a1a6]">
                  {section.body}
                </p>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>

      <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-2xl border border-black/5 bg-white/60 px-4 py-3 dark:border-white/10 dark:bg-white/5">
        <input
          type="checkbox"
          checked={accepted}
          onChange={(e) => onAcceptedChange(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-black/20 text-[#007AFF] focus:ring-[#007AFF]"
        />
        <span className="text-sm leading-snug text-[#1d1d1f] dark:text-white">
          I have read and agree to the {TERMS_TITLE} for {PRODUCT_NAME}.
        </span>
      </label>

      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}

      <StepFooter
        onBack={onBack}
        onContinue={onContinue}
        continueLabel="Accept & install"
        continueDisabled={!accepted}
      />
    </div>
  )
}

function PrepareStep({
  stageIndex,
  progress,
  saving
}: {
  stageIndex: number
  progress: number
  saving: boolean
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-8 text-center">
      <div className="relative flex h-24 w-24 items-center justify-center">
        <svg className="absolute inset-0 -rotate-90" viewBox="0 0 96 96" aria-hidden>
          <circle
            cx="48"
            cy="48"
            r="42"
            fill="none"
            stroke="currentColor"
            strokeWidth="4"
            className="text-black/5 dark:text-white/10"
          />
          <motion.circle
            cx="48"
            cy="48"
            r="42"
            fill="none"
            stroke="#007AFF"
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={2 * Math.PI * 42}
            animate={{ strokeDashoffset: 2 * Math.PI * 42 * (1 - progress) }}
            transition={{ ease: 'linear', duration: 0.05 }}
          />
        </svg>
        <AppLogo className="relative h-10 w-10 rounded-[10px]" />
      </div>

      <div className="space-y-2">
        <h2 className="text-2xl font-semibold tracking-tight text-[#1d1d1f] dark:text-white">
          Installing {PRODUCT_NAME}
        </h2>
        <p className="text-sm text-[#86868b]">
          {saving ? 'Saving your preferences…' : PREPARE_STAGES[stageIndex]?.label}
        </p>
        <p className="text-[13px] text-[#6e6e73] dark:text-[#a1a1a6]">
          {PREPARE_STAGES[stageIndex]?.detail}
        </p>
      </div>

      <ul className="w-full max-w-sm space-y-2 text-left">
        {PREPARE_STAGES.map((stage, i) => {
          const done = i < stageIndex || progress >= 1
          const active = i === stageIndex && progress < 1
          return (
            <li
              key={stage.label}
              className={cn(
                'flex items-center gap-3 rounded-xl px-3 py-2 text-sm',
                active && 'bg-[#007AFF]/8 text-[#1d1d1f] dark:text-white',
                done && 'text-[#1d1d1f] dark:text-white',
                !done && !active && 'text-[#86868b]'
              )}
            >
              <span
                className={cn(
                  'flex h-5 w-5 items-center justify-center rounded-full',
                  done || active ? 'bg-[#007AFF] text-white' : 'bg-black/5 dark:bg-white/10'
                )}
              >
                {done ? (
                  <Check className="h-3 w-3" />
                ) : active ? (
                  <Loader2 className="h-3 w-3 animate-spin text-white" />
                ) : null}
              </span>
              {stage.label}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function ReadyStep({ onFinish }: { onFinish: () => void }) {
  return (
    <div className="flex h-full flex-col justify-between gap-8">
      <div className="mx-auto max-w-lg space-y-6 pt-8 text-center">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#34C759]/15 text-[#34C759]"
        >
          <Check className="h-8 w-8" strokeWidth={2.5} />
        </motion.div>
        <div className="space-y-3">
          <h2 className="text-2xl font-semibold tracking-tight text-[#1d1d1f] sm:text-3xl dark:text-white">
            You’re all set
          </h2>
          <p className="text-sm leading-relaxed text-[#6e6e73] dark:text-[#a1a1a6]">
            Your workspace is ready on this device. Add an API key in{' '}
            <span className="font-medium text-[#1d1d1f] dark:text-white">Settings → AI</span>, then
            create a project and start working.
          </p>
        </div>
        <div className="rounded-2xl border border-black/5 bg-white/70 px-4 py-3 text-left text-[13px] leading-relaxed text-[#6e6e73] shadow-sm dark:border-white/10 dark:bg-white/5 dark:text-[#a1a1a6]">
          Tip: Connect OpenAI or local Ollama whenever you need AI. Until then, you can still browse
          projects, docs, and tools offline.
        </div>
      </div>
      <div className="flex flex-col items-center gap-3 pb-2 sm:flex-row sm:justify-center">
        <Button
          size="lg"
          className="min-w-[200px] rounded-full bg-[#007AFF] px-8 text-white hover:bg-[#0071e3]"
          onClick={onFinish}
        >
          Get started
        </Button>
      </div>
    </div>
  )
}

function InfoRow({
  icon: Icon,
  title,
  detail
}: {
  icon: typeof HardDrive
  title: string
  detail: string
}) {
  return (
    <div className="flex gap-3 rounded-2xl border border-black/5 bg-white/70 p-4 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/5">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#007AFF]/10 text-[#007AFF]">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-[#1d1d1f] dark:text-white">{title}</h3>
        <p className="mt-0.5 text-[13px] leading-relaxed text-[#6e6e73] dark:text-[#a1a1a6]">
          {detail}
        </p>
      </div>
    </div>
  )
}

function StepFooter({
  onBack,
  onContinue,
  continueLabel = 'Continue',
  continueDisabled = false
}: {
  onBack: () => void
  onContinue: () => void
  continueLabel?: string
  continueDisabled?: boolean
}) {
  return (
    <div className="mt-auto flex items-center justify-between gap-3 pt-6">
      <Button variant="ghost" className="rounded-full text-[#007AFF] hover:bg-[#007AFF]/10" onClick={onBack}>
        Back
      </Button>
      <Button
        size="lg"
        className="rounded-full bg-[#007AFF] px-7 text-white hover:bg-[#0071e3]"
        disabled={continueDisabled}
        onClick={onContinue}
      >
        {continueLabel}
      </Button>
    </div>
  )
}

/** Used by App boot to decide whether to show SetupFlow. */
export async function loadOnboardingComplete(): Promise<boolean> {
  const api = await waitForDesktopApi()
  if (api?.onboarding) {
    const result = await api.onboarding.get()
    if (result.success && result.data) return result.data.isComplete
    return false
  }

  try {
    const raw = localStorage.getItem(FALLBACK_STORAGE_KEY)
    if (!raw) return false
    const parsed = JSON.parse(raw) as { termsVersion?: string; setupCompletedAt?: string }
    return Boolean(parsed.setupCompletedAt && parsed.termsVersion === TERMS_VERSION)
  } catch {
    return false
  }
}
