import type { AIModelOption } from '@shared/types'
import { logger } from '../../infra/logger.service'
import { recordUsage } from '../../infra/usage-tracker.service'
import { aiConfigService } from '../config/ai-config.service'
import type { AIChatMessage, AIChatResult, AIGenerateOptions, AIProvider, ProviderHealth } from '../types'

/** Keep the model loaded between requests to avoid cold-start latency. */
const KEEP_ALIVE = '30m'

/** Smaller context window speeds up prompt evaluation on local hardware. */
const DEFAULT_NUM_CTX = 4096

interface OllamaTag {
  name: string
  size?: number
  details?: { parameter_size?: string; quantization_level?: string }
}

interface OllamaChatResponse {
  message?: { role: string; content: string }
  done?: boolean
  prompt_eval_count?: number
  eval_count?: number
  eval_duration?: number
}

/**
 * Ollama (local) provider. Talks to the Ollama REST API (default
 * http://localhost:11434) so lightweight tasks run on-device without spending
 * OpenAI tokens. Supports streaming via newline-delimited JSON.
 */
export class OllamaProvider implements AIProvider {
  readonly id = 'ollama' as const
  readonly label = 'Ollama (Local)'

  private baseUrl(): string {
    return aiConfigService.getOllamaBaseUrl()
  }

  private resolveModel(options: AIGenerateOptions): string {
    return options.model || aiConfigService.get().ollama.model || 'llama3.2'
  }

  isConfigured(): boolean {
    return Boolean(this.baseUrl())
  }

  /** Preload a model into memory so the first chat token arrives faster. */
  async warmup(model?: string): Promise<void> {
    const resolved = model || this.resolveModel({})
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 120_000)
    try {
      await fetch(`${this.baseUrl()}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: resolved,
          messages: [{ role: 'user', content: 'ping' }],
          stream: false,
          keep_alive: KEEP_ALIVE,
          options: { num_predict: 1, num_ctx: DEFAULT_NUM_CTX }
        }),
        signal: controller.signal
      })
    } catch {
      // Best-effort — Ollama may be offline or the model may not be installed yet.
    } finally {
      clearTimeout(timeout)
    }
  }

  async chat(messages: AIChatMessage[], options: AIGenerateOptions): Promise<AIChatResult> {
    const model = this.resolveModel(options)
    const res = await fetch(`${this.baseUrl()}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        keep_alive: KEEP_ALIVE,
        ...(options.json ? { format: 'json' } : {}),
        options: this.buildOptions(options)
      }),
      signal: options.signal
    })
    if (!res.ok) {
      throw new Error(`Ollama request failed (${res.status}). Is the model "${model}" installed?`)
    }
    const data = (await res.json()) as OllamaChatResponse
    const promptTokens = data.prompt_eval_count ?? 0
    const completionTokens = data.eval_count ?? 0
    const tokensPerSec =
      data.eval_count && data.eval_duration ? data.eval_count / (data.eval_duration / 1e9) : undefined

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

    return {
      text: data.message?.content ?? '',
      model,
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
      tokensPerSec
    }
  }

  async *streamChat(messages: AIChatMessage[], options: AIGenerateOptions): AsyncGenerator<string> {
    const model = this.resolveModel(options)
    const signal = options.signal
    let promptTokens = 0
    let completionTokens = 0

    let res: Response
    try {
      res = await fetch(`${this.baseUrl()}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages,
          stream: true,
          keep_alive: KEEP_ALIVE,
          options: this.buildOptions(options)
        }),
        signal
      })
    } catch {
      if (signal?.aborted) return
      throw new Error(
        `Cannot reach Ollama at ${this.baseUrl()}. Make sure Ollama is running (ollama serve).`
      )
    }

    if (!res.ok || !res.body) {
      throw new Error(`Ollama request failed (${res.status}). Is the model "${model}" installed?`)
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        if (signal?.aborted) break
        buffer += decoder.decode(value, { stream: true })

        let newlineIndex: number
        while ((newlineIndex = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, newlineIndex).trim()
          buffer = buffer.slice(newlineIndex + 1)
          if (!line) continue
          try {
            const json = JSON.parse(line) as OllamaChatResponse
            if (json.prompt_eval_count) promptTokens = json.prompt_eval_count
            if (json.eval_count) completionTokens = json.eval_count
            const content = json.message?.content
            if (content) yield content
          } catch {
            // Ignore partial/non-JSON lines.
          }
        }
      }
    } catch (error) {
      if (signal?.aborted) return
      const message = error instanceof Error ? error.message : 'Unknown Ollama error'
      logger.error(`Ollama stream error: ${message}`, 'OllamaProvider')
      throw new Error(message)
    } finally {
      try {
        await reader.cancel()
      } catch {
        /* noop */
      }
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
    }
  }

  async listModels(): Promise<AIModelOption[]> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 4000)
    try {
      const res = await fetch(`${this.baseUrl()}/api/tags`, { signal: controller.signal })
      if (!res.ok) return []
      const data = (await res.json()) as { models?: OllamaTag[] }
      return (data.models ?? []).map((m) => ({
        id: m.name,
        label: m.name,
        description: m.details?.parameter_size
          ? `${m.details.parameter_size}${m.details.quantization_level ? ` · ${m.details.quantization_level}` : ''}`
          : undefined,
        sizeBytes: m.size,
        provider: 'ollama' as const
      }))
    } catch {
      return []
    } finally {
      clearTimeout(timeout)
    }
  }

  async healthCheck(): Promise<ProviderHealth> {
    const started = Date.now()
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 4000)
    try {
      const res = await fetch(`${this.baseUrl()}/api/version`, { signal: controller.signal })
      if (!res.ok) {
        return { ok: false, detail: `Ollama responded ${res.status}`, responseMs: Date.now() - started }
      }
      const version = ((await res.json()) as { version?: string }).version
      const models = await this.listModels()
      return {
        ok: true,
        detail: models.length ? `${models.length} model${models.length === 1 ? '' : 's'}` : 'Running (no models)',
        version,
        models,
        responseMs: Date.now() - started
      }
    } catch {
      return {
        ok: false,
        detail: `Cannot reach Ollama at ${this.baseUrl()}`,
        responseMs: Date.now() - started
      }
    } finally {
      clearTimeout(timeout)
    }
  }

  async embeddings(input: string[], model?: string): Promise<number[][]> {
    const embedModel = model || this.resolveModel({})
    const results: number[][] = []
    for (const text of input) {
      const res = await fetch(`${this.baseUrl()}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: embedModel, prompt: text })
      })
      if (!res.ok) throw new Error(`Ollama embeddings failed (${res.status})`)
      const data = (await res.json()) as { embedding?: number[] }
      results.push(data.embedding ?? [])
    }
    return results
  }

  private buildOptions(options: AIGenerateOptions): Record<string, unknown> {
    const opts: Record<string, unknown> = {
      num_ctx: DEFAULT_NUM_CTX,
      num_batch: 512
    }
    if (typeof options.temperature === 'number') opts.temperature = options.temperature
    if (typeof options.maxTokens === 'number') {
      // Cap chat output length on local models — long generations block the UI.
      const cap = options.requestType === 'CHAT' ? 2048 : options.maxTokens
      opts.num_predict = Math.min(options.maxTokens, cap)
    }
    return opts
  }
}

export const ollamaProvider = new OllamaProvider()
