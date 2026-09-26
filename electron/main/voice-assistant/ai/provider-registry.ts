import type { VoiceAIProviderId } from '@shared/types/voice-assistant'
import type { VoiceAIProvider } from './AIProvider'
import { workbenchAIProvider } from './providers/WorkbenchAIProvider'
import { anthropicProvider } from './providers/AnthropicProvider'

/**
 * OpenAI and Ollama both go through WorkbenchAIProvider so the orchestrator
 * never imports vendor SDKs. Anthropic is a stub until implemented.
 */
export function getVoiceAIProvider(id: VoiceAIProviderId): VoiceAIProvider {
  if (id === 'anthropic') return anthropicProvider
  return workbenchAIProvider
}
