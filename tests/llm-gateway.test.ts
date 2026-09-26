import { describe, expect, it } from 'vitest'
import { estimateCostUsd, getModelLabel } from '../shared/lib/ai-models'
import {
  cloudModelConfigPatch,
  fallbackProviderId,
  normalizeCloudProvider,
  resolveProviderModel,
  selectProviderId
} from '../shared/lib/ai-routing'
import { toAnthropicMessages, toGeminiContents } from '../shared/lib/llm-messages'
import type { AIProviderConfig } from '../shared/types/ai'

const config = (patch: Partial<AIProviderConfig> = {}): AIProviderConfig => ({
  mode: 'openai',
  cloudProvider: 'openai',
  openai: { model: 'gpt-4o-mini', temperature: 0.7, maxTokens: 4096 },
  ollama: { baseUrl: 'http://localhost:11434', model: 'llama3.2' },
  anthropic: { model: 'claude-sonnet-4-5' },
  gemini: { model: 'gemini-2.5-flash' },
  deepseek: { model: 'deepseek-chat' },
  openrouter: { model: 'openai/gpt-4o-mini' },
  fallbackEnabled: true,
  promptCacheEnabled: true,
  creditGuardEnabled: true,
  dailyTokenBudget: 0,
  allowPaidFallback: false,
  ...patch
})

describe('LLM gateway routing', () => {
  it('uses the selected cloud provider in cloud mode', () => {
    expect(selectProviderId(config({ cloudProvider: 'anthropic' }), 'CHAT', 100)).toBe('anthropic')
    expect(selectProviderId(config({ cloudProvider: 'gemini' }), 'CHAT', 100)).toBe('gemini')
    expect(normalizeCloudProvider('deepseek')).toBe('deepseek')
    expect(normalizeCloudProvider('ollama')).toBe('openai')
  })

  it('keeps hybrid light work on Ollama and heavy work on the cloud provider', () => {
    const hybrid = config({ mode: 'hybrid', cloudProvider: 'openrouter' })
    expect(selectProviderId(hybrid, 'TITLE', 100)).toBe('ollama')
    expect(selectProviderId(hybrid, 'CHAT', 100)).toBe('ollama')
    expect(selectProviderId(hybrid, 'CHAT', 9000)).toBe('openrouter')
    expect(selectProviderId(hybrid, 'CODE_GENERATION', 3000)).toBe('openrouter')
  })

  it('resolves per-provider models and fallback targets', () => {
    const cfg = config({ cloudProvider: 'anthropic' })
    expect(resolveProviderModel(cfg, 'anthropic')).toBe('claude-sonnet-4-5')
    expect(resolveProviderModel(cfg, 'anthropic', 'gpt-4o-mini')).toBe('claude-sonnet-4-5')
    expect(resolveProviderModel(cfg, 'ollama')).toBe('llama3.2')
    expect(fallbackProviderId('anthropic', 'anthropic')).toBe('ollama')
    expect(fallbackProviderId('ollama', 'gemini')).toBe('gemini')
    expect(cloudModelConfigPatch('gemini', 'gemini-2.5-pro')).toEqual({ gemini: { model: 'gemini-2.5-pro' } })
  })
})

describe('provider message adapters', () => {
  it('lifts system prompts for Anthropic and keeps user-first turns', () => {
    const converted = toAnthropicMessages([
      { role: 'system', content: 'You are a copilot.' },
      { role: 'assistant', content: 'Hello' },
      { role: 'user', content: 'Fix this' }
    ])
    expect(converted.system).toBe('You are a copilot.')
    expect(converted.messages[0]?.role).toBe('user')
    expect(converted.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user'])
  })

  it('maps Gemini roles and prepends the system prompt to the first user turn', () => {
    const contents = toGeminiContents([
      { role: 'system', content: 'Be concise.' },
      { role: 'user', content: 'Summarize' },
      { role: 'assistant', content: 'OK' }
    ])
    expect(contents[0]).toEqual({
      role: 'user',
      parts: [{ text: 'Be concise.\n\nSummarize' }]
    })
    expect(contents[1]?.role).toBe('model')
  })
})

describe('cost tracking catalogs', () => {
  it('estimates spend for Claude, Gemini, and DeepSeek models', () => {
    expect(estimateCostUsd('claude-sonnet-4-5', 1_000_000, 0)).toBe(3)
    expect(estimateCostUsd('gemini-2.5-flash', 0, 1_000_000)).toBe(2.5)
    expect(estimateCostUsd('deepseek-chat', 1_000_000, 1_000_000)).toBeCloseTo(0.7)
    expect(getModelLabel('openai/gpt-4o-mini')).toContain('OpenRouter')
  })
})
