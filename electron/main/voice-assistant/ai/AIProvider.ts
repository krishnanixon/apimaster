import type { VoiceContextTurn } from '@shared/lib/voice-context'
import type { VoiceAssistantSettings, VoiceToolCall } from '@shared/types/voice-assistant'

export interface VoiceAIRequest {
  messages: VoiceContextTurn[]
  settings: VoiceAssistantSettings
  signal?: AbortSignal
}

export interface VoiceAIResponse {
  text: string
  toolCalls: VoiceToolCall[]
}

export interface VoiceAIChunk {
  text: string
}

/** Voice-layer AI contract. Orchestrator talks only to this interface. */
export interface VoiceAIProvider {
  readonly id: string
  chat(request: VoiceAIRequest): Promise<VoiceAIResponse>
  stream?(request: VoiceAIRequest): AsyncIterable<VoiceAIChunk>
}
