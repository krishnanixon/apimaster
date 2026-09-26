export interface MockTemplateContext {
  params: Record<string, string>
  query: Record<string, string>
  headers: Record<string, string>
  body: unknown
  method: string
  path: string
  host: string
}

const TEMPLATE_RE = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g

function getByPath(root: unknown, path: string): unknown {
  if (!path) return root
  const parts = path.split('.')
  let current: unknown = root
  for (const part of parts) {
    if (current === null || current === undefined) return undefined
    if (typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[part]
  }
  return current
}

function resolveToken(token: string, ctx: MockTemplateContext): string {
  const lower = token.toLowerCase()
  if (lower === 'method') return ctx.method
  if (lower === 'path') return ctx.path
  if (lower === 'host') return ctx.host

  if (lower.startsWith('params.')) {
    const v = ctx.params[lower.slice('params.'.length)] ?? ctx.params[token.slice('params.'.length)]
    return v ?? ''
  }
  if (lower.startsWith('query.')) {
    const key = token.slice('query.'.length)
    return ctx.query[key] ?? ctx.query[lower.slice('query.'.length)] ?? ''
  }
  if (lower.startsWith('headers.')) {
    const key = token.slice('headers.'.length)
    const headerKey = Object.keys(ctx.headers).find((h) => h.toLowerCase() === key.toLowerCase())
    return headerKey ? ctx.headers[headerKey] : ''
  }
  if (lower.startsWith('body.') || lower === 'body') {
    const bodyPath = lower === 'body' ? '' : token.slice('body.'.length)
    const value = getByPath(ctx.body, bodyPath)
    if (value === undefined || value === null) return ''
    if (typeof value === 'object') return JSON.stringify(value)
    return String(value)
  }

  // Shorthand: {{id}} → params.id
  if (ctx.params[token] !== undefined) return ctx.params[token]

  return ''
}

export function applyMockTemplates(template: string, ctx: MockTemplateContext): string {
  return template.replace(TEMPLATE_RE, (_match, token: string) => resolveToken(token, ctx))
}

export function parseRequestBody(raw: string, contentType: string | undefined): unknown {
  const trimmed = raw.trim()
  if (!trimmed) return {}
  const ct = (contentType ?? '').toLowerCase()
  if (ct.includes('application/json') || trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      return JSON.parse(trimmed) as unknown
    } catch {
      return { _raw: trimmed }
    }
  }
  return { _raw: trimmed }
}

export function parseQueryFromUrl(url: string): Record<string, string> {
  try {
    const u = new URL(url, 'http://mock.local')
    const out: Record<string, string> = {}
    u.searchParams.forEach((value, key) => {
      out[key] = value
    })
    return out
  } catch {
    return {}
  }
}
