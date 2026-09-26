import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ArrowUp, Mic, Plus, Settings2, Square, Volume2, X } from 'lucide-react'
import { Switch } from '@/shared/components/ui/switch'
import { cn } from '@/shared/lib/utils'
import { VOICE_STATE_LABELS, type VoiceMessage, type VoiceState } from '@shared/types/voice-assistant'
import { useVoiceAssistantStore } from '../stores/voice.store'
import { ASSISTANT_NAME } from '../core/wakeWord'
import { VoiceOrb } from './VoiceOrb'
import { ToolConfirmDialog } from './ToolConfirmDialog'

/** Only one window may hold the microphone; the newest session wins. */
const CLAIM_CHANNEL = 'tess-session'
const WINDOW_ID = Math.random().toString(36).slice(2)
const NO_MESSAGES: VoiceMessage[] = []

function statusLine(
  sessionActive: boolean,
  awaitingWakeWord: boolean,
  wakeWordEnabled: boolean,
  state: VoiceState
): string {
  if (!sessionActive) return state === 'IDLE' ? 'Off · type to ask' : VOICE_STATE_LABELS[state]
  if (state === 'IDLE' || state === 'LISTENING') {
    return awaitingWakeWord && wakeWordEnabled
      ? `Listening for “${ASSISTANT_NAME}”`
      : 'Listening — just ask'
  }
  return VOICE_STATE_LABELS[state]
}

/**
 * Tess — the app-wide voice assistant. Lives at the shell root so it can be asked
 * anything from any page, by saying “Tess …” or (with the wake word off) just asking.
 */
