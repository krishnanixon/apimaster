import type { AIProviderId } from '@shared/types'
import type { AIProvider } from '../types'
import { openAIProvider } from './openai.provider'
import { ollamaProvider } from './ollama.provider'
import { anthropicProvider } from './anthropic.provider'
import { geminiProvider } from './gemini.provider'
import { deepSeekProvider, openRouterProvider } from './openai-compatible.instances'

/**
 * The single source of truth for which providers exist. To add a new provider:
 * implement `AIProvider` and add one entry here.
 */
const IMPLEMENTED: Record<string, AIProvider> = {
  [openAIProvider.id]: openAIProvider,
  [ollamaProvider.id]: ollamaProvider,
  [anthropicProvider.id]: anthropicProvider,
  [geminiProvider.id]: geminiProvider,
  [deepSeekProvider.id]: deepSeekProvider,
  [openRouterProvider.id]: openRouterProvider
}

/** Providers that have a config card in the UI but are not wired up yet. */
export const PLANNED_PROVIDERS: { id: AIProviderId; label: string }[] = [
  { id: 'azure', label: 'Azure OpenAI' },
  { id: 'groq', label: 'Groq' }
]

export function getProvider(id: AIProviderId): AIProvider | undefined {
  return IMPLEMENTED[id]
}

export function requireProvider(id: AIProviderId): AIProvider {
  const provider = getProvider(id)
  if (!provider) throw new Error(`AI provider "${id}" is not available in this build.`)
  return provider
}

export function listImplementedProviders(): AIProvider[] {
  return Object.values(IMPLEMENTED)
}

export function isImplemented(id: AIProviderId): boolean {
  return id in IMPLEMENTED
}
