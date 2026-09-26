import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import {
  DEFAULT_VOICE_ASSISTANT_SETTINGS,
  type VoiceAssistantSettings,
  type VoiceAssistantSettingsPatch
} from '@shared/types/voice-assistant'
import { vectorWorkspaceRepository } from '../repositories/vector-workspace.repository'
import { logger } from '../infra/logger.service'

const FILE_NAME = 'voice-assistant-settings.json'

function settingsPath(): string {
  return join(app.getPath('userData'), FILE_NAME)
}

export function mergeSettings(
  base: VoiceAssistantSettings,
  patch: VoiceAssistantSettingsPatch
): VoiceAssistantSettings {
  const trusted = Array.from(new Set(patch.trustedWriteTools ?? base.trustedWriteTools ?? []))
  const merged: VoiceAssistantSettings = {
    ai: { ...base.ai, ...patch.ai },
    stt: { ...base.stt, ...patch.stt },
    tts: { ...base.tts, ...patch.tts },
    voice: { ...base.voice, ...patch.voice },
    privacy: { ...base.privacy, ...patch.privacy },
    rag: { ...base.rag, ...patch.rag },
    memory: { ...base.memory, ...patch.memory },
    trustedWriteTools: trusted
  }
  const clamp = (value: number, fallback: number, min: number, max: number) =>
    Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback
  merged.tts.speed = clamp(merged.tts.speed, 1, 0.5, 2)
  merged.tts.volume = clamp(merged.tts.volume, 1, 0, 1)
  merged.voice.silenceTimeoutMs = clamp(merged.voice.silenceTimeoutMs, 900, 500, 4000)
  merged.ai.temperature = clamp(merged.ai.temperature, 0.7, 0, 1)
  merged.ai.maxTokens = Math.round(clamp(merged.ai.maxTokens, 1024, 128, 4096))
  if (!['browser', 'openai-whisper', 'local-whisper'].includes(merged.stt.provider)) merged.stt.provider = 'local-whisper'
  if (!['system', 'openai', 'local'].includes(merged.tts.provider)) merged.tts.provider = 'local'
  if (!['workbench', 'openai', 'ollama'].includes(merged.ai.provider))
    merged.ai.provider = 'workbench'
  if (
    patch.tts?.provider &&
    patch.tts.provider !== base.tts.provider &&
    patch.tts.voice === undefined
  ) {
    merged.tts.voice = ''
  }
  return merged
}

class VoiceSettingsStore {
  private cached: VoiceAssistantSettings | null = null

  get(): VoiceAssistantSettings {
    if (this.cached) return this.cached
    const path = settingsPath()
    if (!existsSync(path)) {
      this.cached = structuredClone(DEFAULT_VOICE_ASSISTANT_SETTINGS)
      return this.cached
    }
    try {
      const parsed = JSON.parse(readFileSync(path, 'utf-8')) as VoiceAssistantSettingsPatch
      this.cached = mergeSettings(DEFAULT_VOICE_ASSISTANT_SETTINGS, parsed)
      return this.cached
    } catch {
      this.cached = structuredClone(DEFAULT_VOICE_ASSISTANT_SETTINGS)
      return this.cached
    }
  }

  update(patch: VoiceAssistantSettingsPatch): VoiceAssistantSettings {
    const next = mergeSettings(this.get(), patch)
    this.persist(next)
    this.cached = next
    if (patch.rag && typeof patch.rag.enabled === 'boolean') {
      void vectorWorkspaceRepository
        .saveSettings({ ragEnabled: patch.rag.enabled })
        .catch((error) => {
          logger.warn(
            `Could not link Vector DB RAG: ${error instanceof Error ? error.message : String(error)}`,
            'Voice'
          )
        })
    }
    return next
  }

  reset(): VoiceAssistantSettings {
    this.cached = structuredClone(DEFAULT_VOICE_ASSISTANT_SETTINGS)
    this.persist(this.cached)
    return this.cached
  }

  private persist(settings: VoiceAssistantSettings): void {
    const dir = app.getPath('userData')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    writeFileSync(settingsPath(), JSON.stringify(settings, null, 2), 'utf-8')
  }
}

export const voiceSettingsStore = new VoiceSettingsStore()
