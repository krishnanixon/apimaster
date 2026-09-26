import type { AIModelOption, AIProviderId, AIRequestType } from '@shared/types'

/** A single turn in a provider-agnostic conversation. */
export interface AIChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface AIGenerateOptions {
  /** Preferred model; the router/provider may override or default it. */
  model?: string
  temperature?: number
  maxTokens?: number
  signal?: AbortSignal
  /** Request a strict JSON response (OpenAI json_object / Ollama format:json). */
  json?: boolean
  /** Declared purpose — drives provider selection in hybrid mode. */
  requestType?: AIRequestType
  meta?: { projectId?: string | null; feature?: string }
}

export interface AIChatResult {
  text: string
  model: string
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
  /** Local generation speed when reported by the provider (Ollama). */
  tokensPerSec?: number
}

export interface ProviderHealth {
  ok: boolean
  detail?: string
  models?: AIModelOption[]
  version?: string
  responseMs?: number
}

/**
 * Common contract every provider implements. Adding a new provider (Anthropic,
 * Gemini, Groq, …) is just a new class implementing this interface plus a line
 * in the registry — no changes to the router, IPC layer, or UI.
 */
export interface AIProvider {
  readonly id: AIProviderId
  readonly label: string

  /** Whether the provider has the minimum config to run (key / base URL). */
  isConfigured(): boolean

  /** Non-streaming completion — used for titles, summaries, cleanup, etc. */
  chat(messages: AIChatMessage[], options: AIGenerateOptions): Promise<AIChatResult>

  /** Streaming completion — yields text deltas as they arrive. */
  streamChat(messages: AIChatMessage[], options: AIGenerateOptions): AsyncGenerator<string>

  /** Models the provider currently exposes. */
  listModels(): Promise<AIModelOption[]>

  /** Cheap connectivity / configuration probe (never spends tokens). */
  healthCheck(): Promise<ProviderHealth>

  /** Optional — vector embeddings for semantic memory. */
  embeddings?(input: string[], model?: string): Promise<number[][]>
}
