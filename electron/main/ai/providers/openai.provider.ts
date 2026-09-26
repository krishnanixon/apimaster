import OpenAI from 'openai'
import type {
  ChatCompletionCreateParamsStreaming,
  ChatCompletionCreateParamsNonStreaming
} from 'openai/resources/chat/completions'
import type { AIModelOption } from '@shared/types'
import {
  AI_MODEL_CATALOG,
  DEFAULT_AI_MODEL,
  modelSupportsTemperature,
  modelTokenParam
} from '@shared/lib/ai-models'
import { apiKeyService } from '../../infra/api-key.service'
import { recordUsage, type OpenAiUsage } from '../../infra/usage-tracker.service'
import { logger } from '../../infra/logger.service'
import type { AIChatMessage, AIChatResult, AIGenerateOptions, AIProvider, ProviderHealth } from '../types'

/**
 * OpenAI (cloud) provider. Wraps the official SDK and preserves the app's
 * existing behaviour: reasoning/GPT-5 models get `max_completion_tokens` and no
 * custom temperature, and every request records token usage for the dashboard.
 */
export class OpenAIProvider implements AIProvider {
  readonly id = 'openai' as const
  readonly label = 'OpenAI'

  private getClient(): OpenAI {
    const apiKey = apiKeyService.getApiKey()
    if (!apiKey) {
      throw new Error('OpenAI API key not configured. Add it in App Settings → AI.')
    }
    return new OpenAI({ apiKey })
  }

  isConfigured(): boolean {
    return apiKeyService.getStatus().isSet
  }

  private buildBody(
    messages: AIChatMessage[],
    options: AIGenerateOptions,
    stream: boolean
  ): Record<string, unknown> {
    const model = options.model || DEFAULT_AI_MODEL
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
    const model = options.model || DEFAULT_AI_MODEL
    const body = this.buildBody(messages, options, false)

    const response = await client.chat.completions.create(
      body as unknown as ChatCompletionCreateParamsNonStreaming,
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
    const model = options.model || DEFAULT_AI_MODEL
    const body = this.buildBody(messages, options, true)
    const signal = options.signal
    let usage: OpenAiUsage | null = null

    try {
      const stream = await client.chat.completions.create(
        body as unknown as ChatCompletionCreateParamsStreaming,
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
      const message = error instanceof Error ? error.message : 'Unknown OpenAI error'
      logger.error(`OpenAI stream error: ${message}`, 'OpenAIProvider')
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
    return AI_MODEL_CATALOG.map((m) => ({
      id: m.value,
      label: m.label,
      description: m.description,
      provider: 'openai' as const
    }))
  }

  async healthCheck(): Promise<ProviderHealth> {
    if (!this.isConfigured()) {
      return { ok: false, detail: 'API key not configured' }
    }
    const started = Date.now()
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 6000)
    try {
      const client = this.getClient()
      // models.list verifies the key + connectivity without spending tokens.
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

  async embeddings(
    input: string[],
    model = 'text-embedding-3-small',
    dimensions?: number
  ): Promise<number[][]> {
    const client = this.getClient()
    const body: { model: string; input: string[]; dimensions?: number } = { model, input }
    // text-embedding-3-* supports Matryoshka dimensions so we can match LiteChroma collections.
    if (typeof dimensions === 'number' && dimensions > 0 && model.startsWith('text-embedding-3')) {
      body.dimensions = dimensions
    }
    const response = await client.embeddings.create(body)
    return response.data.map((d) => d.embedding)
  }
}

export const openAIProvider = new OpenAIProvider()
