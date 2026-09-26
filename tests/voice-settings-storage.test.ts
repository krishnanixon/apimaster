import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { DEFAULT_VOICE_ASSISTANT_SETTINGS } from '@shared/types/voice-assistant'

const mocks = vi.hoisted(() => ({ directory: '', upsert: vi.fn().mockResolvedValue(undefined) }))
vi.mock('electron', () => ({ app: { getPath: () => mocks.directory } }))
vi.mock('../electron/main/repositories/vector-workspace.repository', () => ({
  vectorWorkspaceRepository: { saveSettings: vi.fn().mockResolvedValue(undefined) }
}))
vi.mock('../electron/main/infra/logger.service', () => ({ logger: { warn: vi.fn() } }))
vi.mock('../electron/main/voice-assistant/voice-db', () => ({
  voiceConversationDb: {
    upsert: mocks.upsert,
    remove: vi.fn(),
    clearAll: vi.fn()
  }
}))

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  mocks.directory = mkdtempSync(join(tmpdir(), 'voice-storage-test-'))
})
afterEach(() => rmSync(mocks.directory, { recursive: true, force: true }))

describe('voice settings', () => {
  it('keeps deliberately disabled hands-free settings across restarts', async () => {
    writeFileSync(
      join(mocks.directory, 'voice-assistant-settings.json'),
      JSON.stringify({
        voice: { vadEnabled: false, autoListen: false }
      })
    )
    const { voiceSettingsStore } = await import('../electron/main/voice-assistant/settings.store')
    expect(voiceSettingsStore.get().voice).toMatchObject({ vadEnabled: false, autoListen: false })
  })

  it('allows revoking trusted tools and normalizes playback/provider choices', async () => {
    const { mergeSettings } = await import('../electron/main/voice-assistant/settings.store')
    const settings = mergeSettings(DEFAULT_VOICE_ASSISTANT_SETTINGS, {
      trustedWriteTools: [],
      tts: { provider: 'local', speed: 50, volume: Number.NaN },
      stt: { provider: 'local-whisper' },
      ai: { maxTokens: -1 }
    })
    expect(settings.trustedWriteTools).toEqual([])
    expect(settings.tts).toMatchObject({ provider: 'local', speed: 2, volume: 1 })
    expect(settings.stt.provider).toBe('local-whisper')
    expect(settings.ai.maxTokens).toBe(128)
    expect(DEFAULT_VOICE_ASSISTANT_SETTINGS.tts.speed).toBe(1)
  })

  it('clears incompatible voice names when switching playback providers', async () => {
    const { mergeSettings } = await import('../electron/main/voice-assistant/settings.store')
    const settings = mergeSettings(
      {
        ...DEFAULT_VOICE_ASSISTANT_SETTINGS,
        tts: { ...DEFAULT_VOICE_ASSISTANT_SETTINGS.tts, voice: 'Samantha' }
      },
      { tts: { provider: 'openai' } }
    )
    expect(settings.tts.voice).toBe('')
  })
})

describe('conversation privacy', () => {
  it('keeps unsaved messages in memory without updating JSON or the database', async () => {
    const { voiceSettingsStore } = await import('../electron/main/voice-assistant/settings.store')
    const { voiceConversationStore: store } =
      await import('../electron/main/voice-assistant/conversation.store')
    const saved = store.create()
    store.addMessage(saved.id, 'user', 'Saved message')
    const diskBefore = readFileSync(
      join(mocks.directory, 'voice-assistant-conversations.json'),
      'utf8'
    )
    mocks.upsert.mockClear()
    voiceSettingsStore.update({ privacy: { storeConversations: false } })
    store.addMessage(saved.id, 'user', 'Private follow-up')
    const temporary = store.create()
    store.addMessage(temporary.id, 'user', 'Temporary conversation')
    expect(store.get(saved.id)?.messages).toHaveLength(2)
    expect(readFileSync(join(mocks.directory, 'voice-assistant-conversations.json'), 'utf8')).toBe(
      diskBefore
    )
    expect(mocks.upsert).not.toHaveBeenCalled()
    // Deleting another chat must not flush private content as a side effect.
    store.delete(temporary.id)
    expect(
      readFileSync(join(mocks.directory, 'voice-assistant-conversations.json'), 'utf8')
    ).not.toContain('Private follow-up')
    vi.resetModules()
    const { voiceConversationStore: reopened } =
      await import('../electron/main/voice-assistant/conversation.store')
    expect(reopened.get(saved.id)?.messages).toHaveLength(1)
    expect(reopened.get(temporary.id)).toBeNull()
  })

  it('does not persist private messages when history is re-enabled later', async () => {
    const { voiceSettingsStore } = await import('../electron/main/voice-assistant/settings.store')
    const { voiceConversationStore: store } =
      await import('../electron/main/voice-assistant/conversation.store')
    voiceSettingsStore.update({ privacy: { storeConversations: false } })
    const conversation = store.create()
    store.addMessage(conversation.id, 'user', 'Private request')

    voiceSettingsStore.update({ privacy: { storeConversations: true } })
    store.addMessage(conversation.id, 'user', 'Saved follow-up')

    const stored = readFileSync(join(mocks.directory, 'voice-assistant-conversations.json'), 'utf8')
    expect(stored).toContain('Saved follow-up')
    expect(stored).not.toContain('Private request')
  })
})
