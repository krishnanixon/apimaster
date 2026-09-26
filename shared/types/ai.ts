/**
 * Shared AI provider contract — used by the renderer (provider switcher,
 * settings, status panel) and the main process (providers, router, IPC).
 *
 * Adding a new provider only requires:
 *   1. adding its id to `AIProviderId` (+ metadata in `AI_PROVIDER_META`)
 *   2. implementing one provider class in `electron/main/ai/providers`
 *   3. registering that instance in the provider registry
 */

export type AIProviderId =
  | 'openai'
  | 'ollama'
  | 'anthropic'
  | 'gemini'
  | 'azure'
  | 'openrouter'
  | 'groq'
  | 'deepseek'

export type CloudProviderId = 'openai' | 'anthropic' | 'gemini' | 'deepseek' | 'openrouter'

/** Top-level routing mode chosen from the header switcher. */
export type AIMode = 'openai' | 'ollama' | 'hybrid'

/**
 * Every AI request declares its purpose so the router can pick the best
 * provider (and, in hybrid mode, keep cheap/local tasks off paid APIs).
 */
export type AIRequestType =
  | 'CHAT'
  | 'CODE_GENERATION'
  | 'CODE_REVIEW'
  | 'FLOW_GENERATION'
  | 'DOCUMENTATION'
  | 'REQUIREMENT_ANALYSIS'
  | 'DB_DESIGN'
  | 'API_GENERATION'
  | 'UI_DESIGN'
  | 'ESTIMATION'
  | 'SUMMARIZATION'
  | 'TITLE'
  | 'GRAMMAR'
  | 'FORMATTING'
  | 'CLEANUP'
  | 'KEYWORDS'

export interface AIModelOption {
  id: string
  label: string
  description?: string
  /** Local model size on disk in bytes (Ollama). */
  sizeBytes?: number
  /** Provider that owns this model (used by the grouped switcher). */
  provider?: AIProviderId
}

export interface OpenAIProviderConfig {
  model: string
  temperature: number
  maxTokens: number
}

export interface OllamaProviderConfig {
  baseUrl: string
  model: string
}

export interface NamedModelConfig {
  model: string
}

export interface AIProviderConfig {
  mode: AIMode
  /** Cloud provider used when mode is `openai` or for hybrid heavy work. */
  cloudProvider: CloudProviderId
  openai: OpenAIProviderConfig
  ollama: OllamaProviderConfig
  anthropic: NamedModelConfig
  gemini: NamedModelConfig
  deepseek: NamedModelConfig
  openrouter: NamedModelConfig
  /** Fall back to the other provider if the primary is offline mid-request. */
  fallbackEnabled: boolean
  /** Reuse recent identical prompts instead of re-calling the model. */
  promptCacheEnabled: boolean
  /**
   * Root-level credit protection applied at connection time. Caps max_tokens,
   * blocks duplicate document generation, and skips extra paid retries.
   */
  creditGuardEnabled: boolean
  /**
   * Soft daily cap on recorded total tokens (0 = unlimited). Enforced before
   * each paid completion so a runaway generate cannot keep spending.
   */
  dailyTokenBudget: number
  /** When false, a failed local model will not fail over onto a paid cloud API. */
  allowPaidFallback: boolean
}

/** Deep-partial patch for updating provider config (nested sections optional). */
export interface AIProviderConfigPatch {
  mode?: AIMode
  cloudProvider?: AIProviderConfig['cloudProvider']
  openai?: Partial<OpenAIProviderConfig>
  ollama?: Partial<OllamaProviderConfig>
  anthropic?: Partial<NamedModelConfig>
  gemini?: Partial<NamedModelConfig>
  deepseek?: Partial<NamedModelConfig>
  openrouter?: Partial<NamedModelConfig>
  fallbackEnabled?: boolean
  promptCacheEnabled?: boolean
  creditGuardEnabled?: boolean
  dailyTokenBudget?: number
  allowPaidFallback?: boolean
}

export interface AIProviderStatus {
  id: AIProviderId
  label: string
  /** Implemented in this build. */
  implemented: boolean
  /** Has the minimum config to be usable (API key set / base URL present). */
  configured: boolean
  /** Last health check succeeded. */
  online: boolean
  detail?: string
  models?: AIModelOption[]
  responseMs?: number
}

export interface AITestConnectionResult {
  ok: boolean
  detail?: string
  models?: AIModelOption[]
  version?: string
  responseMs?: number
}

export interface AIProviderMetric {
  providerId: AIProviderId
  requests: number
  lastResponseMs: number
  avgResponseMs: number
  totalTokens: number
  avgTokensPerSec: number
}

export interface AIRuntimeStatus {
  config: AIProviderConfig
  providers: AIProviderStatus[]
  metrics: AIProviderMetric[]
  /** Resolved provider + model for a plain CHAT request under current config. */
  activeProvider: AIProviderId
  activeModel: string
}
