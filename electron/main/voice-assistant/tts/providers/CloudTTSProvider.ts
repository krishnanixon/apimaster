import OpenAI from 'openai'
import { apiKeyService } from '../../../infra/api-key.service'
import type { TTSProvider, TTSSpeakResult } from '../TTSProvider'

export class CloudTTSProvider implements TTSProvider {
  readonly id = 'openai' as const
  private abort: AbortController | null = null

  async speak(
    text: string,
    options: { voice?: string; speed?: number; volume?: number; signal?: AbortSignal }
  ): Promise<TTSSpeakResult> {
    const apiKey = apiKeyService.getApiKey()
    if (!apiKey) {
      throw new Error('OpenAI API key not configured. Add it in Settings → AI.')
    }

    this.stop()
    const operation = new AbortController()
    this.abort = operation
    const cancel = () => operation.abort()
    if (options.signal?.aborted) cancel()
    else options.signal?.addEventListener('abort', cancel, { once: true })
    try {
      operation.signal.throwIfAborted()

      const client = new OpenAI({ apiKey })
      const voice = (options.voice || 'nova') as
        'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer'
      const response = await client.audio.speech.create(
        {
          model: 'tts-1-hd',
          voice,
          input: text,
          speed: options.speed && options.speed > 0 ? options.speed : 1
        },
        { signal: operation.signal }
      )

      const buffer = Buffer.from(await response.arrayBuffer())
      operation.signal.throwIfAborted()
      return {
        provider: this.id,
        text,
        audioBase64: buffer.toString('base64'),
        mimeType: 'audio/mpeg'
      }
    } finally {
      options.signal?.removeEventListener('abort', cancel)
      if (this.abort === operation) this.abort = null
    }
  }

  stop(): void {
    this.abort?.abort()
    this.abort = null
  }
}

export const cloudTTSProvider = new CloudTTSProvider()
