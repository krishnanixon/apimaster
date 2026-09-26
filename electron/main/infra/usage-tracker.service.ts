import { estimateCostUsd } from '@shared/lib/ai-models'
import { usageRepository } from '../repositories/usage.repository'
import { logger } from './logger.service'

/** Shape of the `usage` object returned by the OpenAI Chat Completions API. */
export interface OpenAiUsage {
  prompt_tokens?: number
  completion_tokens?: number
  total_tokens?: number
}

interface RecordUsageParams {
  feature: string
  model: string
  projectId?: string | null
  usage?: OpenAiUsage | null
}

/**
 * Persists token usage for a single OpenAI request. Best-effort: any failure is
 * logged and swallowed so usage tracking can never break an AI feature.
 */
export function recordUsage({ feature, model, projectId, usage }: RecordUsageParams): void {
  if (!usage) return

  const promptTokens = usage.prompt_tokens ?? 0
  const completionTokens = usage.completion_tokens ?? 0
  const totalTokens = usage.total_tokens ?? promptTokens + completionTokens

  if (promptTokens === 0 && completionTokens === 0 && totalTokens === 0) return

  void usageRepository
    .record({
      feature,
      projectId: projectId ?? null,
      model,
      promptTokens,
      completionTokens,
      totalTokens,
      estimatedCost: estimateCostUsd(model, promptTokens, completionTokens)
    })
    .catch((e) => {
      logger.warn(`Failed to record API usage: ${e instanceof Error ? e.message : e}`, 'UsageTracker')
    })
}
