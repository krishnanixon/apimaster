import type { AIProviderConfig, AIProviderId } from '../types/ai'
import { fallbackProviderId, isCloudProviderId, normalizeCloudProvider } from './ai-routing'

/** Absolute bounds applied when a provider is connected. */
export const CREDIT_MIN_TOKENS = 256
export const CREDIT_MAX_TOKENS = 8192

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** Cap the connection-level max_tokens stored with the provider. */
export function clampConnectionMaxTokens(value: number | undefined, fallback = 4096): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : fallback
  return clamp(n, CREDIT_MIN_TOKENS, CREDIT_MAX_TOKENS)
}

/** Cap a single request so it cannot exceed the connection budget. */
export function clampRequestMaxTokens(
  requested: number | undefined,
  connectionMax: number
): number {
  const cap = clampConnectionMaxTokens(connectionMax)
  if (typeof requested !== 'number' || !Number.isFinite(requested) || requested <= 0) {
    return cap
  }
  return clamp(Math.round(requested), CREDIT_MIN_TOKENS, cap)
}

/**
 * Whether the router may try a second provider after the primary fails.
 * Credit guard never retries a failed paid call, and never falls through
 * from local → paid unless the user opted into paid fallback.
 */
export function shouldAddFallback(config: AIProviderConfig, primaryId: AIProviderId): boolean {
  if (!config.fallbackEnabled) return false
  const cloud = normalizeCloudProvider(config.cloudProvider)
  const secondaryId = fallbackProviderId(primaryId, cloud)
  if (secondaryId === primaryId) return false
  if (!config.creditGuardEnabled) return true
  if (isCloudProviderId(primaryId)) return false
  if (isCloudProviderId(secondaryId) && !config.allowPaidFallback) return false
  return true
}

export function applyConnectionCreditLimits<T extends { maxTokens?: number }>(
  options: T,
  config: AIProviderConfig
): T {
  return {
    ...options,
    maxTokens: clampRequestMaxTokens(options.maxTokens, config.openai.maxTokens)
  }
}

/** Used by document generation: heuristic size, never above the connection cap. */
export function resolveSectionMaxTokens(perSectionWords: number, requestMaxTokens?: number, connectionMax = 4096): number {
  const cap = clampRequestMaxTokens(requestMaxTokens, connectionMax)
  const heuristic = Math.round(Math.max(250, perSectionWords) * 1.35) + 400
  return clamp(heuristic, CREDIT_MIN_TOKENS, cap)
}

export function dailyBudgetOrUnlimited(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return 0
  return Math.round(value)
}
