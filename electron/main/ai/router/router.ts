import type { AIProviderConfig, AIProviderId, AIRequestType } from '@shared/types'
import {
  fallbackProviderId,
  normalizeCloudProvider,
  resolveProviderModel,
  selectProviderId
} from '@shared/lib/ai-routing'
import { aiConfigService } from '../config/ai-config.service'
import { getProvider } from '../providers/registry'
import { metricsService } from '../metrics/metrics.service'
import { promptCache } from '../cache/prompt-cache'
import { trimMessagesForLocalModel } from '../chat-optimization'
import {
  acquireTokenReservation,
  CreditBudgetError,
  prepareGenerateOptions,
  releaseTokenReservation
} from '../credit-guard'
import { shouldAddFallback } from '@shared/lib/ai-credit-guard'
import type { AIChatMessage, AIChatResult, AIGenerateOptions, AIProvider } from '../types'

/** Non-chat request types whose identical prompts can be safely cached. */
const CACHEABLE: ReadonlySet<AIRequestType> = new Set([
  'TITLE',
  'SUMMARIZATION',
  'GRAMMAR',
  'FORMATTING',
  'CLEANUP',
  'KEYWORDS'
])

interface ResolvedTarget {
  providerId: AIProviderId
  provider: AIProvider
  model: string
}

class AIRouter {
  /** Which provider handles a plain CHAT request under the current config. */
  resolveActive(config = aiConfigService.get()): { providerId: AIProviderId; model: string } {
    const providerId = selectProviderId(config, 'CHAT', 0)
    return { providerId, model: resolveProviderModel(config, providerId) }
  }

  private targetFor(
    config: AIProviderConfig,
    providerId: AIProviderId,
    requested?: string
  ): ResolvedTarget | null {
    const provider = getProvider(providerId)
    if (!provider) return null
    return { providerId, provider, model: resolveProviderModel(config, providerId, requested) }
  }

  /**
   * Ordered list of providers to try: the selected one first, then (if fallback
   * is enabled) local ↔ selected cloud.
   */
  private buildOrder(
    config: AIProviderConfig,
    requestType: AIRequestType,
    promptChars: number,
    requested?: string
  ): ResolvedTarget[] {
    const primaryId = selectProviderId(config, requestType, promptChars)
    const cloud = normalizeCloudProvider(config.cloudProvider)
    const order: ResolvedTarget[] = []
    const primary = this.targetFor(config, primaryId, requested)
    if (primary) order.push(primary)

    if (shouldAddFallback(config, primaryId)) {
      const secondaryId = fallbackProviderId(primaryId, cloud)
      const secondary = getProvider(secondaryId)
      if (secondary && secondary.isConfigured() && secondaryId !== primaryId) {
        const target = this.targetFor(config, secondaryId)
        if (target) order.push(target)
      }
    }
    return order
  }

  private static totalChars(messages: AIChatMessage[]): number {
    return messages.reduce((sum, m) => sum + m.content.length, 0)
  }

  private static prepareMessages(
    providerId: AIProviderId,
    messages: AIChatMessage[]
  ): AIChatMessage[] {
    return providerId === 'ollama' ? trimMessagesForLocalModel(messages) : messages
  }

  async *streamChat(messages: AIChatMessage[], options: AIGenerateOptions): AsyncGenerator<string> {
    const config = aiConfigService.get()
    const limited = prepareGenerateOptions(options, config)
    const requestType = limited.requestType ?? 'CHAT'
    const order = this.buildOrder(config, requestType, AIRouter.totalChars(messages), limited.model)
    if (order.length === 0) throw new Error('No AI provider is available.')

    let lastError: unknown
    for (let i = 0; i < order.length; i++) {
      const { providerId, provider, model } = order[i]
      const prepared = AIRouter.prepareMessages(providerId, messages)
      const started = Date.now()
      let produced = false
      let reservation = 0
      try {
        reservation = await acquireTokenReservation(config, providerId, limited.maxTokens)
        for await (const chunk of provider.streamChat(prepared, { ...limited, model })) {
          produced = true
          yield chunk
        }
        metricsService.record(providerId, { responseMs: Date.now() - started })
        return
      } catch (error) {
        lastError = error
        if (error instanceof CreditBudgetError || produced || i === order.length - 1) throw error
      } finally {
        releaseTokenReservation(reservation)
      }
    }
    throw lastError instanceof Error ? lastError : new Error('AI request failed')
  }

  async chat(messages: AIChatMessage[], options: AIGenerateOptions): Promise<AIChatResult> {
    const config = aiConfigService.get()
    const limited = prepareGenerateOptions(options, config)
    const requestType = limited.requestType ?? 'CHAT'
    const order = this.buildOrder(config, requestType, AIRouter.totalChars(messages), limited.model)
    if (order.length === 0) throw new Error('No AI provider is available.')

    const cacheable = config.promptCacheEnabled && CACHEABLE.has(requestType)

    let lastError: unknown
    for (let i = 0; i < order.length; i++) {
      const { providerId, provider, model } = order[i]
      const prepared = AIRouter.prepareMessages(providerId, messages)

      if (cacheable) {
        const cached = promptCache.get(providerId, model, prepared)
        if (cached) return { text: cached, model }
      }

      const started = Date.now()
      let reservation = 0
      try {
        reservation = await acquireTokenReservation(config, providerId, limited.maxTokens)
        const result = await provider.chat(prepared, { ...limited, model })
        metricsService.record(providerId, {
          responseMs: Date.now() - started,
          tokens: result.totalTokens,
          tokensPerSec: result.tokensPerSec
        })
        if (cacheable) promptCache.set(providerId, model, prepared, result.text)
        return result
      } catch (error) {
        lastError = error
        if (error instanceof CreditBudgetError || i === order.length - 1) throw error
      } finally {
        releaseTokenReservation(reservation)
      }
    }
    throw lastError instanceof Error ? lastError : new Error('AI request failed')
  }
}

export const aiRouter = new AIRouter()
