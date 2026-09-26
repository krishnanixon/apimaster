/** Incremental preview of agent JSON/text while a completion is still streaming. */

export type AgentStreamPreview = {
  mode: 'text' | 'tool' | 'json-pending'
  visible: string
}

function stripLeadingFence(raw: string): string {
  return raw.replace(/^\s*```(?:json)?\s*/i, '')
}

/** Decode a JSON string prefix that may still be incomplete. */
export function unescapePartialJsonString(body: string): string {
  let out = ''
  for (let i = 0; i < body.length; i++) {
    const ch = body[i]
    if (ch === '"') break
    if (ch === '\\') {
      const next = body[i + 1]
      if (next === undefined) break
      if (next === 'u') {
        const hex = body.slice(i + 2, i + 6)
        if (hex.length < 4) break
        const code = Number.parseInt(hex, 16)
        if (Number.isNaN(code)) break
        out += String.fromCharCode(code)
        i += 5
        continue
      }
      const map: Record<string, string> = { n: '\n', t: '\t', r: '\r', '"': '"', '\\': '\\', '/': '/' }
      out += map[next] ?? next
      i += 1
      continue
    }
    out += ch
  }
  return out
}

/**
 * Turns a partial model stream into UI text. Tool-call JSON is hidden until complete;
 * `{"type":"response","text":"..."}` streams the text field as it grows.
 */
export function previewStreamingAgentOutput(raw: string): AgentStreamPreview {
  const trimmed = stripLeadingFence(raw).trimStart()
  if (!trimmed) return { mode: 'json-pending', visible: '' }

  const jsonStart = trimmed.indexOf('{')
  if (jsonStart > 0) {
    return { mode: 'text', visible: trimmed.slice(0, jsonStart) }
  }
  if (jsonStart !== 0) {
    return { mode: 'text', visible: trimmed }
  }

  if (/"type"\s*:\s*"tool_call"/.test(trimmed)) {
    return { mode: 'tool', visible: '' }
  }

  const textField = /"type"\s*:\s*"response"[\s\S]*?"text"\s*:\s*"/.exec(trimmed)
  if (textField) {
    const start = textField.index + textField[0].length
    return { mode: 'text', visible: unescapePartialJsonString(trimmed.slice(start)) }
  }

  if (/"type"\s*:\s*"response"/.test(trimmed) || /^\{[\s\n]*$/.test(trimmed) || /"type"\s*:/.test(trimmed)) {
    return { mode: 'json-pending', visible: '' }
  }

  return { mode: 'text', visible: trimmed }
}
