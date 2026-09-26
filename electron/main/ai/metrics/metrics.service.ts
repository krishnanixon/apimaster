import type { AIProviderId, AIProviderMetric } from '@shared/types'

interface MetricAccumulator {
  requests: number
  totalMs: number
  lastMs: number
  totalTokens: number
  /** Sum of per-request tokens/sec, for a simple running average. */
  tokensPerSecSum: number
  tokensPerSecSamples: number
}

/**
 * In-memory, per-provider performance metrics for the status panel: response
 * time, throughput, and token volume. Cost is tracked separately (and durably)
 * via the usage repository / dashboard.
 */
class MetricsService {
  private store = new Map<AIProviderId, MetricAccumulator>()

  record(
    providerId: AIProviderId,
    sample: { responseMs: number; tokens?: number; tokensPerSec?: number }
  ): void {
    const acc =
      this.store.get(providerId) ??
      { requests: 0, totalMs: 0, lastMs: 0, totalTokens: 0, tokensPerSecSum: 0, tokensPerSecSamples: 0 }

    acc.requests += 1
    acc.totalMs += sample.responseMs
    acc.lastMs = sample.responseMs
    acc.totalTokens += sample.tokens ?? 0

    const tps =
      sample.tokensPerSec ??
      (sample.tokens && sample.responseMs > 0 ? sample.tokens / (sample.responseMs / 1000) : undefined)
    if (typeof tps === 'number' && Number.isFinite(tps) && tps > 0) {
      acc.tokensPerSecSum += tps
      acc.tokensPerSecSamples += 1
    }

    this.store.set(providerId, acc)
  }

  getAll(): AIProviderMetric[] {
    return Array.from(this.store.entries()).map(([providerId, acc]) => ({
      providerId,
      requests: acc.requests,
      lastResponseMs: Math.round(acc.lastMs),
      avgResponseMs: acc.requests ? Math.round(acc.totalMs / acc.requests) : 0,
      totalTokens: acc.totalTokens,
      avgTokensPerSec: acc.tokensPerSecSamples
        ? Math.round((acc.tokensPerSecSum / acc.tokensPerSecSamples) * 10) / 10
        : 0
    }))
  }

  reset(): void {
    this.store.clear()
  }
}

export const metricsService = new MetricsService()
