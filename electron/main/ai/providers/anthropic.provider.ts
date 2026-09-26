import type { AIModelOption } from '@shared/types'
import {
  ANTHROPIC_MODEL_CATALOG,
  DEFAULT_ANTHROPIC_MODEL
} from '@shared/lib/ai-models'
import { toAnthropicMessages } from '@shared/lib/llm-messages'
import { apiKeyService } from '../../infra/api-key.service'
import { recordUsage } from '../../infra/usage-tracker.service'
import { logger } from '../../infra/logger.service'
import type { AIChatMessage, AIChatResult, AIGenerateOptions, AIProvider, ProviderHealth } from '../types'

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_VERSION = '2023-06-01'

export class AnthropicProvider implements AIProvider {
  readonly id = 'anthropic' as const
  readonly label = 'Anthropic Claude'

  isConfigured(): boolean {
    return apiKeyService.getProviderStatus(this.id).isSet
  }

  private headers(): Record<string, string> {
    const apiKey = apiKeyService.getProviderKey(this.id)
    if (!apiKey) throw new Error('Anthropic API key not configured. Add it in App Settings → AI.')
    return {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION
    }
  }

  private body(messages: AIChatMessage[], options: AIGenerateOptions, stream: boolean): Record<string, unknown> {
    const converted = toAnthropicMessages(messages)
    const model = options.model || DEFAULT_ANTHROPIC_MODEL
    return {
      model,
      max_tokens: options.maxTokens ?? 4096,
      stream,
      ...(converted.system ? { system: converted.system } : {}),
      messages: converted.messages,
      ...(typeof options.temperature === 'number'
        ? { temperature: Math.min(1, Math.max(0, options.temperature)) }
        : {})
    }
  }

  async chat(messages: AIChatMessage[], options: AIGenerateOptions): Promise<AIChatResult> {
    const model = options.model || DEFAULT_ANTHROPIC_MODEL
    const res = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(this.body(messages, options, false)),
      signal: options.signal
    })
    if (!res.ok) throw new Error(await readError(res, 'Anthropic request failed'))
    const json = (await res.json()) as {
      content?: Array<{ type: string; text?: string }>
      usage?: { input_tokens?: number; output_tokens?: number }
    }
    const text = (json.content ?? []).filter((block) => block.type === 'text').map((block) => block.text ?? '').join('')
    const promptTokens = json.usage?.input_tokens ?? 0
    const completionTokens = json.usage?.output_tokens ?? 0
    recordUsage({
      feature: options.meta?.feature ?? 'chat',
      projectId: options.meta?.projectId,
      model,
      usage: {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: promptTokens + completionTokens
      }
    })
    return { text, model, promptTokens, completionTokens, totalTokens: promptTokens + completionTokens }
  }

  async *streamChat(messages: AIChatMessage[], options: AIGenerateOptions): AsyncGenerator<string> {
    const model = options.model || DEFAULT_ANTHROPIC_MODEL
    const res = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(this.body(messages, options, true)),
      signal: options.signal
    })
    if (!res.ok || !res.body) throw new Error(await readError(res, 'Anthropic stream failed'))
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let promptTokens = 0
    let completionTokens = 0
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed.startsWith('data:')) continue
          const payload = trimmed.slice(5).trim()
          if (!payload || payload === '[DONE]') continue
          try {
            const event = JSON.parse(payload) as {
              type?: string
              delta?: { type?: string; text?: string }
              usage?: { input_tokens?: number; output_tokens?: number }
              message?: { usage?: { input_tokens?: number; output_tokens?: number } }
            }
            if (event.type === 'content_block_delta' && event.delta?.text) yield event.delta.text
            const usage = event.usage ?? event.message?.usage
            if (usage?.input_tokens) promptTokens = usage.input_tokens
            if (usage?.output_tokens) completionTokens = usage.output_tokens
          } catch {
            // ignore malformed SSE lines
          }
        }
      }
    } finally {
      reader.releaseLock()
      recordUsage({
        feature: options.meta?.feature ?? 'chat',
        projectId: options.meta?.projectId,
        model,
        usage:
          promptTokens || completionTokens
            ? {
                prompt_tokens: promptTokens,
                completion_tokens: completionTokens,
                total_tokens: promptTokens + completionTokens
              }
            : null
      })
    }
  }

  async listModels(): Promise<AIModelOption[]> {
    return ANTHROPIC_MODEL_CATALOG.map((m) => ({
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
      const res = await fetch('https://api.anthropic.com/v1/models?limit=1', {
        headers: this.headers(),
        signal: controller.signal
      })
      if (!res.ok) throw new Error(await readError(res, 'Anthropic health check failed'))
      return {
        ok: true,
        detail: 'Connected',
        models: await this.listModels(),
        responseMs: Date.now() - started
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Connection failed'
      logger.warn(`Anthropic health check: ${message}`, 'LLMGateway')
      return { ok: false, detail: message, responseMs: Date.now() - started }
    } finally {
      clearTimeout(timeout)
    }
  }
}

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const json = (await res.json()) as { error?: { message?: string } }
    return json.error?.message || `${fallback} (${res.status})`
  } catch {
    return `${fallback} (${res.status})`
  }
}

export const anthropicProvider = new AnthropicProvider()
