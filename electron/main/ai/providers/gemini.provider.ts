import type { AIModelOption } from '@shared/types'
import { DEFAULT_GEMINI_MODEL, GEMINI_MODEL_CATALOG } from '@shared/lib/ai-models'
import { toGeminiContents } from '@shared/lib/llm-messages'
import { apiKeyService } from '../../infra/api-key.service'
import { recordUsage } from '../../infra/usage-tracker.service'
import { logger } from '../../infra/logger.service'
import type { AIChatMessage, AIChatResult, AIGenerateOptions, AIProvider, ProviderHealth } from '../types'

const GEMINI_ROOT = 'https://generativelanguage.googleapis.com/v1beta'

export class GeminiProvider implements AIProvider {
  readonly id = 'gemini' as const
  readonly label = 'Google Gemini'

  isConfigured(): boolean {
    return apiKeyService.getProviderStatus(this.id).isSet
  }

  private apiKey(): string {
    const key = apiKeyService.getProviderKey(this.id)
    if (!key) throw new Error('Gemini API key not configured. Add it in App Settings → AI.')
    return key
  }

  private url(model: string, stream: boolean): string {
    const method = stream ? 'streamGenerateContent' : 'generateContent'
    const suffix = stream ? `${method}?alt=sse` : method
    return `${GEMINI_ROOT}/models/${encodeURIComponent(model)}:${suffix}`
  }

  private payload(messages: AIChatMessage[], options: AIGenerateOptions): Record<string, unknown> {
    const generationConfig: Record<string, unknown> = {}
    if (typeof options.temperature === 'number') generationConfig.temperature = options.temperature
    if (typeof options.maxTokens === 'number') generationConfig.maxOutputTokens = options.maxTokens
    if (options.json) generationConfig.responseMimeType = 'application/json'
    return {
      contents: toGeminiContents(messages),
      ...(Object.keys(generationConfig).length > 0 ? { generationConfig } : {})
    }
  }

  async chat(messages: AIChatMessage[], options: AIGenerateOptions): Promise<AIChatResult> {
    const model = options.model || DEFAULT_GEMINI_MODEL
    const res = await fetch(this.url(model, false), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': this.apiKey()
      },
      body: JSON.stringify(this.payload(messages, options)),
      signal: options.signal
    })
    if (!res.ok) throw new Error(await readError(res, 'Gemini request failed'))
    const json = (await res.json()) as GeminiResponse
    const text = extractText(json)
    const promptTokens = json.usageMetadata?.promptTokenCount ?? 0
    const completionTokens = json.usageMetadata?.candidatesTokenCount ?? 0
    recordUsage({
      feature: options.meta?.feature ?? 'chat',
      projectId: options.meta?.projectId,
      model,
      usage: {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: json.usageMetadata?.totalTokenCount ?? promptTokens + completionTokens
      }
    })
    return {
      text,
      model,
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens
    }
  }

  async *streamChat(messages: AIChatMessage[], options: AIGenerateOptions): AsyncGenerator<string> {
    const model = options.model || DEFAULT_GEMINI_MODEL
    const res = await fetch(this.url(model, true), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': this.apiKey()
      },
      body: JSON.stringify(this.payload(messages, options)),
      signal: options.signal
    })
    if (!res.ok || !res.body) throw new Error(await readError(res, 'Gemini stream failed'))
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
            const event = JSON.parse(payload) as GeminiResponse
            const text = extractText(event)
            if (text) yield text
            if (event.usageMetadata?.promptTokenCount) promptTokens = event.usageMetadata.promptTokenCount
            if (event.usageMetadata?.candidatesTokenCount) {
              completionTokens = event.usageMetadata.candidatesTokenCount
            }
          } catch {
            // ignore malformed SSE
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
    return GEMINI_MODEL_CATALOG.map((m) => ({
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
      const res = await fetch(`${GEMINI_ROOT}/models?pageSize=1`, {
        headers: { 'x-goog-api-key': this.apiKey() },
        signal: controller.signal
      })
      if (!res.ok) throw new Error(await readError(res, 'Gemini health check failed'))
      return {
        ok: true,
        detail: 'Connected',
        models: await this.listModels(),
        responseMs: Date.now() - started
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Connection failed'
      logger.warn(`Gemini health check: ${message}`, 'LLMGateway')
      return { ok: false, detail: message, responseMs: Date.now() - started }
    } finally {
      clearTimeout(timeout)
    }
  }
}

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
  usageMetadata?: {
    promptTokenCount?: number
    candidatesTokenCount?: number
    totalTokenCount?: number
  }
}

function extractText(json: GeminiResponse): string {
  return (json.candidates ?? [])
    .flatMap((candidate) => candidate.content?.parts ?? [])
    .map((part) => part.text ?? '')
    .join('')
}

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const json = (await res.json()) as { error?: { message?: string } }
    return json.error?.message || `${fallback} (${res.status})`
  } catch {
    return `${fallback} (${res.status})`
  }
}

export const geminiProvider = new GeminiProvider()
