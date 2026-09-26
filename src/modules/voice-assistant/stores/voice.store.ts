import { create } from 'zustand'
import { toast } from 'sonner'
import {
  DEFAULT_VOICE_ASSISTANT_SETTINGS,
  VOICE_STATE_LABELS,
  type VoiceAssistantSettings,
  type VoiceAssistantSettingsPatch,
  type VoiceConversation,
  type VoiceConversationSummary,
  type VoiceErrorCode,
  type VoiceMessage,
  type VoicePendingConfirmation,
  type VoiceState,
  type VoiceTranscript,
  type VoiceUserError,
  type VoiceSynthesizeResult
} from '@shared/types/voice-assistant'
import { classifyProviderError, classifySttError, voiceUserError } from '@shared/lib/voice-errors'
import {
  AudioRecorder,
  blobToBase64,
  listMicrophones,
  type MicrophoneDevice
} from '../core/audioRecorder'
import { playAudioBase64, speakWithSystemTts, stopSystemSpeech } from '../core/systemTts'
import { isBrowserSttAvailable, WebSpeechStt } from '../core/webSpeechStt'
import { createNoiseGate, createTurnDetector } from '../core/vad'
import { ASSISTANT_NAME, matchWakeWord, READY_LINE, WAKE_ACK } from '../core/wakeWord'
import { splitSpeechChunks, toSpeakableText } from '../lib/speech-text'
import { sttReadiness } from '@shared/lib/voice-stt-readiness'
import { waitForDesktopApi } from '@/shared/lib/desktop-api'

interface VoiceAssistantStore {
  state: VoiceState
  settings: VoiceAssistantSettings
  conversations: VoiceConversationSummary[]
  active: VoiceConversation | null
  partialTranscript: string
  error: VoiceUserError | null
  pendingConfirmation: VoicePendingConfirmation | null
  cloudProcessing: boolean
  microphones: MicrophoneDevice[]
  busy: boolean
  settingsOpen: boolean
  searchQuery: string
  sessionActive: boolean
  /** Waiting for the wake word before processing a command (Ok-Google style). */
  awaitingWakeWord: boolean
  audioLevel: number
  audioBands: number[]
  load: () => Promise<void>
  leave: () => Promise<void>
  refreshConversations: () => Promise<void>
  selectConversation: (id: string) => Promise<void>
  newConversation: () => Promise<void>
  renameConversation: (id: string, title: string) => Promise<void>
  deleteConversation: (id: string) => Promise<void>
  search: (query: string) => Promise<void>
  updateSettings: (patch: VoiceAssistantSettingsPatch) => Promise<void>
  startSession: () => Promise<void>
  endSession: () => Promise<void>
  startHold: (manual?: boolean) => Promise<void>
  stopHold: () => Promise<void>
  toggleTalk: () => Promise<void>
  cancel: () => Promise<void>
  stopSpeech: () => Promise<void>
  replayLast: () => Promise<void>
  ask: (text: string) => Promise<void>
  confirmTool: (approved: boolean) => Promise<void>
  clearData: () => Promise<void>
  setSettingsOpen: (open: boolean) => void
  greet: () => Promise<void>
}

let recorder: AudioRecorder | null = null
let browserStt: WebSpeechStt | null = null
let holdInFlight = false
let eventUnsub: (() => void) | null = null
let levelRaf: number | null = null
let turnDetector: ReturnType<typeof createTurnDetector> | null = null
let sessionEpoch = 0
let speechEpoch = 0
let sttEndTimer: number | null = null
/** Last time mic energy looked like real speech (above ambient). */
let lastLoudSpeechAt = 0
/** True once browser STT actually returned captions this listen turn. */
let browserSttGotResult = false

/** Soft floor — rejects tiny ambient blips, not normal talking. */
const VOICE_RMS = 0.018
const VOICE_GRACE_MS = 2000
/** One toast slot for voice errors so a failure is never announced twice. */
const VOICE_TOAST_ID = 'voice-error'

/** Transient failures that should not end a hands-free session. */
const SESSION_RECOVERABLE = new Set<VoiceErrorCode>([
  'stt-empty',
  'stt-timeout',
  'stt-network',
  'ai-timeout',
  'ai-rate-limit',
  'ai-provider-failure',
  'tts-playback-failed',
  'cancelled'
])

