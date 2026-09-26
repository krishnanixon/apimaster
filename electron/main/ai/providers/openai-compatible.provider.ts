import OpenAI from 'openai'
import type {
  ChatCompletionCreateParamsStreaming,
  ChatCompletionCreateParamsNonStreaming
} from 'openai/resources/chat/completions'
import type { AIModelOption, AIProviderId } from '@shared/types'
import type { AiModelInfo } from '@shared/lib/ai-models'
import { modelSupportsTemperature, modelTokenParam } from '@shared/lib/ai-models'
import { apiKeyService } from '../../infra/api-key.service'
import { recordUsage, type OpenAiUsage } from '../../infra/usage-tracker.service'
import { logger } from '../../infra/logger.service'
import type { AIChatMessage, AIChatResult, AIGenerateOptions, AIProvider, ProviderHealth } from '../types'

export interface OpenAICompatibleSpec {
  id: AIProviderId
  label: string
  baseURL: string
  catalog: AiModelInfo[]
  defaultModel: string
  headers?: Record<string, string>
}

/**
 * OpenAI Chat Completions compatible backends (DeepSeek, OpenRouter, Groq, Azure).
 */
export class OpenAICompatibleProvider implements AIProvider {
  readonly id: AIProviderId
  readonly label: string
  private readonly spec: OpenAICompatibleSpec

  constructor(spec: OpenAICompatibleSpec) {
    this.spec = spec
    this.id = spec.id
    this.label = spec.label
  }

  private getClient(): OpenAI {
    const apiKey = apiKeyService.getProviderKey(this.id)
    if (!apiKey) {
      throw new Error(`${this.label} API key not configured. Add it in App Settings → AI.`)
    }
    return new OpenAI({
      apiKey,
      baseURL: this.spec.baseURL,
      defaultHeaders: this.spec.headers
    })
  }

  isConfigured(): boolean {
    return apiKeyService.getProviderStatus(this.id).isSet
  }

  private buildBody(
    messages: AIChatMessage[],
    options: AIGenerateOptions,
    stream: boolean
  ): Record<string, unknown> {
    const model = options.model || this.spec.defaultModel
    const body: Record<string, unknown> = { model, messages }
    if (stream) {
      body.stream = true
      body.stream_options = { include_usage: true }
    }
    if (modelSupportsTemperature(model) && typeof options.temperature === 'number') {
      body.temperature = options.temperature
    }
    if (typeof options.maxTokens === 'number') {
      body[modelTokenParam(model)] = options.maxTokens
    }
    if (options.json && !stream) {
      body.response_format = { type: 'json_object' }
    }
    return body
  }

  async chat(messages: AIChatMessage[], options: AIGenerateOptions): Promise<AIChatResult> {
    const client = this.getClient()
    const model = options.model || this.spec.defaultModel
    const response = await client.chat.completions.create(
      this.buildBody(messages, options, false) as unknown as ChatCompletionCreateParamsNonStreaming,
      options.signal ? { signal: options.signal } : undefined
    )
    recordUsage({
      feature: options.meta?.feature ?? 'chat',
      projectId: options.meta?.projectId,
      model,
      usage: response.usage
    })
    return {
      text: response.choices[0]?.message?.content ?? '',
      model,
      promptTokens: response.usage?.prompt_tokens,
      completionTokens: response.usage?.completion_tokens,
      totalTokens: response.usage?.total_tokens
    }
  }

  async *streamChat(messages: AIChatMessage[], options: AIGenerateOptions): AsyncGenerator<string> {
    const client = this.getClient()
    const model = options.model || this.spec.defaultModel
    const signal = options.signal
    let usage: OpenAiUsage | null = null
    try {
      const stream = await client.chat.completions.create(
        this.buildBody(messages, options, true) as unknown as ChatCompletionCreateParamsStreaming,
        signal ? { signal } : undefined
      )
      for await (const chunk of stream) {
        if (chunk.usage) usage = chunk.usage
        if (signal?.aborted) break
        const content = chunk.choices[0]?.delta?.content
        if (content) yield content
      }
    } catch (error) {
      if (signal?.aborted) return
      const message = error instanceof Error ? error.message : `Unknown ${this.label} error`
      logger.error(`${this.label} stream error: ${message}`, 'LLMGateway')
      throw new Error(message)
    } finally {
      recordUsage({
        feature: options.meta?.feature ?? 'chat',
        projectId: options.meta?.projectId,
        model,
        usage
      })
    }
  }

  async listModels(): Promise<AIModelOption[]> {
    return this.spec.catalog.map((m) => ({
      id: m.value,
      label: m.label,
      description: m.description,
      provider: this.id
    }))
  }

  async healthCheck(): Promise<ProviderHealth> {
    if (!this.isConfigured()) return { ok: false, detail: 'API key not configured' }
    const started = Date.now()
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)
    try {
      const client = this.getClient()
      await client.models.list({ signal: controller.signal })
      return {
        ok: true,
        detail: 'Connected',
        models: await this.listModels(),
        responseMs: Date.now() - started
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Connection failed'
      return { ok: false, detail: message, responseMs: Date.now() - started }
    } finally {
      clearTimeout(timeout)
    }
  }
}
