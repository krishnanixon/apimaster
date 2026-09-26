import { getVoiceAIProvider } from './provider-registry'
import type { VoiceAIRequest, VoiceAIResponse } from './AIProvider'

export class AIOrchestrator {
  async chat(request: VoiceAIRequest): Promise<VoiceAIResponse> {
    const provider = getVoiceAIProvider(request.settings.ai.provider)
    return provider.chat(request)
  }

  async *stream(request: VoiceAIRequest) {
    const provider = getVoiceAIProvider(request.settings.ai.provider)
    if (!provider.stream) {
      const result = await provider.chat(request)
      if (result.text) yield { text: result.text }
      return
    }
    yield* provider.stream(request)
  }
}

export const aiOrchestrator = new AIOrchestrator()
