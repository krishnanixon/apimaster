import type {
  AIProviderConfig,
  AIProviderConfigPatch,
  AIProviderId,
  AIRequestType,
  CloudProviderId
} from '../types/ai'
import {
  DEFAULT_AI_MODEL,
  DEFAULT_ANTHROPIC_MODEL,
  DEFAULT_DEEPSEEK_MODEL,
  DEFAULT_GEMINI_MODEL,
  DEFAULT_OPENROUTER_MODEL
} from './ai-models'

export const CLOUD_PROVIDER_IDS: CloudProviderId[] = [
  'openai',
  'anthropic',
  'gemini',
  'deepseek',
  'openrouter'
]

export type { CloudProviderId }

const LOCAL_FRIENDLY: ReadonlySet<AIRequestType> = new Set([
  'TITLE',
  'SUMMARIZATION',
  'GRAMMAR',
  'FORMATTING',
  'CLEANUP',
  'KEYWORDS',
  'CODE_REVIEW',
  'UI_DESIGN'
])

const HYBRID_LARGE_PROMPT_CHARS = 8000

export function isCloudProviderId(id: AIProviderId): id is CloudProviderId {
  return (CLOUD_PROVIDER_IDS as readonly string[]).includes(id)
}

export function normalizeCloudProvider(id: AIProviderId | undefined | null): CloudProviderId {
  if (id && isCloudProviderId(id)) return id
  return 'openai'
}

/** Which provider handles a request under the current routing config. */
export function selectProviderId(
  config: AIProviderConfig,
  requestType: AIRequestType,
  promptChars: number
): AIProviderId {
  const cloud = normalizeCloudProvider(config.cloudProvider)
  if (config.mode === 'openai') return cloud
  if (config.mode === 'ollama') return 'ollama'
  if (promptChars > HYBRID_LARGE_PROMPT_CHARS) return cloud
  if (LOCAL_FRIENDLY.has(requestType)) return 'ollama'
  if (requestType === 'CHAT' && promptChars < 2000) return 'ollama'
  return cloud
}

export function resolveProviderModel(
  config: AIProviderConfig,
  providerId: AIProviderId,
  requested?: string
): string {
  if (providerId === 'ollama') return config.ollama.model || requested || 'llama3.2'
  if (providerId === 'anthropic') return config.anthropic?.model || DEFAULT_ANTHROPIC_MODEL
  if (providerId === 'gemini') return config.gemini?.model || DEFAULT_GEMINI_MODEL
  if (providerId === 'deepseek') return config.deepseek?.model || DEFAULT_DEEPSEEK_MODEL
  if (providerId === 'openrouter') return config.openrouter?.model || DEFAULT_OPENROUTER_MODEL
  return requested || config.openai.model || DEFAULT_AI_MODEL
}

export function fallbackProviderId(primary: AIProviderId, cloud: CloudProviderId): AIProviderId {
  return primary === 'ollama' ? cloud : 'ollama'
}

export function cloudModelConfigPatch(
  providerId: CloudProviderId,
  model: string
): AIProviderConfigPatch {
  if (providerId === 'openai') return { openai: { model } }
  if (providerId === 'anthropic') return { anthropic: { model } }
  if (providerId === 'gemini') return { gemini: { model } }
  if (providerId === 'deepseek') return { deepseek: { model } }
  return { openrouter: { model } }
}
