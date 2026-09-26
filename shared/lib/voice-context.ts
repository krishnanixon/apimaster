import type { VoiceMessage } from '../types/voice-assistant'

export interface VoiceContextTurn {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface BuildVoiceContextInput {
  systemInstructions: string
  messages: VoiceMessage[]
  maxMessages?: number
  maxChars?: number
}

const DEFAULT_MAX_MESSAGES = 24
const DEFAULT_MAX_CHARS = 24_000

/**
 * Builds a bounded prompt for the model. Older turns are dropped first;
 * a short summary placeholder is injected when history was trimmed.
 */
export function buildVoiceContext(input: BuildVoiceContextInput): VoiceContextTurn[] {
  const maxMessages = input.maxMessages ?? DEFAULT_MAX_MESSAGES
  const maxChars = input.maxChars ?? DEFAULT_MAX_CHARS

  const dialogue = input.messages
    .filter((m) => m.role === 'user' || m.role === 'assistant' || m.role === 'tool')
    .map((m): VoiceContextTurn => {
      if (m.role === 'tool') {
        return { role: 'assistant', content: `Tool result (${m.metadata?.toolName ?? 'tool'}): ${m.content}` }
      }
      return { role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }
    })

  let trimmed = dialogue
  let dropped = 0
  if (trimmed.length > maxMessages) {
    dropped = trimmed.length - maxMessages
    trimmed = trimmed.slice(-maxMessages)
  }

  while (trimmed.length > 1 && totalChars(trimmed) + input.systemInstructions.length > maxChars) {
    trimmed = trimmed.slice(1)
    dropped += 1
  }

  const system: VoiceContextTurn[] = [{ role: 'system', content: input.systemInstructions }]
  if (dropped > 0) {
    system.push({
      role: 'system',
      content: `Earlier conversation was trimmed (${dropped} older turns omitted). Continue using the remaining recent context.`
    })
  }

  return [...system, ...trimmed]
}

export function summarizeIfNeeded(messages: VoiceMessage[], maxChars: number): string | null {
  const chars = messages.reduce((sum, m) => sum + m.content.length, 0)
  if (chars <= maxChars) return null
  const recent = messages.slice(-8)
  const topics = recent
    .filter((m) => m.role === 'user')
    .map((m) => m.content.slice(0, 80))
    .filter(Boolean)
  if (topics.length === 0) return 'The conversation has been running for a while. Prefer concise answers.'
  return `Conversation summary so far. Recent user topics: ${topics.join('; ')}.`
}

function totalChars(turns: VoiceContextTurn[]): number {
  return turns.reduce((sum, t) => sum + t.content.length, 0)
}
