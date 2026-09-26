/** Converts provider response envelopes into readable assistant text. */
export function normalizeAgentResponseText(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed.startsWith('{')) return raw
  try {
    const parsed = JSON.parse(trimmed) as { type?: unknown; text?: unknown; content?: unknown }
    if (parsed.type === 'response' && typeof parsed.text === 'string') return parsed.text
    if (typeof parsed.content === 'string') return parsed.content
  } catch {
    // Partial streaming JSON is handled elsewhere; preserve non-JSON text here.
  }
  return raw
}