function showVoiceError(error: VoiceUserError): void {
  toast.error(error.message, { id: VOICE_TOAST_ID })
}

function clearSttEndTimer(): void {
  if (sttEndTimer !== null) {
    window.clearTimeout(sttEndTimer)
    sttEndTimer = null
  }
}

function stopLevelLoop(): void {
  if (levelRaf !== null) {
    window.cancelAnimationFrame(levelRaf)
    levelRaf = null
  }
  turnDetector = null
  clearSttEndTimer()
}

function noteLoudSpeech(): void {
  lastLoudSpeechAt = performance.now()
}

function recentlyLoud(graceMs = VOICE_GRACE_MS): boolean {
  return lastLoudSpeechAt > 0 && performance.now() - lastLoudSpeechAt <= graceMs
}

function classifyMicError(error: unknown): VoiceUserError {
  const name = error instanceof DOMException ? error.name : ''
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase()
  if (
    name === 'NotAllowedError' ||
    name === 'PermissionDeniedError' ||
    message.includes('permission')
  ) {
    return voiceUserError('mic-permission-denied')
  }
  if (
    name === 'NotFoundError' ||
    name === 'OverconstrainedError' ||
    message.includes('requested device not found')
  ) {
    return voiceUserError('mic-unavailable')
  }
  if (name === 'NotReadableError' || name === 'AbortError') {
    return voiceUserError('mic-disconnected')
  }
  if (name === 'NotSupportedError' || message.includes('undefined')) {
    return voiceUserError('recording-failed')
  }
  return voiceUserError('recording-failed')
}

const GREETING = READY_LINE

async function speakReply(
  text: string,
  settings: VoiceAssistantSettings,
  onStarted?: () => void
): Promise<void> {
  const epoch = speechEpoch
  let started = false
  const markStarted = () => {
    if (started) return
    started = true
    onStarted?.()
  }
  const spoken = toSpeakableText(text)
  if (!spoken) {
    markStarted()
    return
  }
  const systemOptions = {
    voice: settings.tts.voice,
    speed: settings.tts.speed,
    volume: settings.tts.volume,
    language: settings.stt.language,
    onStarted: markStarted
  }
  // System TTS in the renderer starts immediately — skip the main-process round trip.
  // Older preload bridges without synthesis also fall back here. Once the synthesis
  // bridge exists, errors must not fall back to the system voice because that hides a
  // broken local model selection.
  if (
    settings.tts.provider === 'system' ||
    typeof window.electronAPI.voice.synthesize !== 'function'
  ) {
    await speakWithSystemTts(spoken, systemOptions)
    markStarted()
    return
  }

  // Synthesize sentence chunks and play each one while the next is being generated,
  // so long answers start speaking after the first sentence instead of the whole reply.
  const synthesize = (chunk: string) =>
    window.electronAPI.voice
      .synthesize(chunk)
      .catch((error: unknown) => ({
        success: false as const,
        data: undefined,
        error: error instanceof Error ? error.message : String(error)
      }))
  const chunks = splitSpeechChunks(spoken, 240)
  let next: ReturnType<typeof synthesize> | null = synthesize(chunks[0])
  for (let i = 0; i < chunks.length && next; i++) {
    const synth = await next
    if (epoch !== speechEpoch) return
    if (!synth.success || !synth.data) {
      throw new Error(synth.error ?? `The ${settings.tts.provider} voice could not be generated.`)
    }
    next = i + 1 < chunks.length ? synthesize(chunks[i + 1]) : null
    await playSynthesized(synth.data, chunks[i], settings, markStarted)
    if (epoch !== speechEpoch) return
  }
  markStarted()
}

async function playSynthesized(
  result: VoiceSynthesizeResult | undefined,
  text: string,
  settings: VoiceAssistantSettings,
  onStarted: () => void
): Promise<void> {
  if (result?.audioBase64) {
    await playAudioBase64(
      result.audioBase64,
      result.mimeType ?? 'audio/mpeg',
      settings.tts.volume,
      onStarted
    )
    return
  }
  if (result?.handled) {
    onStarted()
    return
  }
  await speakWithSystemTts(text, {
    voice: settings.tts.voice,
    speed: settings.tts.speed,
    volume: settings.tts.volume,
    language: settings.stt.language,
    onStarted
  })
}

