import type { TTSProvider, TTSSpeakResult } from '../TTSProvider'
import { speakNative, stopNativeSpeech } from '../native-speak'

export class SystemTTSProvider implements TTSProvider {
  readonly id = 'system' as const

  async speak(
    text: string,
    options: { voice?: string; speed?: number; volume?: number; signal?: AbortSignal }
  ): Promise<TTSSpeakResult> {
    const spoken = text.trim()
    if (!spoken) return { provider: this.id, text: spoken }

    const abort = () => this.stop()
    options.signal?.addEventListener('abort', abort, { once: true })
    try {
      const handled = await speakNative(spoken, {
        voice: options.voice,
        speed: options.speed,
        volume: options.volume
      })
      return { provider: this.id, text: spoken, handled }
    } finally {
      options.signal?.removeEventListener('abort', abort)
    }
  }

  stop(): void {
    stopNativeSpeech()
  }
}

export const systemTTSProvider = new SystemTTSProvider()
