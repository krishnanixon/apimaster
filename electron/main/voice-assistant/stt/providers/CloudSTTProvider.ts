import OpenAI from 'openai'
import { apiKeyService } from '../../../infra/api-key.service'
import type { VoiceAudioPayload, VoiceTranscript } from '@shared/types/voice-assistant'
import type { STTProvider } from '../STTProvider'

function extensionForMime(mimeType: string): string {
  if (mimeType.includes('wav')) return 'wav'
  if (mimeType.includes('mpeg') || mimeType.includes('mp3')) return 'mp3'
  if (mimeType.includes('mp4') || mimeType.includes('m4a')) return 'm4a'
  if (mimeType.includes('ogg')) return 'ogg'
  return 'webm'
}

export class CloudSTTProvider implements STTProvider {
  readonly id = 'openai-whisper' as const

  async transcribe(
    audio: VoiceAudioPayload,
    options: { language?: string; signal?: AbortSignal }
  ): Promise<VoiceTranscript> {
    const apiKey = apiKeyService.getApiKey()
    if (!apiKey) {
      throw new Error('OpenAI API key not configured. Add it in Settings → AI.')
    }

    const buffer = Buffer.from(audio.dataBase64, 'base64')
    if (buffer.byteLength === 0) {
      throw new Error('Empty audio buffer')
    }

    const client = new OpenAI({ apiKey })
    const file = new File([buffer], `speech.${extensionForMime(audio.mimeType)}`, {
      type: audio.mimeType || 'audio/webm'
    })

    const result = await client.audio.transcriptions.create(
      {
        file,
        model: 'whisper-1',
        language: options.language && options.language !== 'auto' ? options.language.split('-')[0] : undefined
      },
      options.signal ? { signal: options.signal } : undefined
    )

    const text = result.text?.trim() ?? ''
    if (!text) throw new Error('No speech detected')

    return {
      text,
      language: options.language,
      provider: this.id
    }
  }
}

export const cloudSTTProvider = new CloudSTTProvider()
