import type { VoiceTTSProviderId } from '@shared/types/voice-assistant'

export interface TTSSpeakResult {
  provider: VoiceTTSProviderId
  text: string
  audioBase64?: string
  mimeType?: string
  /** True when the main process already played the audio (native system TTS). */
  handled?: boolean
}

export interface TTSProvider {
  readonly id: VoiceTTSProviderId
  speak(
    text: string,
    options: { voice?: string; speed?: number; volume?: number; signal?: AbortSignal }
  ): Promise<TTSSpeakResult>
  stop(): void
}
