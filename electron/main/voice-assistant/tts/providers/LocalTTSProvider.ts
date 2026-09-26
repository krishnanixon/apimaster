import type { TTSProvider, TTSSpeakResult } from '../TTSProvider'

/** Placeholder for on-device TTS (e.g. Piper). */
export class LocalTTSProvider implements TTSProvider {
  readonly id = 'local' as const

  async speak(_text: string): Promise<TTSSpeakResult> {
    throw new Error(
      'Local TTS is not installed in this build. Switch TTS to System or OpenAI in Voice Assistant settings.'
    )
  }

  stop(): void {}
}

export const localTTSProvider = new LocalTTSProvider()
