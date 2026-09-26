import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_VOICE_ASSISTANT_SETTINGS } from '@shared/types/voice-assistant'

const mocks = vi.hoisted(() => ({
  start: vi.fn(),
  stop: vi.fn(),
  cleanup: vi.fn(),
  speak: vi.fn(),
  stopSpeech: vi.fn(),
  toast: vi.fn()
}))
vi.mock('sonner', () => ({ toast: { error: mocks.toast, success: vi.fn() } }))
vi.mock('@/modules/voice-assistant/core/audioRecorder', () => ({
  AudioRecorder: class {
    start = mocks.start
    stop = mocks.stop
    cleanup = mocks.cleanup
    rms = () => 0
    bands = () => []
  },
  listMicrophones: async () => [],
  blobToBase64: async () => 'YXVkaW8='
}))
vi.mock('@/modules/voice-assistant/core/webSpeechStt', () => ({
  isBrowserSttAvailable: () => false
}))
vi.mock('@/modules/voice-assistant/core/systemTts', () => ({
  speakWithSystemTts: mocks.speak,
  stopSystemSpeech: mocks.stopSpeech,
  playAudioBase64: vi.fn()
}))

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
const success = (data?: unknown) => ({ success: true, data })
const conversation = { id: 'c1', title: 'Test', messages: [], createdAt: '', updatedAt: '' }
const turn = { conversationId: 'c1', assistantMessage: { content: 'Hello' } }
let store: typeof import('@/modules/voice-assistant/stores/voice.store').useVoiceAssistantStore
let api: Record<string, ReturnType<typeof vi.fn>>

beforeEach(async () => {
  vi.resetModules()
  vi.clearAllMocks()
  mocks.start.mockResolvedValue(undefined)
  mocks.stop.mockResolvedValue(new Blob(['x'.repeat(300)], { type: 'audio/webm' }))
  mocks.speak.mockResolvedValue(undefined)
  api = {
    startListening: vi.fn().mockResolvedValue(success('LISTENING')),
    stopSpeech: vi.fn().mockResolvedValue(success()),
    cancel: vi.fn().mockResolvedValue(success()),
    transcribe: vi.fn().mockResolvedValue(success({ text: 'Hello', provider: 'openai-whisper' })),
    processTurn: vi.fn().mockResolvedValue(success(turn)),
    getConversation: vi.fn().mockResolvedValue(success(conversation)),
    listConversations: vi.fn().mockResolvedValue(success([])),
    finishSpeaking: vi.fn().mockResolvedValue(success())
  }
  vi.stubGlobal('window', {
    electronAPI: { voice: api },
    setTimeout,
    clearTimeout,
    requestAnimationFrame: vi.fn().mockReturnValue(1),
    cancelAnimationFrame: vi.fn()
  })
  store = (await import('@/modules/voice-assistant/stores/voice.store')).useVoiceAssistantStore
  store.setState({ settings: structuredClone(DEFAULT_VOICE_ASSISTANT_SETTINGS) })
})
afterEach(() => vi.unstubAllGlobals())