/**
 * Checks local speech recognition before opening the mic, so a missing model is reported
 * up front instead of after the user has already spoken.
 */
async function sttSetupError(settings: VoiceAssistantSettings): Promise<VoiceUserError | null> {
  const voice = window.electronAPI?.voice
  if (settings.stt.provider === 'openai-whisper' || typeof voice?.getModelStatus !== 'function') {
    return null
  }
  const status = await voice.getModelStatus().catch(() => null)
  if (!status?.success || !status.data) return null
  const readiness = sttReadiness(settings, status.data, {
    browserCaptionsAvailable: isBrowserSttAvailable()
  })
  // An installed alternative model is picked automatically by the engine.
  if (readiness.ready || readiness.action.kind === 'use-installed') return null
  return { code: 'stt-unavailable', message: `${readiness.label}. ${readiness.detail}` }
}

function isVoiceError(error: unknown): error is VoiceUserError {
  return Boolean(error && typeof error === 'object' && 'code' in error && 'message' in error)
}

export const useVoiceAssistantStore = create<VoiceAssistantStore>((set, get) => {
  function startLevelLoop(): void {
    stopLevelLoop()
    lastLoudSpeechAt = 0
    turnDetector = createTurnDetector({
      silenceMs: get().settings.voice.silenceTimeoutMs,
      minSpeechMs: 320,
      maxMs: 20000
    })
    const noiseGate = createNoiseGate({
      multiplier: 3.6,
      minThreshold: VOICE_RMS,
      attackSamples: 2,
      hangoverSamples: 5
    })
    let last = performance.now()
    const tick = (now: number) => {
      if (!recorder || get().state !== 'LISTENING') {
        levelRaf = null
        return
      }
      const dt = Math.min(120, now - last)
      last = now
      const rms = recorder.rms()
      const gated =
        get().settings.voice.noiseReduction !== false
          ? noiseGate.sample(rms)
          : { isSpeech: rms >= VOICE_RMS, threshold: VOICE_RMS, level: rms }
      const speech = gated.isSpeech
      if (speech || rms >= VOICE_RMS * 1.4) noteLoudSpeech()
      set({
        audioLevel: Math.min(1, rms * 10),
        audioBands: recorder.bands(24)
      })
      if (get().settings.voice.vadEnabled && turnDetector?.sample(speech, dt) === 'end') {
        // Only wait for a live-caption wake word if captions are actually arriving.
        // Electron often exposes SpeechRecognition that never returns text — still
        // end the turn so Whisper can transcribe "Tess".
        if (
          get().awaitingWakeWord &&
          browserStt &&
          browserSttGotResult &&
          !matchWakeWord(get().partialTranscript).heard
        ) {
          levelRaf = window.requestAnimationFrame(tick)
          return
        }
        void get().stopHold()
        return
      }
      levelRaf = window.requestAnimationFrame(tick)
    }
    levelRaf = window.requestAnimationFrame(tick)
  }

  function armBrowserStt(settings: VoiceAssistantSettings): void {
    if (settings.stt.provider !== 'browser' || !isBrowserSttAvailable()) return
    browserStt = new WebSpeechStt()
    browserSttGotResult = false
    const settleMs = Math.min(
      450,
      Math.max(220, Math.floor(settings.voice.silenceTimeoutMs * 0.35))
    )
    const started = browserStt.start(settings.stt.language, {
      onPartial: (text) => {
        const rms = recorder?.rms() ?? 0
        // Accept captions for normal speech; drop only tiny ambient-only blips.
        if (rms < VOICE_RMS * 0.65 && !recentlyLoud()) return
        if (rms >= VOICE_RMS) noteLoudSpeech()
        browserSttGotResult = true
        set({ partialTranscript: text })
        turnDetector?.markSpeech(80)
        clearSttEndTimer()

        // In wake mode, only commit a turn once the wake word is heard.
        if (get().awaitingWakeWord && matchWakeWord(text).heard) {
          clearSttEndTimer()
          sttEndTimer = window.setTimeout(() => {
            sttEndTimer = null
            if (get().state === 'LISTENING') void get().stopHold()
          }, settleMs)
        }
      },
      onSpeechActivity: () => {
        const rms = recorder?.rms() ?? 0
        if (rms < VOICE_RMS * 0.65 && !recentlyLoud()) return
        if (rms >= VOICE_RMS) noteLoudSpeech()
        turnDetector?.markSpeech(80)
        clearSttEndTimer()
      },
      onUtteranceFinal: (text) => {
        if (!recentlyLoud() && !get().partialTranscript.trim()) return
        browserSttGotResult = true
        // Wake mode: ignore finals that never said the wake word.
        if (get().awaitingWakeWord && !matchWakeWord(text || get().partialTranscript).heard) {
          set({ partialTranscript: '' })
          return
        }
        clearSttEndTimer()
        sttEndTimer = window.setTimeout(() => {
          sttEndTimer = null
          if (get().state === 'LISTENING') void get().stopHold()
        }, settleMs)
      },
      onUnavailable: () => {
        browserStt?.abort()
        browserStt = null
        browserSttGotResult = false
      }
    })
    if (!started) {
      browserStt = null
      browserSttGotResult = false
    }
  }

  async function listenAgainIfSession(epoch: number, afterReply = false): Promise<void> {
    if (epoch !== sessionEpoch) return
    if (!get().sessionActive) return
    if (afterReply && !get().settings.voice.autoListen) {
      set({ sessionActive: false })
      return
    }
    if (get().state !== 'IDLE') return
    await get().startHold()
  }

  function abortListenCapture(): void {
    stopLevelLoop()
    recorder?.cleanup()
    recorder = null
    browserStt?.abort()
    browserStt = null
  }

  async function maybeCopyReply(text: string): Promise<void> {
    if (!get().settings.privacy.autoCopyResponses || !text.trim()) return
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // Clipboard write is best-effort after a completed turn.
    }
  }

  async function completeTextTurn(text: string, epoch: number): Promise<void> {
    if (epoch !== sessionEpoch) return
    const { settings, active } = get()
    // Show the question right away instead of after the whole turn finishes.
    const now = new Date().toISOString()
    const pending: VoiceMessage = {
      id: `pending-${Date.now()}`,
      conversationId: active?.id ?? 'pending',
      role: 'user',
      content: text,
      timestamp: now
    }
    set({
      awaitingWakeWord: false,
      partialTranscript: text,
      state: 'THINKING',
      busy: true,
      error: null,
      active: active
        ? { ...active, messages: [...active.messages, pending] }
        : { id: 'pending', title: 'New conversation', messages: [pending], createdAt: now, updatedAt: now }
    })
    const turn = await window.electronAPI.voice.processTurn(active?.id ?? null, {
      text,
      provider: settings.stt.provider,
      language: settings.stt.language
    })
    if (epoch !== sessionEpoch) return
    if (!turn.success || !turn.data) {
      // The engine stores the question before calling the AI; reload so it is not lost.
      if (active) void get().selectConversation(active.id)
      else {
        set({ active: null })
        void get().refreshConversations()
      }
      throw classifyProviderError(new Error(turn.error ?? 'The assistant could not respond.'))
    }
    // Refresh history in parallel with local TTS startup so this extra IPC
    // round trip does not delay the first spoken response.
    void get().selectConversation(turn.data.conversationId)
    if (epoch !== sessionEpoch) return
    const spoken = turn.data.assistantMessage.content
    set({ state: 'SPEAKING', busy: true, partialTranscript: '' })
    const speech = speechEpoch
    await maybeCopyReply(spoken)
    try {
      if (epoch !== sessionEpoch) return
      if (speech === speechEpoch) await speakReply(spoken, settings, () => set({ busy: false }))
    } catch (error) {
      const detail = error instanceof Error ? error.message : ''
      toast.error(
        detail
          ? `Could not play the spoken response: ${detail}`
          : voiceUserError('tts-playback-failed').message,
        { id: VOICE_TOAST_ID }
      )
    }
    if (epoch !== sessionEpoch) return
    await window.electronAPI.voice.finishSpeaking()
    if (epoch !== sessionEpoch) return
    set({
      state: 'IDLE',
      busy: false,
      partialTranscript: '',
      audioBands: [],
      awaitingWakeWord: settings.voice.wakeWordEnabled !== false
    })
    await listenAgainIfSession(epoch, true)
  }

  return {
    state: 'IDLE',
    settings: DEFAULT_VOICE_ASSISTANT_SETTINGS,
    conversations: [],
    active: null,
    partialTranscript: '',
    error: null,
    pendingConfirmation: null,
    cloudProcessing: false,
    microphones: [],
    busy: false,
    settingsOpen: false,
    searchQuery: '',
    sessionActive: false,
    awaitingWakeWord: true,
    audioLevel: 0,
    audioBands: [],

    load: async () => {
      const voice = (await waitForDesktopApi())?.voice
      if (!voice) return

      if (!eventUnsub) {
        // The renderer drives the visible state and reports errors from the awaiting call.
        // Mirroring engine state/errors here raced with that flow (a late engine
        // "SPEAKING" after Stop) and announced every failure twice.
        eventUnsub = voice.onEvent((event) => {
          if (typeof event.cloudProcessing === 'boolean')
            set({ cloudProcessing: event.cloudProcessing })
          if (event.confirmation) set({ pendingConfirmation: event.confirmation })
        })
      }

      const [settingsRes, listRes, statusRes] = await Promise.all([
        voice.getSettings(),
        voice.listConversations(),
        voice.getStatus()
      ])
      if (settingsRes.success && settingsRes.data) set({ settings: settingsRes.data })
      if (listRes.success && listRes.data) set({ conversations: listRes.data })
      if (statusRes.success && statusRes.data) {
        set({
          state: statusRes.data.state,
          cloudProcessing: statusRes.data.cloudProcessing
        })
      }
      try {
        const mics = await listMicrophones()
        set({ microphones: mics })
      } catch {
        set({ microphones: [] })
      }
    },

    leave: async () => {
      await get().endSession()
    },

    refreshConversations: async () => {
      const res = await window.electronAPI.voice.listConversations()
      if (res.success && res.data) set({ conversations: res.data })
    },

    selectConversation: async (id) => {
      const res = await window.electronAPI.voice.getConversation(id)
      if (!res.success || !res.data) return
      set({ active: res.data })
      await get().refreshConversations()
    },

    newConversation: async () => {
      await get().endSession()
      const empty = get().conversations.find((item) => !item.preview)
      if (empty) {
        await get().selectConversation(empty.id)
        return
      }
      const res = await window.electronAPI.voice.createConversation()
      if (!res.success || !res.data) {
        toast.error(res.error ?? 'Could not create a conversation')
        return
      }
      set({ active: res.data, partialTranscript: '' })
      await get().refreshConversations()
    },

    renameConversation: async (id, title) => {
      const res = await window.electronAPI.voice.renameConversation(id, title)
      if (!res.success) {
        toast.error(res.error ?? 'Could not rename')
        return
      }
      await get().refreshConversations()
      if (get().active?.id === id && res.data) set({ active: res.data })
    },

    deleteConversation: async (id) => {
      if (get().active?.id === id) await get().endSession()
      const wasActive = get().active?.id === id
      const res = await window.electronAPI.voice.deleteConversation(id)
      if (!res.success) {
        toast.error(res.error ?? 'Could not delete conversation')
        return
      }
      await get().refreshConversations()
      if (wasActive) {
        const next = get().conversations[0]
        if (next) await get().selectConversation(next.id)
        else set({ active: null, partialTranscript: '' })
      }
      toast.success('Conversation deleted')
    },

    search: async (query) => {
      set({ searchQuery: query })
      const res = await window.electronAPI.voice.searchConversations(query)
      if (res.success && res.data) set({ conversations: res.data })
    },

    updateSettings: async (patch) => {
      const res = await window.electronAPI.voice.updateSettings(patch)
      if (!res.success || !res.data) {
        toast.error(res.error ?? 'Could not save settings')
        return
      }
      set({ settings: res.data })
      if (patch.voice?.wakeWordEnabled !== undefined) {
        set({ awaitingWakeWord: res.data.voice.wakeWordEnabled !== false && get().sessionActive })
      }
      // Hiding Tess also stops it — a hidden assistant must never keep the mic open.
      if (res.data.voice.showFloatingIcon === false && get().sessionActive) {
        void get().endSession()
      }
    },

    startSession: async () => {
      // Already running or starting — avoid a second start that cancels the first listen.
      if (get().sessionActive || holdInFlight) return
      const setupError = await sttSetupError(get().settings)
      if (setupError) {
        set({ error: setupError, state: 'IDLE' })
        showVoiceError(setupError)
        return
      }
      sessionEpoch += 1
      set({
        sessionActive: true,
        awaitingWakeWord: get().settings.voice.wakeWordEnabled !== false,
        error: null,
        partialTranscript: ''
      })
      // Start listening right away — say the wake word to talk (no long greeting delay).
      await get().startHold()
    },

    endSession: async () => {
      sessionEpoch += 1
      speechEpoch += 1
      // Tear down mic/STT first so background listening cannot continue.
      stopLevelLoop()
      recorder?.cleanup()
      recorder = null
      browserStt?.abort()
      browserStt = null
      stopSystemSpeech()
      set({
        sessionActive: false,
        awaitingWakeWord: true,
        state: 'IDLE',
        busy: false,
        partialTranscript: '',
        audioLevel: 0,
        audioBands: [],
        pendingConfirmation: null
      })
      await window.electronAPI?.voice?.cancel?.().catch(() => undefined)
    },

    startHold: async (manual = false) => {
      if (manual && !get().sessionActive && get().state === 'IDLE') {
        const setupError = await sttSetupError(get().settings)
        if (setupError) {
          set({ error: setupError })
          showVoiceError(setupError)
          return
        }
      }
      if (manual) set({ awaitingWakeWord: false })
      const { state, settings, busy, sessionActive } = get()
      if (state === 'LISTENING') return
      if (busy || holdInFlight) return
      if (state === 'PROCESSING' || state === 'THINKING') return

      if (state === 'SPEAKING' && (manual || settings.voice.interruptAssistant || sessionActive)) {
        // Barge-in: invalidate the speaking turn so its completion cannot reset this listen.
        sessionEpoch += 1
        speechEpoch += 1
        stopSystemSpeech()
      } else if (state === 'SPEAKING') {
        return
      }

      holdInFlight = true
      const epoch = sessionEpoch
      let capture: AudioRecorder | null = null
      try {
        await window.electronAPI?.voice?.stopSpeech?.().catch(() => undefined)
        if (epoch !== sessionEpoch) return
        stopSystemSpeech()
        set({
          busy: true,
          error: null,
          // Keep captions empty so the ready prompt cannot false-trigger the wake word.
          partialTranscript: '',
          audioLevel: 0
        })
        if (!window.electronAPI?.voice) {
          for (let i = 0; i < 20 && !window.electronAPI?.voice; i++) {
            await new Promise((resolve) => window.setTimeout(resolve, 50))
          }
        }
        if (!window.electronAPI?.voice) {
          throw voiceUserError('recording-failed')
        }
        if (epoch !== sessionEpoch) return
        const listening = await window.electronAPI.voice.startListening()
        if (epoch !== sessionEpoch) return
        if (!listening.success) throw new Error(listening.error ?? 'Could not start listening')

        capture = new AudioRecorder()
        recorder = capture
        await capture.start(settings.stt.microphoneId || undefined, {
          noiseReduction: settings.voice.noiseReduction !== false
        })
        if (epoch !== sessionEpoch) {
          capture.cleanup()
          return
        }
        try {
          const mics = await listMicrophones()
          if (mics.length > 0) set({ microphones: mics })
        } catch {
          // labels are optional
        }

        if (epoch !== sessionEpoch) {
          capture.cleanup()
          return
        }
        set({ state: 'LISTENING', busy: false })
        startLevelLoop()
        armBrowserStt(settings)
      } catch (error) {
        capture?.cleanup()
        if (epoch !== sessionEpoch) return
        const mapped = isVoiceError(error) ? error : classifyMicError(error)
        set({
          state: 'ERROR',
          error: mapped,
          busy: false,
          sessionActive: false,
          audioLevel: 0,
          audioBands: []
        })
        showVoiceError(mapped)
        stopLevelLoop()
        recorder?.cleanup()
        recorder = null
        browserStt?.abort()
        browserStt = null
        await window.electronAPI?.voice?.cancel().catch(() => undefined)
        set({ state: 'IDLE' })
      } finally {
        holdInFlight = false
      }
    },

    stopHold: async () => {
      stopLevelLoop()
      const { busy, sessionActive, settings } = get()
      if (get().state !== 'LISTENING' || busy) return
      const epoch = sessionEpoch

      set({ busy: true, state: 'PROCESSING', audioLevel: 0 })
      try {
        let transcript: VoiceTranscript
        const live = browserStt?.stop()
        browserStt = null
        const liveText = live?.text?.trim() ?? ''

        let blob: Blob | null = null
        if (recorder) {
          const capture = recorder
          recorder = null
          blob = await capture.stop()
        }

        if (epoch !== sessionEpoch) return
        if (liveText) {
          transcript = { text: liveText, provider: 'browser', language: settings.stt.language }
        } else if (blob && blob.size >= 256) {
          const dataBase64 = await blobToBase64(blob)
          if (epoch !== sessionEpoch) return
          const res = await window.electronAPI.voice.transcribe({
            mimeType: blob.type || 'audio/webm',
            dataBase64
          })
          if (epoch !== sessionEpoch) return
          if (!res.success || !res.data) {
            throw classifySttError(new Error(res.error ?? 'Speech recognition is unavailable'))
          }
          transcript = res.data
        } else if (sessionActive) {
          // Reset out of PROCESSING so auto-listen can start a fresh mic turn.
          set({ state: 'IDLE', busy: false, partialTranscript: '', audioBands: [] })
          await listenAgainIfSession(epoch)
          return
        } else {
          throw voiceUserError('stt-empty')
        }

        const needsWake = get().awaitingWakeWord && get().settings.voice.wakeWordEnabled !== false
        // Once awake, only a leading "Tess" is stripped so words like "test" stay in the command.
        const wake = matchWakeWord(transcript.text, { leadingOnly: !needsWake })

        if (needsWake && !wake.heard) {
          // Still waiting for the wake word — ignore other speech and keep listening.
          set({ state: 'IDLE', busy: false, partialTranscript: '', audioBands: [] })
          await listenAgainIfSession(epoch)
          return
        }

        if (wake.heard && !wake.command) {
          // Wake word only — acknowledge like "Ok Google", then take the next command.
          set({
            awaitingWakeWord: false,
            state: 'SPEAKING',
            busy: true,
            partialTranscript: WAKE_ACK
          })
          try {
            if (epoch === sessionEpoch && get().sessionActive) {
              await speakReply(WAKE_ACK, settings, () => set({ busy: false }))
            }
          } catch {
            // Acknowledgement is best-effort.
          }
          if (epoch !== sessionEpoch) return
          await window.electronAPI.voice.finishSpeaking().catch(() => undefined)
          if (epoch !== sessionEpoch) return
          set({ state: 'IDLE', busy: false, partialTranscript: '', audioBands: [] })
          await listenAgainIfSession(epoch)
          return
        }

        const commandText = wake.heard ? wake.command : transcript.text.trim()
        if (!commandText) {
          set({ state: 'IDLE', busy: false, partialTranscript: '', audioBands: [] })
          await listenAgainIfSession(epoch)
          return
        }

        transcript = { ...transcript, text: commandText }
        await completeTextTurn(commandText, epoch)
      } catch (error) {
        if (epoch !== sessionEpoch) return
        stopLevelLoop()
        recorder?.cleanup()
        recorder = null
        browserStt?.abort()
        browserStt = null
        const mapped = isVoiceError(error) ? error : voiceUserError('unknown')
        if (get().sessionActive && SESSION_RECOVERABLE.has(mapped.code)) {
          // Transient failure: tell the user and keep the hands-free session listening.
          if (mapped.code !== 'stt-empty') showVoiceError(mapped)
          set({ error: null, state: 'IDLE', busy: false, partialTranscript: '', audioBands: [] })
          await listenAgainIfSession(epoch)
          return
        }
        set({ state: 'ERROR', error: mapped, busy: false, sessionActive: false, audioBands: [] })
        showVoiceError(mapped)
        await window.electronAPI.voice.cancel().catch(() => undefined)
        set({ state: 'IDLE' })
      }
    },

    toggleTalk: async () => {
      if (get().sessionActive) await get().endSession()
      else await get().startSession()
    },

    cancel: async () => {
      await get().endSession()
    },

    stopSpeech: async () => {
      const epoch = ++sessionEpoch
      speechEpoch += 1
      stopSystemSpeech()
      await window.electronAPI.voice.stopSpeech().catch(() => undefined)
      if (epoch !== sessionEpoch) return
      set({
        state: 'IDLE',
        busy: false,
        partialTranscript: '',
        awaitingWakeWord: get().settings.voice.wakeWordEnabled !== false
      })
      // Stopping the answer should not leave a hands-free session deaf.
      await listenAgainIfSession(epoch)
    },

    replayLast: async () => {
      if (get().busy || get().state === 'THINKING' || get().state === 'PROCESSING') return
      const last = [...(get().active?.messages ?? [])]
        .reverse()
        .find((message) => message.role === 'assistant')
      if (!last?.content.trim()) return
      const epoch = ++sessionEpoch
      speechEpoch += 1
      abortListenCapture()
      stopSystemSpeech()
      set({ state: 'SPEAKING', busy: true, error: null })
      try {
        await speakReply(last.content, get().settings, () => set({ busy: false }))
      } catch (error) {
        const detail = error instanceof Error ? error.message : ''
        toast.error(
          detail
            ? `Could not play the spoken response: ${detail}`
            : voiceUserError('tts-playback-failed').message,
          { id: VOICE_TOAST_ID }
        )
      } finally {
        if (epoch === sessionEpoch) {
          await window.electronAPI.voice.finishSpeaking()
          if (epoch === sessionEpoch) {
            set({ state: 'IDLE' })
            await listenAgainIfSession(epoch, true)
          }
        }
      }
    },

    ask: async (text) => {
      const command = text.trim()
      if (!command || get().busy || holdInFlight) return
      const epoch = ++sessionEpoch
      speechEpoch += 1
      abortListenCapture()
      stopSystemSpeech()
      set({ busy: true })
      try {
        await window.electronAPI.voice.stopSpeech()
        if (epoch !== sessionEpoch) return
        await completeTextTurn(command, epoch)
      } catch (error) {
        if (epoch !== sessionEpoch) return
        const mapped = isVoiceError(error) ? error : voiceUserError('unknown')
        showVoiceError(mapped)
        if (get().sessionActive && SESSION_RECOVERABLE.has(mapped.code)) {
          set({ error: null, state: 'IDLE', busy: false, partialTranscript: '', audioBands: [] })
          await listenAgainIfSession(epoch)
          return
        }
        set({ state: 'ERROR', error: mapped, busy: false, sessionActive: false, audioBands: [] })
        await window.electronAPI.voice.cancel().catch(() => undefined)
        set({ state: 'IDLE' })
      }
    },

    confirmTool: async (approved) => {
      const pending = get().pendingConfirmation
      if (!pending) return
      await window.electronAPI.voice.confirmTool(pending.requestId, approved)
      set({ pendingConfirmation: null })
    },

    clearData: async () => {
      await get().endSession()
      const res = await window.electronAPI.voice.clearData()
      if (!res.success) {
        toast.error(res.error ?? 'Could not clear data')
        return
      }
      set({ conversations: [], active: null, partialTranscript: '' })
      toast.success('Local voice data deleted')
    },

    setSettingsOpen: (open) => set({ settingsOpen: open }),

    greet: async () => {
      const { settings, state } = get()
      if (state !== 'IDLE' && state !== 'ERROR' && state !== 'LISTENING') return
      set({ state: 'SPEAKING', partialTranscript: GREETING })
      try {
        if (!get().sessionActive) return
        await speakReply(GREETING, settings)
      } catch {
        // Greeting is best-effort; the on-screen prompt still shows.
      } finally {
        if (get().state === 'SPEAKING' && get().sessionActive) {
          set({ state: 'IDLE', partialTranscript: READY_LINE })
        }
      }
    }
  }
})

/** Reads text aloud with the configured Tess voice. Cancels anything already speaking. */
export async function speakAloud(text: string, onStarted?: () => void): Promise<void> {
  speechEpoch += 1
  stopSystemSpeech()
  await window.electronAPI?.voice?.stopSpeech?.().catch(() => undefined)
  await speakReply(text, useVoiceAssistantStore.getState().settings, onStarted)
}

/** Stops read-aloud playback started with `speakAloud`. */
export function stopSpeaking(): void {
  speechEpoch += 1
  stopSystemSpeech()
  void window.electronAPI?.voice?.stopSpeech?.().catch(() => undefined)
}

/** Reports a missing speech model before the microphone opens (null when ready). */
export function voiceInputSetupError(): Promise<VoiceUserError | null> {
  return sttSetupError(useVoiceAssistantStore.getState().settings)
}

export { VOICE_STATE_LABELS, ASSISTANT_NAME }
