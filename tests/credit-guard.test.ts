import { describe, expect, it } from 'vitest'
import {
  clampConnectionMaxTokens,
  clampRequestMaxTokens,
  CREDIT_MAX_TOKENS,
  CREDIT_MIN_TOKENS,
  resolveSectionMaxTokens,
  shouldAddFallback
} from '../shared/lib/ai-credit-guard'
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

describe('AI credit guard', () => {
  it('clamps connection max_tokens at connect time', () => {
    expect(clampConnectionMaxTokens(16384)).toBe(CREDIT_MAX_TOKENS)
    expect(clampConnectionMaxTokens(10)).toBe(CREDIT_MIN_TOKENS)
    expect(clampConnectionMaxTokens(undefined)).toBe(4096)
  })

  it('never lets a request exceed the connection cap', () => {
    expect(clampRequestMaxTokens(8000, 4096)).toBe(4096)
    expect(clampRequestMaxTokens(512, 4096)).toBe(512)
    expect(clampRequestMaxTokens(undefined, 2048)).toBe(2048)
  })

  it('does not retry a failed paid provider while credit guard is on', () => {
    expect(shouldAddFallback(config(), 'openai')).toBe(false)
    expect(shouldAddFallback(config(), 'anthropic')).toBe(false)
  })

  it('does not fail over from local to paid unless allowPaidFallback is on', () => {
    expect(shouldAddFallback(config(), 'ollama')).toBe(false)
    expect(shouldAddFallback(config({ allowPaidFallback: true }), 'ollama')).toBe(true)
  })

  it('keeps classic fallback when credit guard is off', () => {
    const open = config({ creditGuardEnabled: false })
    expect(shouldAddFallback(open, 'openai')).toBe(true)
    expect(shouldAddFallback(open, 'ollama')).toBe(true)
  })

  it('caps document section completions below the oversized heuristic', () => {
    const capped = resolveSectionMaxTokens(2000, 16384, 4096)
    expect(capped).toBeLessThanOrEqual(4096)
    expect(capped).toBeGreaterThanOrEqual(CREDIT_MIN_TOKENS)
  })
})
