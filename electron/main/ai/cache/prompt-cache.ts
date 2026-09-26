import { createHash } from 'crypto'
import type { AIProviderId } from '@shared/types'
import type { AIChatMessage } from '../types'

interface CacheEntry {
  value: string
  expiresAt: number
}

const TTL_MS = 5 * 60 * 1000
const MAX_ENTRIES = 200

/**
 * Small TTL + LRU-ish prompt cache. Identical non-streaming prompts (titles,
 * summaries, cleanup) return the cached completion instead of re-calling the
 * model — avoiding duplicate API cost. Streaming chat is never cached.
 */
class PromptCache {
  private store = new Map<string, CacheEntry>()

  private key(providerId: AIProviderId, model: string, messages: AIChatMessage[]): string {
    const hash = createHash('sha256')
    hash.update(providerId)
    hash.update('\u0000')
    hash.update(model)
    for (const m of messages) {
      hash.update('\u0000')
      hash.update(m.role)
      hash.update('\u0000')
      hash.update(m.content)
    }
    return hash.digest('hex')
  }

  get(providerId: AIProviderId, model: string, messages: AIChatMessage[]): string | null {
    const key = this.key(providerId, model, messages)
    const entry = this.store.get(key)
    if (!entry) return null
    if (entry.expiresAt < Date.now()) {
      this.store.delete(key)
      return null
    }
    // Refresh recency.
    this.store.delete(key)
    this.store.set(key, entry)
    return entry.value
  }

  set(providerId: AIProviderId, model: string, messages: AIChatMessage[], value: string): void {
    if (!value.trim()) return
    const key = this.key(providerId, model, messages)
    this.store.set(key, { value, expiresAt: Date.now() + TTL_MS })
    if (this.store.size > MAX_ENTRIES) {
      const oldest = this.store.keys().next().value
      if (oldest) this.store.delete(oldest)
    }
  }

  clear(): void {
    this.store.clear()
  }
}

export const promptCache = new PromptCache()
