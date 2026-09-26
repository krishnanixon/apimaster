import type {
  AIProviderConfig,
  AIProviderConfigPatch,
  AIProviderId,
  AIProviderStatus,
  AIModelOption,
  AIRuntimeStatus,
  AITestConnectionResult
} from '@shared/types'
import { aiConfigService } from './config/ai-config.service'
import { aiRouter } from './router/router'
import { metricsService } from './metrics/metrics.service'
import {
  getProvider,
  isImplemented,
  listImplementedProviders,
  PLANNED_PROVIDERS
} from './providers/registry'
import { ollamaProvider } from './providers/ollama.provider'
import type { ProviderHealth } from './types'

const HEALTH_TTL_MS = 30_000

interface HealthCacheEntry {
  health: ProviderHealth
  ts: number
}

/**
 * High-level facade the IPC layer and services talk to. Owns configuration,
 * runtime status (with a short health-check cache), model discovery, metrics,
 * and delegates generation to the router.
 */
class AIManager {
  private healthCache = new Map<AIProviderId, HealthCacheEntry>()
  private warmupStarted = false

  getConfig(): AIProviderConfig {
    return aiConfigService.get()
  }

  setConfig(patch: AIProviderConfigPatch): AIProviderConfig {
    const next = aiConfigService.set(patch)
    // A base-URL change invalidates cached Ollama health.
    if (patch.ollama?.baseUrl) this.healthCache.delete('ollama')
    if (patch.cloudProvider) this.healthCache.delete(patch.cloudProvider)
    if (
      next.ollama.model &&
      (next.mode === 'ollama' || next.mode === 'hybrid') &&
      (patch.mode !== undefined ||
        patch.ollama?.model !== undefined ||
        patch.ollama?.baseUrl !== undefined)
    ) {
      void this.warmupOllama()
    }
    return next
  }

  /** Load the selected local model into memory (best-effort, non-blocking). */
  warmupOllama(): void {
    const config = aiConfigService.get()
    if (config.mode !== 'ollama' && config.mode !== 'hybrid') return
    const model = config.ollama.model
    if (!model) return
    void ollamaProvider.warmup(model)
  }

  /** Warm up once on startup when local AI is enabled. */
  warmupOnStartup(): void {
    if (this.warmupStarted) return
    this.warmupStarted = true
    const config = aiConfigService.get()
    if ((config.mode === 'ollama' || config.mode === 'hybrid') && config.ollama.model) {
      void ollamaProvider.warmup(config.ollama.model)
    }
  }

  private async getHealth(id: AIProviderId, force = false): Promise<ProviderHealth> {
    const cached = this.healthCache.get(id)
    if (!force && cached && Date.now() - cached.ts < HEALTH_TTL_MS) return cached.health
    const provider = getProvider(id)
    if (!provider) return { ok: false, detail: 'Not implemented' }
    const health = await provider.healthCheck()
    this.healthCache.set(id, { health, ts: Date.now() })
    return health
  }

  async getStatus(): Promise<AIRuntimeStatus> {
    const config = aiConfigService.get()

    const implemented = await Promise.all(
      listImplementedProviders().map(async (provider): Promise<AIProviderStatus> => {
        const configured = provider.isConfigured()
        if (!configured) {
          return {
            id: provider.id,
            label: provider.label,
            implemented: true,
            configured: false,
            online: false,
            detail: provider.id === 'ollama' ? 'Not configured' : 'API key not configured',
            models: await provider.listModels()
          }
        }
        const health = await this.getHealth(provider.id)
        return {
          id: provider.id,
          label: provider.label,
          implemented: true,
          configured,
          online: health.ok,
          detail: health.detail,
          models: health.models ?? (await provider.listModels()),
          responseMs: health.responseMs
        }
      })
    )

    const planned: AIProviderStatus[] = PLANNED_PROVIDERS.map((p) => ({
      id: p.id,
      label: p.label,
      implemented: false,
      configured: false,
      online: false,
      detail: 'Coming soon'
    }))

    const active = aiRouter.resolveActive(config)

    return {
      config,
      providers: [...implemented, ...planned],
      metrics: metricsService.getAll(),
      activeProvider: active.providerId,
      activeModel: active.model
    }
  }

  async testConnection(id: AIProviderId): Promise<AITestConnectionResult> {
    if (!isImplemented(id)) return { ok: false, detail: 'Provider not implemented yet' }
    const health = await this.getHealth(id, true)
    if (id === 'ollama' && health.ok) {
      void this.warmupOllama()
    }
    return {
      ok: health.ok,
      detail: health.detail,
      models: health.models,
      version: health.version,
      responseMs: health.responseMs
    }
  }

  async listModels(id: AIProviderId): Promise<AIModelOption[]> {
    const provider = getProvider(id)
    if (!provider) return []
    return provider.listModels()
  }

  getMetrics() {
    return metricsService.getAll()
  }

  get router() {
    return aiRouter
  }
}

export const aiManager = new AIManager()
export { aiRouter } from './router/router'
