import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_VOICE_ASSISTANT_SETTINGS } from '@shared/types/voice-assistant'

const mocks = vi.hoisted(() => ({
  transcribe: vi.fn(),
  chat: vi.fn(),
  execute: vi.fn(),
  confirmation: vi.fn(),
  addMessage: vi.fn(),
  settings: {} as typeof DEFAULT_VOICE_ASSISTANT_SETTINGS
}))
vi.mock('electron', () => ({ BrowserWindow: class {} }))
vi.mock('../electron/main/infra/logger.service', () => ({
  logger: { info: vi.fn(), warn: vi.fn() }
}))
vi.mock('../electron/main/voice-assistant/settings.store', () => ({
  voiceSettingsStore: { get: () => mocks.settings }
}))
vi.mock('../electron/main/ai/config/ai-config.service', () => ({
  aiConfigService: { get: () => ({ mode: 'openai' }) }
}))
vi.mock('../electron/main/voice-assistant/ai/ContextManager', () => ({
  contextManager: { build: () => [] }
}))
vi.mock('../electron/main/voice-assistant/ai/AIOrchestrator', () => ({
  aiOrchestrator: { chat: mocks.chat }
}))
vi.mock('../electron/main/voice-assistant/AudioManager', () => ({
  audioManager: { decodeBase64: vi.fn() }
}))
vi.mock('../electron/main/voice-assistant/conversation.store', () => ({
  voiceConversationStore: {
    create: () => ({ id: 'c1', messages: [] }),
    get: () => ({ id: 'c1', messages: [] }),
    addMessage: mocks.addMessage
  }
}))
vi.mock('../electron/main/voice-assistant/stt/stt-registry', () => ({
  getSTTProvider: () => ({ transcribe: mocks.transcribe })
}))
vi.mock('../electron/main/voice-assistant/tts/tts-registry', () => ({
  getTTSProvider: vi.fn(),
  stopAllTTS: vi.fn()
}))
vi.mock('../electron/main/voice-assistant/tools/register-builtin', () => ({
  registerBuiltinTools: vi.fn()
}))
vi.mock('../electron/main/voice-assistant/tools/ToolExecutor', () => ({
  toolExecutor: {
    execute: mocks.execute,
    waitForConfirmation: mocks.confirmation,
    cancelAll: vi.fn()
  }
}))
vi.mock('../electron/main/voice-assistant/clipboardAssist', () => ({
  detectClipboardIntent: () => null,
  preparePasteTarget: vi.fn()
}))
vi.mock('../electron/main/voice-assistant/noteAssist', () => ({
  detectNoteIntent: () => null,
  detectNoteLookupIntent: () => null
}))
vi.mock('../electron/main/voice-assistant/world-context', () => ({
  buildVoiceWorldContext: async () => []
}))
vi.mock('../electron/main/voice-assistant/voice-db', () => ({ voiceMemoryRepository: {} }))

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  mocks.settings = structuredClone(DEFAULT_VOICE_ASSISTANT_SETTINGS)
  mocks.addMessage.mockReturnValue({ id: 'message' })
})

describe('main-process cancellation', () => {
  it('rejects a late transcription without emitting an error after Stop', async () => {
    const pending = deferred<{ text: string }>()
    mocks.transcribe.mockReturnValue(pending.promise)
    const { voiceEngine } = await import('../electron/main/voice-assistant/VoiceEngine')
    const sink = vi.fn()
    voiceEngine.setEventSink(sink)
    const request = voiceEngine.transcribe({ dataBase64: 'YQ==', mimeType: 'audio/webm' })
    const rejected = expect(request).rejects.toMatchObject({ name: 'AbortError' })
    voiceEngine.cancel()
    sink.mockClear()
    pending.resolve({ text: 'Late command' })
    await rejected
    expect(sink).not.toHaveBeenCalled()
  })

  it('does not execute tools returned by an AI response after cancellation', async () => {
    const pending = deferred<unknown>()
    mocks.chat.mockReturnValue(pending.promise)
    const { voiceEngine } = await import('../electron/main/voice-assistant/VoiceEngine')
    const request = voiceEngine.processTranscript(null, { text: 'Hello', provider: 'browser' })
    const rejected = expect(request).rejects.toMatchObject({ name: 'AbortError' })
    await vi.waitFor(() => expect(mocks.chat).toHaveBeenCalledOnce())
    voiceEngine.cancel()
    pending.resolve({ text: '', toolCalls: [{ name: 'create_note', arguments: {} }] })
    await rejected
    expect(mocks.execute).not.toHaveBeenCalled()
    expect(mocks.addMessage).toHaveBeenCalledTimes(1)
  })

  it('does not execute a confirmation that resolves after cancellation', async () => {
    const approval = deferred<boolean>()
    mocks.chat.mockResolvedValue({ text: '', toolCalls: [{ name: 'delete_file', arguments: {} }] })
    mocks.execute.mockResolvedValue({ pending: { requestId: 'approval' } })
    mocks.confirmation.mockReturnValue(approval.promise)
    const { voiceEngine } = await import('../electron/main/voice-assistant/VoiceEngine')
    const request = voiceEngine.processTranscript(null, { text: 'Hello', provider: 'browser' })
    const rejected = expect(request).rejects.toMatchObject({ name: 'AbortError' })
    await vi.waitFor(() => expect(mocks.confirmation).toHaveBeenCalledOnce())
    voiceEngine.cancel()
    approval.resolve(true)
    await rejected
    expect(mocks.execute).toHaveBeenCalledTimes(1)
  })
})
