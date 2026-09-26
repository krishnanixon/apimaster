import type { AIChatMessage } from './types'

/** Keep local prompts bounded so small models respond faster. */
const LOCAL_MAX_NON_SYSTEM_MESSAGES = 16
const LOCAL_MAX_TOTAL_CHARS = 14_000
const LOCAL_MAX_SYSTEM_CHARS = 8_000

/**
 * Trim conversation history for local (Ollama) inference. System prompts are
 * kept but capped; only the most recent user/assistant turns are sent.
 */
export function trimMessagesForLocalModel(messages: AIChatMessage[]): AIChatMessage[] {
  const systemMessages = messages.filter((m) => m.role === 'system')
  let nonSystem = messages.filter((m) => m.role !== 'system')

  if (nonSystem.length > LOCAL_MAX_NON_SYSTEM_MESSAGES) {
    nonSystem = nonSystem.slice(-LOCAL_MAX_NON_SYSTEM_MESSAGES)
  }

  const cappedSystem = systemMessages.map((m) =>
    m.content.length > LOCAL_MAX_SYSTEM_CHARS
      ? { ...m, content: `${m.content.slice(0, LOCAL_MAX_SYSTEM_CHARS)}\n\n[context truncated for local model speed]` }
      : m
  )

  while (
    nonSystem.length > 1 &&
    totalChars([...cappedSystem, ...nonSystem]) > LOCAL_MAX_TOTAL_CHARS
  ) {
    nonSystem = nonSystem.slice(1)
  }

  return [...cappedSystem, ...nonSystem]
}

function totalChars(messages: AIChatMessage[]): number {
  return messages.reduce((sum, m) => sum + m.content.length, 0)
}
