import type { VoiceAudioPayload, VoiceSTTProviderId, VoiceTranscript } from '@shared/types/voice-assistant'

export interface STTProvider {
  readonly id: VoiceSTTProviderId
  transcribe(audio: VoiceAudioPayload, options: { language?: string; signal?: AbortSignal }): Promise<VoiceTranscript>
}
