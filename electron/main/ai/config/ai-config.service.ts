import { app } from 'electron'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import type { AIProviderConfig, AIProviderConfigPatch } from '@shared/types'
import {
  DEFAULT_AI_MODEL,
  DEFAULT_ANTHROPIC_MODEL,
  DEFAULT_DEEPSEEK_MODEL,
  DEFAULT_GEMINI_MODEL,
  DEFAULT_OPENROUTER_MODEL
} from '@shared/lib/ai-models'
import {
  clampConnectionMaxTokens,
  dailyBudgetOrUnlimited
} from '@shared/lib/ai-credit-guard'
import { logger } from '../../infra/logger.service'

const CONFIG_FILE = 'ai-provider-config.json'

export const DEFAULT_AI_CONFIG: AIProviderConfig = {
  mode: 'openai',
  cloudProvider: 'openai',
  openai: {
    model: DEFAULT_AI_MODEL,
    temperature: 0.7,
    maxTokens: 4096
  },
  ollama: {
    baseUrl: 'http://localhost:11434',
    model: ''
  },
  anthropic: { model: DEFAULT_ANTHROPIC_MODEL },
  gemini: { model: DEFAULT_GEMINI_MODEL },
  deepseek: { model: DEFAULT_DEEPSEEK_MODEL },
  openrouter: { model: DEFAULT_OPENROUTER_MODEL },
  fallbackEnabled: true,
  promptCacheEnabled: true,
  creditGuardEnabled: true,
  dailyTokenBudget: 0,
  allowPaidFallback: false
}

function getConfigPath(): string {
  return join(app.getPath('userData'), CONFIG_FILE)
}

/** Deep-merge a partial patch onto the current config (one level of nesting). */
function mergeConfig(base: AIProviderConfig, patch: AIProviderConfigPatch): AIProviderConfig {
  const openai = { ...base.openai, ...(patch.openai ?? {}) }
  openai.maxTokens = clampConnectionMaxTokens(openai.maxTokens, base.openai.maxTokens)
  if (typeof openai.temperature === 'number') {
    openai.temperature = Math.min(2, Math.max(0, openai.temperature))
  }
  return {
    ...base,
    ...patch,
    openai,
    ollama: { ...base.ollama, ...(patch.ollama ?? {}) },
    anthropic: { ...base.anthropic, ...(patch.anthropic ?? {}) },
    gemini: { ...base.gemini, ...(patch.gemini ?? {}) },
    deepseek: { ...base.deepseek, ...(patch.deepseek ?? {}) },
    openrouter: { ...base.openrouter, ...(patch.openrouter ?? {}) },
    dailyTokenBudget: dailyBudgetOrUnlimited(
      patch.dailyTokenBudget !== undefined ? patch.dailyTokenBudget : base.dailyTokenBudget
    )
  }
}

class AIConfigService {
  private cache: AIProviderConfig | null = null

  get(): AIProviderConfig {
    if (this.cache) return this.cache
    const path = getConfigPath()
    if (!existsSync(path)) {
      this.cache = { ...DEFAULT_AI_CONFIG }
      return this.cache
    }
    try {
      const raw = JSON.parse(readFileSync(path, 'utf-8')) as AIProviderConfigPatch
      this.cache = mergeConfig(DEFAULT_AI_CONFIG, raw)
    } catch (error) {
      logger.warn(
        `Failed to read AI config (${error instanceof Error ? error.message : error}); using defaults`,
        'AIConfig'
      )
      this.cache = { ...DEFAULT_AI_CONFIG }
    }
    return this.cache
  }

  set(patch: AIProviderConfigPatch): AIProviderConfig {
    const next = mergeConfig(this.get(), patch)
    this.cache = next
    try {
      writeFileSync(getConfigPath(), JSON.stringify(next, null, 2), 'utf-8')
    } catch (error) {
      logger.error(
        `Failed to persist AI config: ${error instanceof Error ? error.message : error}`,
        'AIConfig'
      )
    }
    return next
  }

  getOllamaBaseUrl(): string {
    return (this.get().ollama.baseUrl || DEFAULT_AI_CONFIG.ollama.baseUrl).replace(/\/+$/, '')
  }
}

export const aiConfigService = new AIConfigService()