describe('voice session lifecycle', () => {
  it('reports a missing Whisper model before opening the microphone', async () => {
    api.getModelStatus = vi.fn().mockResolvedValue(
      success([
        { id: 'whisper-base.en', label: 'Whisper base.en', sizeBytes: 1, installed: false, engineReady: true, downloading: false, progress: null, path: '' }
      ])
    )
    await store.getState().startSession()
    expect(mocks.start).not.toHaveBeenCalled()
    expect(store.getState().error?.code).toBe('stt-unavailable')
    expect(store.getState().sessionActive).toBe(false)
  })

  it('does not reopen the microphone when permission resolves after Stop', async () => {
    const capture = deferred<void>()
    mocks.start.mockReturnValue(capture.promise)
    const starting = store.getState().startSession()
    await vi.waitFor(() => expect(mocks.start).toHaveBeenCalledOnce())
    await store.getState().endSession()
    capture.resolve()
    await starting
    expect(store.getState()).toMatchObject({ state: 'IDLE', sessionActive: false, busy: false })
    expect(mocks.cleanup).toHaveBeenCalled()
    expect(window.requestAnimationFrame).not.toHaveBeenCalled()
  })

  it('does not send cancelled transcription to the AI', async () => {
    const transcription = deferred<unknown>()
    api.transcribe.mockReturnValue(transcription.promise)
    await store.getState().startHold(true)
    const stopping = store.getState().stopHold()
    await vi.waitFor(() => expect(api.transcribe).toHaveBeenCalledOnce())
    await store.getState().endSession()
    transcription.resolve(success({ text: 'Tess save this note', provider: 'openai-whisper' }))
    await stopping
    expect(api.processTurn).not.toHaveBeenCalled()
    expect(store.getState().state).toBe('IDLE')
  })

  it('ignores a late AI reply after cancellation', async () => {
    const reply = deferred<unknown>()
    api.processTurn.mockReturnValue(reply.promise)
    const asking = store.getState().ask('Hello')
    await vi.waitFor(() => expect(api.processTurn).toHaveBeenCalledOnce())
    await store.getState().cancel()
    reply.resolve(success(turn))
    await asking
    expect(mocks.speak).not.toHaveBeenCalled()
    expect(api.getConversation).not.toHaveBeenCalled()
    expect(store.getState()).toMatchObject({ state: 'IDLE', sessionActive: false })
  })

  it('blocks overlapping typed requests', async () => {
    const reply = deferred<unknown>()
    api.processTurn.mockReturnValue(reply.promise)
    const first = store.getState().ask('One')
    await store.getState().ask('Two')
    await vi.waitFor(() => expect(api.processTurn).toHaveBeenCalledOnce())
    reply.resolve(success(turn))
    await first
    expect(mocks.speak).toHaveBeenCalledOnce()
  })

  it('push-to-talk accepts a command without the wake word', async () => {
    await store.getState().startHold(true)
    await store.getState().stopHold()
    expect(api.processTurn).toHaveBeenCalledWith(null, expect.objectContaining({ text: 'Hello' }))
    expect(store.getState()).toMatchObject({ state: 'IDLE', busy: false })
  })

  it('does not create a second recorder while already listening', async () => {
    await store.getState().startHold()
    await store.getState().startHold(true)
    expect(mocks.start).toHaveBeenCalledOnce()
    expect(store.getState().awaitingWakeWord).toBe(false)
  })

  it('surfaces missing speech API keys instead of silently retrying forever', async () => {
    api.transcribe.mockResolvedValue({ success: false, error: 'OpenAI API key not configured' })
    await store.getState().startSession()
    await store.getState().stopHold()
    expect(store.getState().error?.code).toBe('stt-invalid-key')
    expect(store.getState().sessionActive).toBe(false)
    expect(mocks.start).toHaveBeenCalledOnce()
  })

  it('Stop speaking resumes listening once, not again from the old playback', async () => {
    const playback = deferred<void>()
    mocks.speak.mockReturnValue(playback.promise)
    store.setState({ sessionActive: true })
    const asking = store.getState().ask('Hello')
    await vi.waitFor(() => expect(mocks.speak).toHaveBeenCalledOnce())
    await store.getState().stopSpeech()
    playback.resolve()
    await asking
    expect(mocks.start).toHaveBeenCalledOnce()
    expect(store.getState()).toMatchObject({ state: 'LISTENING', sessionActive: true })
  })

  it('Stop speaking outside a session just goes idle', async () => {
    const playback = deferred<void>()
    mocks.speak.mockReturnValue(playback.promise)
    const asking = store.getState().ask('Hello')
    await vi.waitFor(() => expect(mocks.speak).toHaveBeenCalledOnce())
    await store.getState().stopSpeech()
    playback.resolve()
    await asking
    expect(mocks.start).not.toHaveBeenCalled()
    expect(store.getState().state).toBe('IDLE')
  })

  it('keeps a hands-free session alive after a transient AI failure', async () => {
    api.processTurn.mockResolvedValue({ success: false, error: 'Request timed out' })
    await store.getState().startSession()
    api.transcribe.mockResolvedValue(success({ text: 'Tess what time is it', provider: 'openai-whisper' }))
    await store.getState().stopHold()
    expect(mocks.toast).toHaveBeenCalledOnce()
    expect(store.getState()).toMatchObject({ sessionActive: true, state: 'LISTENING', error: null })
  })

  it('keeps words like "test" inside an awake command', async () => {
    api.transcribe.mockResolvedValue(success({ text: 'write a test for login', provider: 'openai-whisper' }))
    await store.getState().startHold(true)
    await store.getState().stopHold()
    expect(api.processTurn).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ text: 'write a test for login' })
    )
  })

  it('continues after a wake-only utterance even with automatic follow-ups off', async () => {
    store.setState({
      settings: {
        ...store.getState().settings,
        voice: {
          ...store.getState().settings.voice,
          autoListen: false
        }
      }
    })
    api.transcribe.mockResolvedValue(success({ text: 'Hey Tess', provider: 'openai-whisper' }))
    await store.getState().startSession()
    await store.getState().stopHold()
    expect(mocks.start).toHaveBeenCalledTimes(2)
    expect(store.getState()).toMatchObject({ state: 'LISTENING', awaitingWakeWord: false })
  })
})