export function TessBot({ primary }: { primary: boolean }) {
  const navigate = useNavigate()
  const [ready, setReady] = useState(false)
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const listRef = useRef<HTMLDivElement>(null)
  const autoStarted = useRef(false)

  const load = useVoiceAssistantStore((s) => s.load)
  const settings = useVoiceAssistantStore((s) => s.settings)
  const sessionActive = useVoiceAssistantStore((s) => s.sessionActive)
  const state = useVoiceAssistantStore((s) => s.state)
  const busy = useVoiceAssistantStore((s) => s.busy)
  const error = useVoiceAssistantStore((s) => s.error)
  const awaitingWakeWord = useVoiceAssistantStore((s) => s.awaitingWakeWord)
  const partialTranscript = useVoiceAssistantStore((s) => s.partialTranscript)
  // Stable fallback — a fresh [] per render would make the store selector loop forever.
  const messages = useVoiceAssistantStore((s) => s.active?.messages ?? NO_MESSAGES)
  const pendingConfirmation = useVoiceAssistantStore((s) => s.pendingConfirmation)
  const {
    startSession,
    endSession,
    updateSettings,
    ask,
    startHold,
    stopHold,
    stopSpeech,
    newConversation,
    confirmTool
  } = useVoiceAssistantStore.getState()

  const wakeWordEnabled = settings.voice.wakeWordEnabled !== false
  const displayState: VoiceState = error ? 'ERROR' : state
  const working = state === 'PROCESSING' || state === 'THINKING'
  const visible = messages.filter((m) => m.role === 'user' || m.role === 'assistant').slice(-20)
  const lastAnswer = [...visible].reverse().find((m) => m.role === 'assistant')

  useEffect(() => {
    void load().finally(() => setReady(true))
  }, [load])

  // Switched on last time → resume listening when the workbench opens.
  useEffect(() => {
    if (!ready || !primary || autoStarted.current) return
    autoStarted.current = true
    if (settings.voice.autoStart === true && settings.voice.showFloatingIcon !== false) {
      void startSession()
    }
  }, [ready, primary, settings.voice.autoStart, settings.voice.showFloatingIcon, startSession])

  // Hand the mic over when Tess starts in another window.
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return
    const channel = new BroadcastChannel(CLAIM_CHANNEL)
    channel.onmessage = (event: MessageEvent<{ from: string }>) => {
      if (event.data?.from !== WINDOW_ID && useVoiceAssistantStore.getState().sessionActive) {
        void useVoiceAssistantStore.getState().endSession()
      }
    }
    const unsub = useVoiceAssistantStore.subscribe((next, prev) => {
      if (next.sessionActive && !prev.sessionActive) channel.postMessage({ from: WINDOW_ID })
    })
    return () => {
      unsub()
      channel.close()
    }
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || !(event.ctrlKey || event.metaKey) || event.code !== 'Space') return
      event.preventDefault()
      if (useVoiceAssistantStore.getState().sessionActive) void endSession()
      else void startSession()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [startSession, endSession])

  useEffect(() => {
    if (open) listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [open, visible.length, partialTranscript])

  if (!ready || settings.voice.showFloatingIcon === false) {
    return <ToolConfirmDialog pending={pendingConfirmation} onResolve={(ok) => void confirmTool(ok)} />
  }

  const setEnabled = (on: boolean) => {
    void updateSettings({ voice: { autoStart: on } })
    if (on) void startSession()
    else void endSession()
  }

  const submit = () => {
    const text = draft.trim()
    if (!text || working) return
    setDraft('')
    void ask(text)
  }

  const status = statusLine(sessionActive, awaitingWakeWord, wakeWordEnabled, displayState)
  const showCaption = !open && (working || state === 'SPEAKING') && Boolean(partialTranscript || lastAnswer)

  return (
    <>
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex flex-col items-end gap-2">
        <AnimatePresence>
          {open && (
            <motion.section
              key="panel"
              initial={{ opacity: 0, y: 8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={{ duration: 0.16, ease: 'easeOut' }}
              className="pointer-events-auto flex max-h-[min(640px,calc(100vh-7rem))] w-[min(380px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-border bg-popover text-popover-foreground shadow-float"
              aria-label={ASSISTANT_NAME}
            >
              <header className="flex items-center gap-2.5 border-b border-border/70 px-3.5 py-3">
                <VoiceOrb state={displayState} sessionActive={sessionActive} size="sm" interactive={false} />
                <div className="min-w-0 flex-1">
                  <p className="font-display text-[17px] leading-none">{ASSISTANT_NAME}</p>
                  <p className="mt-1 truncate text-[11.5px] text-muted-foreground" aria-live="polite">
                    {status}
                  </p>
                </div>
                <Switch
                  checked={sessionActive}
                  onCheckedChange={setEnabled}
                  aria-label={sessionActive ? `Turn off ${ASSISTANT_NAME}` : `Turn on ${ASSISTANT_NAME}`}
                  title={sessionActive ? `Turn off ${ASSISTANT_NAME}` : `Turn on ${ASSISTANT_NAME}`}
                />
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </header>

              <div className="flex items-center gap-1 border-b border-border/70 px-3.5 py-2">
                <span className="mr-auto text-[11.5px] text-muted-foreground">Voice</span>
                {[
                  { on: true, label: `Say “${ASSISTANT_NAME}”` },
                  { on: false, label: 'Just ask' }
                ].map((option) => (
                  <button
                    key={option.label}
                    type="button"
                    onClick={() => void updateSettings({ voice: { wakeWordEnabled: option.on } })}
                    className={cn(
                      'rounded-md px-2 py-1 text-[11.5px] font-medium transition-colors',
                      wakeWordEnabled === option.on
                        ? 'bg-secondary text-foreground'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              <div ref={listRef} className="min-h-[140px] flex-1 space-y-3 overflow-y-auto px-3.5 py-3">
                {visible.length === 0 && !partialTranscript && (
                  <div className="py-6 text-center">
                    <p className="font-display text-lg">Ask me anything</p>
                    <p className="mx-auto mt-1.5 max-w-[260px] text-[12px] leading-relaxed text-muted-foreground">
                      {sessionActive
                        ? wakeWordEnabled
                          ? `Say “${ASSISTANT_NAME}, …” followed by your question.`
                          : 'Just speak — every question is answered.'
                        : `Turn ${ASSISTANT_NAME} on to talk, or type below. Ctrl or ⌘ + Space toggles listening.`}
                    </p>
                  </div>
                )}
                {visible.map((m) =>
                  m.role === 'user' ? (
                    <div key={m.id} className="flex justify-end">
                      <p className="max-w-[85%] rounded-xl bg-secondary px-3 py-2 text-[13px] leading-5">
                        {m.content}
                      </p>
                    </div>
                  ) : (
                    <div key={m.id} className="markdown-body prose-sm max-w-none text-[13px] leading-6 dark:prose-invert">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                    </div>
                  )
                )}
                {working && (
                  <p className="flex items-center gap-2 text-[12px] text-muted-foreground">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
                    {VOICE_STATE_LABELS[state]}
                  </p>
                )}
                {partialTranscript && state === 'LISTENING' && (
                  <p className="text-right text-[12.5px] italic text-muted-foreground">{partialTranscript}</p>
                )}
                {error && <p className="text-[12px] text-destructive">{error.message}</p>}
              </div>

              <div className="border-t border-border/70 p-2.5">
                <div className="flex items-end gap-1 rounded-xl border border-border bg-card px-1.5 py-1 focus-within:border-foreground/20">
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        submit()
                      }
                    }}
                    rows={1}
                    placeholder={`Ask ${ASSISTANT_NAME}…`}
                    className="max-h-28 min-h-[34px] flex-1 resize-none bg-transparent px-1.5 py-1.5 text-[13px] outline-none placeholder:text-muted-foreground"
                  />
                  {state === 'SPEAKING' ? (
                    <IconBtn label="Stop speaking" onClick={() => void stopSpeech()}>
                      <Square className="h-3 w-3 fill-current" />
                    </IconBtn>
                  ) : (
                    <IconBtn
                      label={state === 'LISTENING' ? 'Done talking' : 'Talk'}
                      active={state === 'LISTENING'}
                      disabled={working || busy}
                      onClick={() => void (state === 'LISTENING' ? stopHold() : startHold(true))}
                    >
                      <Mic className="h-3.5 w-3.5" />
                    </IconBtn>
                  )}
                  <button
                    type="button"
                    onClick={submit}
                    disabled={!draft.trim() || working}
                    className="mb-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-opacity disabled:opacity-40"
                    aria-label="Send"
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="mt-1.5 flex items-center justify-between px-1">
                  <button
                    type="button"
                    onClick={() => void newConversation()}
                    className="flex items-center gap-1 text-[11.5px] text-muted-foreground hover:text-foreground"
                  >
                    <Plus className="h-3 w-3" />
                    New conversation
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false)
                      navigate('/settings?tab=voice')
                    }}
                    className="flex items-center gap-1 text-[11.5px] text-muted-foreground hover:text-foreground"
                  >
                    <Settings2 className="h-3 w-3" />
                    Voice settings
                  </button>
                </div>
              </div>
            </motion.section>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showCaption && (
            <motion.button
              key="caption"
              type="button"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              onClick={() => setOpen(true)}
              className="pointer-events-auto max-w-[320px] rounded-xl border border-border bg-popover px-3 py-2 text-left text-[12.5px] leading-5 text-popover-foreground shadow-float"
            >
              <span className="line-clamp-3">
                {working ? partialTranscript || VOICE_STATE_LABELS[state] : lastAnswer?.content}
              </span>
            </motion.button>
          )}
        </AnimatePresence>

        <div
          className={cn(
            'pointer-events-auto flex items-center gap-1 rounded-full border border-border bg-popover py-1 pl-1 pr-1.5 shadow-float',
            sessionActive && state === 'LISTENING' && 'ring-1 ring-voice-active/40'
          )}
        >
          <button
            type="button"
            className="flex min-w-0 items-center gap-2 rounded-full pr-1 text-left"
            onClick={() => setOpen((v) => !v)}
            title={open ? `Hide ${ASSISTANT_NAME}` : `Open ${ASSISTANT_NAME}`}
            aria-expanded={open}
          >
            <VoiceOrb state={displayState} sessionActive={sessionActive} size="sm" interactive={false} />
            <span className="min-w-0">
              <span className="block text-xs font-medium leading-none">{ASSISTANT_NAME}</span>
              <span className="mt-0.5 block max-w-[150px] truncate text-[10.5px] text-muted-foreground">
                {sessionActive ? status : 'Off'}
              </span>
            </span>
          </button>
          {state === 'SPEAKING' && (
            <IconBtn label="Stop speaking" onClick={() => void stopSpeech()}>
              <Volume2 className="h-3.5 w-3.5" />
            </IconBtn>
          )}
          <Switch
            checked={sessionActive}
            onCheckedChange={setEnabled}
            className="scale-[0.8]"
            aria-label={sessionActive ? `Turn off ${ASSISTANT_NAME}` : `Turn on ${ASSISTANT_NAME}`}
            title={`${sessionActive ? 'Turn off' : 'Turn on'} ${ASSISTANT_NAME} (Ctrl or ⌘ + Space)`}
          />
        </div>
      </div>

      <ToolConfirmDialog pending={pendingConfirmation} onResolve={(ok) => void confirmTool(ok)} />
    </>
  )
}

function IconBtn({
  label,
  onClick,
  children,
  active,
  disabled
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
  active?: boolean
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        'mb-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40',
        active && 'bg-voice-active/15 text-voice-active hover:bg-voice-active/20 hover:text-voice-active'
      )}
    >
      {children}
    </button>
  )
}
