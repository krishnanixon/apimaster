import { existsSync } from 'fs'
import { ASSISTANT_NAME } from '@shared/constants/product'
import type { VoiceAudioPayload, VoiceTranscript } from '@shared/types/voice-assistant'
import type { STTProvider } from '../STTProvider'
import { voiceModelManager } from '../../model-manager'
import { voiceSettingsStore } from '../../settings.store'
import { logger } from '../../../infra/logger.service'
import { whisperExecutablePath } from '../whisper-engine'
import { transcribeWithWhisperCli } from '../whisper-cli'

type WhisperModel = 'base.en' | 'small'

/**
 * Uses the selected Whisper model, or another installed one when the selection was never
 * downloaded (e.g. "small" installed while settings still say "base.en"). The corrected
 * choice is saved so settings and the UI match what actually runs.
 */
export function resolveInstalledWhisperModel(): WhisperModel | null {
  const selected = voiceSettingsStore.get().stt.model ?? 'base.en'
  if (existsSync(voiceModelManager.whisperPath(selected))) return selected
  const fallback = (['base.en', 'small'] as const).find((model) =>
    existsSync(voiceModelManager.whisperPath(model))
  )
  if (!fallback) return null
  logger.warn(`Whisper ${selected} is not installed; using ${fallback} instead`, 'Voice')
  voiceSettingsStore.update({ stt: { model: fallback } })
  return fallback
}

export class LocalWhisperProvider implements STTProvider {
  readonly id = 'local-whisper' as const

  async transcribe(
    audio: VoiceAudioPayload,
    options: { language?: string; signal?: AbortSignal }
  ): Promise<VoiceTranscript> {
    options.signal?.throwIfAborted()
    const model = resolveInstalledWhisperModel()
    if (!model) {
      throw new Error(
        'No Whisper model is installed. Open Voice settings and download Whisper base.en to use local speech recognition.'
      )
    }
    const executable = whisperExecutablePath()
    if (!executable) {
      throw new Error(
        'The local Whisper engine is not set up. Click Download next to Whisper in Voice settings to finish setup.'
      )
    }

    const extension = audio.mimeType.includes('wav')
      ? 'wav'
      : audio.mimeType.includes('ogg')
        ? 'ogg'
        : audio.mimeType.includes('mp4')
          ? 'm4a'
          : 'webm'
    // English-only models cannot transcribe other languages.
    const language = model === 'base.en' ? 'en' : options.language?.split('-')[0] || 'auto'
    const text = await transcribeWithWhisperCli({
      audio: Buffer.from(audio.dataBase64, 'base64'),
      extension,
      executable,
      modelPath: voiceModelManager.whisperPath(model),
      language,
      prompt: `${ASSISTANT_NAME}.`,
      signal: options.signal
    })
    options.signal?.throwIfAborted()
    if (!text || /^[\s.,!?-]*$/.test(text)) throw new Error('No speech detected')
    return { text, language: options.language, provider: this.id }
  }
}

export const localWhisperProvider = new LocalWhisperProvider()
