import type { ApiRequest } from '../types/api.types'

/** Offline fallback: build a short description from method, URL, and payload shape. */
export function buildDescriptionFromPayload(request: ApiRequest): string {
  const lines: string[] = []
  const method = request.method || 'GET'
  const url = request.url?.trim() || '(no URL)'
  lines.push(`${method} ${url}`)

  if (request.name?.trim() && request.name !== 'Untitled Request' && request.name !== 'New Request') {
    lines.push(`Name: ${request.name.trim()}`)
  }

  if (request.auth?.type && request.auth.type !== 'none' && request.auth.type !== 'inherit') {
    lines.push(`Auth: ${request.auth.type}`)
  } else if (request.auth?.type === 'inherit') {
    lines.push('Auth: inherit from parent')
  }

  const enabledParams = (request.queryParams ?? []).filter((p) => p.enabled && p.key.trim())
  if (enabledParams.length > 0) {
    lines.push(`Query: ${enabledParams.map((p) => p.key).join(', ')}`)
  }

  const body = request.body
  if (body && body.type !== 'none') {
    if (body.type === 'json' && body.content.trim()) {
      try {
        const parsed = JSON.parse(body.content) as unknown
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          const keys = Object.keys(parsed as Record<string, unknown>)
          lines.push(
            keys.length > 0
              ? `JSON body fields: ${keys.slice(0, 12).join(', ')}${keys.length > 12 ? '…' : ''}`
              : 'JSON body: empty object'
          )
        } else if (Array.isArray(parsed)) {
          lines.push(`JSON body: array (${parsed.length} item${parsed.length === 1 ? '' : 's'})`)
        } else {
          lines.push(`JSON body: ${typeof parsed}`)
        }
      } catch {
        lines.push('JSON body: (invalid JSON — fix before send)')
      }
    } else if (body.type === 'form-data' && body.formData?.length) {
      const keys = body.formData.filter((f) => f.enabled && f.key.trim()).map((f) => f.key)
      if (keys.length) lines.push(`Form data: ${keys.join(', ')}`)
    } else if (body.type === 'x-www-form-urlencoded' && body.content.trim()) {
      lines.push('Body: URL-encoded form')
    } else if (body.type === 'text' && body.content.trim()) {
      lines.push(`Text body (${body.content.trim().length} chars)`)
    } else {
      lines.push(`Body type: ${body.type}`)
    }
  } else {
    lines.push('No request body')
  }

  return lines.join('\n')
}
