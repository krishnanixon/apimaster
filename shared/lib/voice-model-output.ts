export interface ParsedVoiceModelOutput {
  text: string
  toolName?: string
  toolInput?: Record<string, unknown>
  findings?: Array<Record<string, unknown>>
}

export function parseVoiceModelOutput(text: string): ParsedVoiceModelOutput {
  const trimmed = text.trim()
  const parsed = extractJsonObject(trimmed)
  if (parsed && typeof parsed === 'object' && parsed !== null && 'type' in parsed) {
    const value = parsed as {
      type?: string
      name?: unknown
      input?: unknown
      text?: unknown
      findings?: unknown
    }
    if (value.type === 'tool_call' && typeof value.name === 'string') {
      return {
        text: '',
        toolName: value.name,
        toolInput: value.input && typeof value.input === 'object' && !Array.isArray(value.input)
          ? (value.input as Record<string, unknown>)
          : {}
      }
    }
    if (value.type === 'response' && typeof value.text === 'string') {
      return {
        text: value.text,
        findings: Array.isArray(value.findings) ? (value.findings as Array<Record<string, unknown>>) : undefined
      }
    }
  }
  // Truncated or slightly malformed {"type":"response","text":"..."} must not be spoken as raw JSON.
  const loose = extractLooseResponseText(trimmed)
  if (loose !== null) return { text: loose }
  return { text: trimmed }
}

function extractLooseResponseText(text: string): string | null {
  if (!/^\s*(?:```(?:json)?\s*)?\{/.test(text) || !/"type"\s*:\s*"response"/.test(text)) return null
  const match = /"text"\s*:\s*"((?:[^"\\]|\\.)*)/.exec(text)
  if (!match) return null
  try {
    return (JSON.parse(`"${match[1]}"`) as string).trim()
  } catch {
    return match[1].replace(/\\n/g, ' ').replace(/\\"/g, '"').trim()
  }
}

function extractJsonObject(text: string): unknown | null {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    return JSON.parse(text.slice(start, end + 1)) as unknown
  } catch {
    return null
  }
}
