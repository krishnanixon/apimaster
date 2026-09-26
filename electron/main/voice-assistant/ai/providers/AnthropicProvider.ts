import type { VoiceAIProvider, VoiceAIRequest, VoiceAIResponse } from '../AIProvider'

/** Placeholder until an Anthropic SDK provider is registered. */
export class AnthropicProvider implements VoiceAIProvider {
  readonly id = 'anthropic'

  async chat(_request: VoiceAIRequest): Promise<VoiceAIResponse> {
    throw new Error('Anthropic is not implemented in this build. Choose Workbench, OpenAI, or Ollama.')
  }
}

export const anthropicProvider = new AnthropicProvider()
