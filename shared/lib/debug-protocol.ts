const LISTENING = /Debugger listening on (ws:\/\/\S+)/i

export function parseInspectorWebSocketUrl(output: string): string | null {
  const match = LISTENING.exec(output)
  return match?.[1] ?? null
}

export function pathToBreakpointRegex(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/')
  const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return escaped.replace(/\//g, '[/\\\\]')
}
