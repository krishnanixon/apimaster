import { useEffect, useState, type ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, Cloud, LoaderCircle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/shared/components/ui/button'
import { Switch } from '@/shared/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/shared/components/ui/dialog'
import type {
  VoiceAssistantSettings,
  VoiceAssistantSettingsPatch,
  VoiceLocalModelId,
  VoiceLocalModelStatus
} from '@shared/types/voice-assistant'
import { sttReadiness, type SttReadiness } from '@shared/lib/voice-stt-readiness'
import type { MicrophoneDevice } from '../core/audioRecorder'
import { isBrowserSttAvailable } from '../core/webSpeechStt'
import { ASSISTANT_NAME } from '../core/wakeWord'
import { toast } from 'sonner'

const SELECT =
  'flex h-9 w-full rounded-lg border border-input bg-background px-3 text-sm shadow-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/15 disabled:opacity-50'

const LANGUAGES = [
  { value: 'en-US', label: 'English (US)' },
  { value: 'en-GB', label: 'English (UK)' },
  { value: 'hi-IN', label: 'Hindi' },
  { value: 'es-ES', label: 'Spanish' },
  { value: 'fr-FR', label: 'French' },
  { value: 'de-DE', label: 'German' },
  { value: 'ja-JP', label: 'Japanese' },
  { value: 'zh-CN', label: 'Chinese (Simplified)' }
]

const KOKORO_VOICES = [
  { value: 'af_heart', label: 'Heart', detail: 'Warm · American English' },
  { value: 'af_bella', label: 'Bella', detail: 'Expressive · American English' },
  { value: 'af_nicole', label: 'Nicole', detail: 'Clear · American English' },
  { value: 'af_sarah', label: 'Sarah', detail: 'Calm · American English' },
  { value: 'af_nova', label: 'Nova', detail: 'Bright · American English' },
  { value: 'am_michael', label: 'Michael', detail: 'Steady · American English' },
  { value: 'am_fenrir', label: 'Fenrir', detail: 'Confident · American English' },
  { value: 'am_liam', label: 'Liam', detail: 'Friendly · American English' },
  { value: 'bf_emma', label: 'Emma', detail: 'Warm · British English' },
  { value: 'bm_george', label: 'George', detail: 'Clear · British English' }
]

export function VoiceSettingsPanel({
  settings,
  microphones,
  onChange,
  onClear
}: {
  settings: VoiceAssistantSettings
  microphones: MicrophoneDevice[]
  onChange: (patch: VoiceAssistantSettingsPatch) => void
  onClear: () => void
}) {
  const [models, setModels] = useState<VoiceLocalModelStatus[]>([])
  const [confirmClear, setConfirmClear] = useState(false)

  useEffect(() => {
    let active = true
    const refresh = async () => {
      if (document.visibilityState === 'hidden') return
      const result = await window.electronAPI.voice.getModelStatus()
      if (active && result.success) setModels(result.data ?? [])
    }
    void refresh()
    const timer = window.setInterval(() => void refresh(), 2000)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      active = false
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [])

  const manageModel = async (action: 'download' | 'cancel' | 'remove', id: VoiceLocalModelId) => {
    try {
      const result = action === 'download'
        ? await window.electronAPI.voice.downloadModel(id)
        : action === 'cancel'
          ? await window.electronAPI.voice.cancelModelDownload(id)
          : await window.electronAPI.voice.removeModel(id)
      if (!result.success) toast.error(result.error ?? 'Could not update local model')
      else if (action === 'download') {
        if (id === 'kokoro-82m') {
          onChange({ tts: { provider: 'local', model: 'kokoro-82m', voice: settings.tts.voice || 'af_heart' } })
          toast.success('Kokoro is ready and selected for spoken replies')
        } else {
          onChange({
            stt: {
              provider: 'local-whisper',
              model: id === 'whisper-small' ? 'small' : 'base.en'
            }
          })
          toast.success('Local transcription model downloaded and selected')
        }
      }
      else if (action === 'remove') toast.success('Local model removed')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update local model')
    } finally {
      const status = await window.electronAPI.voice.getModelStatus()
      if (status.success) setModels(status.data ?? [])
    }
  }

  const browserCaptions = isBrowserSttAvailable()
  const readiness = sttReadiness(settings, models, { browserCaptionsAvailable: browserCaptions })
  const whisperModel = (model: 'base.en' | 'small') =>
    models.find((item) => item.id === (model === 'small' ? 'whisper-small' : 'whisper-base.en'))
  const isActiveModel = (id: VoiceLocalModelId) =>
    id === 'kokoro-82m'
      ? settings.tts.provider === 'local'
      : settings.stt.provider === 'local-whisper' &&
        settings.stt.model === (id === 'whisper-small' ? 'small' : 'base.en')
  const activateModel = (id: VoiceLocalModelId) => {
    if (id === 'kokoro-82m') onChange({ tts: { provider: 'local', model: 'kokoro-82m', voice: settings.tts.voice || 'af_heart' } })
    else onChange({ stt: { provider: 'local-whisper', model: id === 'whisper-small' ? 'small' : 'base.en' } })
  }
  const runReadinessAction = () => {
    if (readiness.ready) return
    const action = readiness.action
    if (action.kind === 'download' || action.kind === 'finish-setup') void manageModel('download', action.modelId)
    else if (action.kind === 'use-installed') {
      onChange({ stt: { provider: 'local-whisper', model: action.model } })
      toast.success(`Switched to Whisper ${action.model}`)
    } else onChange({ stt: { provider: 'openai-whisper' } })
  }

  const pauseSeconds = (settings.voice.silenceTimeoutMs / 1000).toFixed(1)
  const kokoroInstalled = models.some((model) => model.id === 'kokoro-82m' && model.installed)
  const selectedKokoroVoice = KOKORO_VOICES.some((voice) => voice.value === settings.tts.voice)
    ? settings.tts.voice
    : 'af_heart'

  return (
    <div className="space-y-7">
      <Section
        title="Speech"
        description="Speech recognition and spoken replies run locally. Download the models you want to use; voice audio is not sent to an AI provider."
      >
        <SpeechStatusCard readiness={readiness} onAction={runReadinessAction} />
        <Field label="Microphone">
          <select
            className={SELECT}
            value={settings.stt.microphoneId}
            onChange={(e) => onChange({ stt: { microphoneId: e.target.value } })}
          >
            <option value="">System default</option>
            {microphones.map((mic) => (
              <option key={mic.deviceId} value={mic.deviceId}>
                {mic.label}
              </option>
            ))}
            {settings.stt.microphoneId &&
              !microphones.some((mic) => mic.deviceId === settings.stt.microphoneId) && (
                <option value={settings.stt.microphoneId}>
                  Selected microphone unavailable — using default
                </option>
              )}
          </select>
        </Field>
        <Field label="Transcription engine">
          <select
            className={SELECT}
            value={settings.stt.provider}
            onChange={(e) => onChange({ stt: { provider: e.target.value as VoiceAssistantSettings['stt']['provider'] } })}
          >
            <option value="local-whisper">Whisper · on this device (private)</option>
            {(browserCaptions || settings.stt.provider === 'browser') && (
              <option value="browser">
                {browserCaptions ? 'Browser captions · private' : 'Browser captions · not available here, uses Whisper'}
              </option>
            )}
            <option value="openai-whisper">OpenAI Whisper · cloud, needs API key</option>
          </select>
        </Field>
        <Field label="Whisper model">
          <select className={SELECT} disabled={settings.stt.provider !== 'local-whisper'} value={settings.stt.model} onChange={(e) => onChange({ stt: { provider: 'local-whisper', model: e.target.value as 'base.en' | 'small' } })}>
            <option value="base.en">
              base.en · fastest, English only{whisperModel('base.en')?.installed ? ' · installed' : ' · not downloaded'}
            </option>
            <option value="small">
              small · slower, multilingual{whisperModel('small')?.installed ? ' · installed' : ' · not downloaded'}
            </option>
          </select>
        </Field>
        <Field label="Language">
          <select
            className={SELECT}
            value={settings.stt.autoDetectLanguage ? 'auto' : settings.stt.language}
            onChange={(e) =>
              onChange({
                stt:
                  e.target.value === 'auto'
                    ? { autoDetectLanguage: true }
                    : { language: e.target.value, autoDetectLanguage: false }
              })
            }
          >
            <option value="auto">Detect automatically</option>
            {LANGUAGES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
            {!LANGUAGES.some((item) => item.value === settings.stt.language) && (
              <option value={settings.stt.language}>{settings.stt.language}</option>
            )}
          </select>
        </Field>
        <div className="space-y-3 rounded-xl border border-border/70 bg-card/40 p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Spoken replies</p>
              <p className="text-xs text-muted-foreground">Choose which voice reads Tess’s answers.</p>
            </div>
            {settings.tts.provider === 'local' && (
              <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-[10px] font-medium text-emerald-700 dark:text-emerald-300">Local</span>
            )}
          </div>
          <select
            className={SELECT}
            value={settings.tts.provider}
            onChange={(e) => {
              const provider = e.target.value as VoiceAssistantSettings['tts']['provider']
              onChange({
                tts:
                  provider === 'local'
                    ? { provider, model: 'kokoro-82m', voice: selectedKokoroVoice }
                    : { provider }
              })
            }}
          >
            <option value="local">Kokoro 82M · natural local voice</option>
            <option value="system">System voice · instant fallback</option>
            <option value="openai">OpenAI TTS · cloud</option>
          </select>
          {settings.tts.provider === 'local' && (
            <>
              <select className={SELECT} disabled={!kokoroInstalled} value={selectedKokoroVoice} onChange={(e) => onChange({ tts: { provider: 'local', model: 'kokoro-82m', voice: e.target.value } })}>
                {KOKORO_VOICES.map((voice) => <option key={voice.value} value={voice.value}>{voice.label} · {voice.detail}</option>)}
              </select>
              {!kokoroInstalled && <p className="text-xs text-amber-600 dark:text-amber-300">Download Kokoro 82M below to enable local voices.</p>}
            </>
          )}
          {settings.tts.provider === 'openai' && <select className={SELECT} value={settings.tts.voice || 'nova'} onChange={(e) => onChange({ tts: { voice: e.target.value } })}>
            <option value="alloy">Alloy</option><option value="echo">Echo</option><option value="fable">Fable</option><option value="onyx">Onyx</option><option value="nova">Nova</option><option value="shimmer">Shimmer</option>
          </select>}
        </div>
        <div className="rounded-lg border border-border/70 p-3 space-y-3">
          <p className="text-sm font-medium">Local models</p>
          {models.map((model) => <div key={model.id} className="flex items-center justify-between gap-3 text-sm">
            <span>{model.label} <span className="text-muted-foreground">· {Math.round(model.sizeBytes / 1024 / 1024)} MB</span>{model.downloading ? <span className="text-muted-foreground"> · {model.progress !== null ? `${Math.round(model.progress * 100)}%` : model.id.startsWith('whisper') ? 'Setting up engine… (a few minutes)' : 'Preparing…'}</span> : model.error ? <span className="text-destructive"> · {model.error}</span> : null}</span>
            {model.downloading ? <Button size="sm" variant="outline" onClick={() => void manageModel('cancel', model.id)}>Cancel</Button> : model.installed ? <div className="flex items-center gap-2">
              {model.engineReady === false ? (
                <Button size="sm" onClick={() => void manageModel('download', model.id)}>Finish setup</Button>
              ) : isActiveModel(model.id) ? (
                <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">Active</span>
              ) : (
                <Button size="sm" variant="outline" onClick={() => activateModel(model.id)}>Use</Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => void manageModel('remove', model.id)}>Remove</Button>
            </div> : <Button size="sm" onClick={() => void manageModel('download', model.id)}>Download</Button>}
          </div>)}
          <p className="text-xs text-muted-foreground">Installed models stay on this device. Selecting a model also makes it active for the matching voice task.</p>
        </div>
      </Section>

      <Section
        title={ASSISTANT_NAME}
        description={`${ASSISTANT_NAME} listens in the background on every page. Toggle with Ctrl or ⌘ + Space.`}
      >
        <Toggle
          label={`Turn on ${ASSISTANT_NAME} when the app opens`}
          hint="Keeps the microphone listening in the background while the app is open"
          checked={settings.voice.autoStart === true}
          onChange={(checked) => onChange({ voice: { autoStart: checked } })}
        />
        <Toggle
          label="Hands-free conversation"
          hint="Listen again after each reply"
          checked={settings.voice.autoListen}
          onChange={(checked) => onChange({ voice: { autoListen: checked } })}
        />
        <Toggle
          label={`Wait for “${ASSISTANT_NAME}”`}
          hint={`On: say “${ASSISTANT_NAME}, …” to ask. Off: every question you say is answered.`}
          checked={settings.voice.wakeWordEnabled !== false}
          onChange={(checked) => onChange({ voice: { wakeWordEnabled: checked } })}
        />
        <Toggle
          label="Save conversations"
          hint="When off, new conversation content stays in memory until the app closes. Previously saved history is kept."
          checked={settings.privacy.storeConversations}
          onChange={(checked) => onChange({ privacy: { storeConversations: checked } })}
        />
      </Section>

      <details className="rounded-xl border border-border/70 p-3">
        <summary className="cursor-pointer text-sm font-medium">Advanced settings</summary>
        <div className="mt-4 space-y-6">
          <Section title="Listening">
            <Field label="Finish speaking">
              <select
                className={SELECT}
                value={
                  settings.voice.vadEnabled ? String(settings.voice.silenceTimeoutMs) : 'manual'
                }
                onChange={(e) =>
                  onChange({
                    voice:
                      e.target.value === 'manual'
                        ? { vadEnabled: false }
                        : { vadEnabled: true, silenceTimeoutMs: Number(e.target.value) }
                  })
                }
              >
                <option value="900">After a short pause · 0.9s</option>
                <option value="1500">After a longer pause · 1.5s</option>
                <option value="2500">Take my time · 2.5s</option>
                <option value="manual">When I press Done</option>
                {![900, 1500, 2500].includes(settings.voice.silenceTimeoutMs) && (
                  <option value={settings.voice.silenceTimeoutMs}>After {pauseSeconds}s</option>
                )}
              </select>
            </Field>
            <Toggle
              label="Reduce background noise"
              checked={settings.voice.noiseReduction !== false}
              onChange={(checked) => onChange({ voice: { noiseReduction: checked } })}
            />
            <Toggle
              label={`Show ${ASSISTANT_NAME} button`}
              hint={`Open or stop ${ASSISTANT_NAME} from any page`}
              checked={settings.voice.showFloatingIcon !== false}
              onChange={(checked) => onChange({ voice: { showFloatingIcon: checked } })}
            />
          </Section>
          <Section title="Playback">
            <Field label={`Speed · ${settings.tts.speed.toFixed(1)}×`}>
              <input
                aria-label="Speech speed"
                type="range"
                min={0.5}
                max={2}
                step={0.1}
                value={settings.tts.speed}
                onChange={(e) => onChange({ tts: { speed: Number(e.target.value) } })}
                className="w-full accent-primary"
              />
            </Field>
            <Field label={`Volume · ${Math.round(settings.tts.volume * 100)}%`}>
              <input
                aria-label="Speech volume"
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={settings.tts.volume}
                onChange={(e) => onChange({ tts: { volume: Number(e.target.value) } })}
                className="w-full accent-primary"
              />
            </Field>
          </Section>
          <Section title="Knowledge & actions" description="Uses your AI settings and API keys.">
            <Field label="AI provider">
              <select
                className={SELECT}
                value={settings.privacy.preferLocalProcessing ? 'ollama' : settings.ai.provider}
                onChange={(e) =>
                  onChange({
                    ai: { provider: e.target.value as 'workbench' | 'openai' | 'ollama' },
                    privacy: { preferLocalProcessing: false }
                  })
                }
              >
                <option value="workbench">Use studio AI settings</option>
                <option value="ollama">Ollama · local model</option>
              </select>
            </Field>
            <Toggle
              label="Use project knowledge"
              hint="Retrieve indexed project content. Linked to Vector DB settings."
              checked={settings.rag?.enabled !== false}
              onChange={(checked) => onChange({ rag: { enabled: checked } })}
            />
            <Toggle
              label="Remember facts"
              hint="Save facts you ask Tess to remember separately from conversation history"
              checked={settings.memory?.enabled !== false}
              onChange={(checked) => onChange({ memory: { enabled: checked } })}
            />
            <Toggle
              label="Copy completed answers"
              checked={settings.privacy.autoCopyResponses === true}
              onChange={(checked) => onChange({ privacy: { autoCopyResponses: checked } })}
            />
            <VectorRagLink />
          </Section>
        </div>
      </details>
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Hold Space to talk · Ctrl or ⌘ + Space to start or end a session · Esc to close panels. Stop
        ends listening and playback immediately.
      </p>
      <Button variant="destructive" onClick={() => setConfirmClear(true)}>
        Delete all local voice data
      </Button>

      <Dialog open={confirmClear} onOpenChange={setConfirmClear}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete all voice data?</DialogTitle>
            <DialogDescription>
              Conversations, remembered facts, and local assistant files will be permanently
              removed. Settings are kept.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmClear(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setConfirmClear(false)
                onClear()
              }}
            >
              Delete data
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Section({
  title,
  description,
  children
}: {
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <section>
      <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
      {description && (
        <p className="mb-3 mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
      )}
      <div className="space-y-3">{children}</div>
    </section>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}

function Toggle({
  label,
  hint,
  checked,
  onChange
}: {
  label: string
  hint?: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border/70 px-3 py-2.5">
      <div className="min-w-0">
        <p className="text-sm">{label}</p>
        {hint && <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{hint}</p>}
      </div>
      <Switch aria-label={label} checked={checked} onCheckedChange={onChange} />
    </div>
  )
}

function VectorRagLink() {
  const navigate = useNavigate()
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={() => navigate('/settings?tab=vector')}
    >
      Open Vector DB settings
    </Button>
  )
}

function SpeechStatusCard({
  readiness,
  onAction
}: {
  readiness: SttReadiness
  onAction: () => void
}) {
  const setupRunning = !readiness.ready && readiness.label.startsWith('Setting up')
  const tone = readiness.ready
    ? readiness.cloud
      ? 'border-sky-500/30 bg-sky-500/10'
      : 'border-emerald-500/30 bg-emerald-500/10'
    : 'border-amber-500/40 bg-amber-500/10'
  const Icon = readiness.ready
    ? readiness.cloud
      ? Cloud
      : CheckCircle2
    : setupRunning
      ? LoaderCircle
      : AlertTriangle
  return (
    <div className={`rounded-xl border p-3 ${tone}`} role="status" aria-live="polite">
      <div className="flex items-start gap-2.5">
        <Icon
          className={`mt-0.5 h-4 w-4 shrink-0 ${
            readiness.ready
              ? readiness.cloud
                ? 'text-sky-600 dark:text-sky-300'
                : 'text-emerald-600 dark:text-emerald-300'
              : 'text-amber-600 dark:text-amber-300'
          } ${setupRunning ? 'animate-spin' : ''}`}
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            {readiness.ready ? `Speech recognition ready · ${readiness.label}` : readiness.label}
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{readiness.detail}</p>
          {!readiness.ready && (
            <Button size="sm" className="mt-2.5 h-8" variant={setupRunning ? 'outline' : 'default'} onClick={onAction}>
              {readiness.action.text}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
