export interface LlmChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export function splitSystemPrompt(messages: LlmChatMessage[]): {
  system: string
  turns: Array<{ role: 'user' | 'assistant'; content: string }>
} {
  const systemParts: string[] = []
  const turns: Array<{ role: 'user' | 'assistant'; content: string }> = []
  for (const message of messages) {
    if (message.role === 'system') {
      if (message.content.trim()) systemParts.push(message.content)
      continue
    }
    turns.push({ role: message.role, content: message.content })
  }
  return { system: systemParts.join('\n\n'), turns }
}

/** Anthropic requires alternating user/assistant turns starting with user. */
export function toAnthropicMessages(
  messages: LlmChatMessage[]
): { system?: string; messages: Array<{ role: 'user' | 'assistant'; content: string }> } {
  const { system, turns } = splitSystemPrompt(messages)
  const normalized: Array<{ role: 'user' | 'assistant'; content: string }> = []
  for (const turn of turns) {
    const last = normalized[normalized.length - 1]
    if (last && last.role === turn.role) {
      last.content = `${last.content}\n\n${turn.content}`
    } else {
      normalized.push({ ...turn })
    }
  }
  if (normalized[0]?.role === 'assistant') {
    normalized.unshift({ role: 'user', content: '(continued)' })
  }
  return { system: system || undefined, messages: normalized }
}

export function toGeminiContents(
  messages: LlmChatMessage[]
): Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> {
  const { system, turns } = splitSystemPrompt(messages)
  const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = []
  const mapped = turns.map((turn) => ({
    role: (turn.role === 'assistant' ? 'model' : 'user') as 'user' | 'model',
    text: turn.content
  }))
  if (system) {
    const firstUser = mapped.find((item) => item.role === 'user')
    if (firstUser) firstUser.text = `${system}\n\n${firstUser.text}`
    else mapped.unshift({ role: 'user', text: system })
  }
  for (const item of mapped) {
    const last = contents[contents.length - 1]
    if (last && last.role === item.role) {
      last.parts[0].text = `${last.parts[0].text}\n\n${item.text}`
    } else {
      contents.push({ role: item.role, parts: [{ text: item.text }] })
    }
  }
  return contents
}
