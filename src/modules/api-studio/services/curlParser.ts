import { v4 as uuidv4 } from 'uuid'
import type { ApiRequest, HttpMethod, KeyValuePair } from '../types/api.types'
import { createDefaultAuth, createDefaultBody, createEmptyKeyValue, splitUrlAndParams, syncPathParams } from './requestBuilder'

/** Tokenizes a shell-style command line, respecting quotes and line continuations. */
function tokenize(curl: string): string[] {
  const normalized = curl.replace(/\\\r?\n/g, ' ').trim()
  const tokens: string[] = []
  let current = ''
  let quote: '"' | "'" | null = null

  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i]
    if (quote) {
      if (ch === quote) {
        quote = null
      } else {
        current += ch
      }
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      continue
    }
    if (/\s/.test(ch)) {
      if (current) {
        tokens.push(current)
        current = ''
      }
      continue
    }
    current += ch
  }
  if (current) tokens.push(current)
  return tokens
}

function toKeyValue(pairs: [string, string][]): KeyValuePair[] {
  if (pairs.length === 0) return [createEmptyKeyValue()]
  return pairs.map(([key, value]) => ({ id: uuidv4(), key, value, enabled: true }))
}

/**
 * Deterministically parses a `curl` command into an ApiRequest. Supports the
 * flags Postman/Thunder Client commonly export: -X/--request, -H/--header,
 * -d/--data*, -u/--user, and a bare URL argument.
 */
export function parseCurl(curlCommand: string): ApiRequest {
  const tokens = tokenize(curlCommand).filter((t) => t !== 'curl')

  let method: HttpMethod = 'GET'
  let url = ''
  const headers: [string, string][] = []
  const dataParts: string[] = []
  let basicAuth: string | null = null
  let hasBody = false

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]

    if (token === '-X' || token === '--request') {
      method = (tokens[++i]?.toUpperCase() as HttpMethod) || 'GET'
    } else if (token === '-H' || token === '--header') {
      const raw = tokens[++i] ?? ''
      const idx = raw.indexOf(':')
      if (idx !== -1) headers.push([raw.slice(0, idx).trim(), raw.slice(idx + 1).trim()])
    } else if (
      token === '-d' ||
      token === '--data' ||
      token === '--data-raw' ||
      token === '--data-binary' ||
      token === '--data-urlencode'
    ) {
      dataParts.push(tokens[++i] ?? '')
      hasBody = true
      if (method === 'GET') method = 'POST'
    } else if (token === '-u' || token === '--user') {
      basicAuth = tokens[++i] ?? ''
    } else if (token === '-G' || token === '--get') {
      method = 'GET'
    } else if (token.startsWith('-')) {
      // Skip unsupported flags; consume a following value for flags known to take one.
      if (['-A', '--user-agent', '-e', '--referer', '-b', '--cookie', '--connect-timeout', '--max-time'].includes(token)) {
        i++
      }
    } else if (!url) {
      url = token
    }
  }

  const { base, params } = splitUrlAndParams(url)
  const bodyContent = dataParts.join('&')
  const contentTypeHeader = headers.find(([k]) => k.toLowerCase() === 'content-type')?.[1] ?? ''

  const request: ApiRequest = {
    id: uuidv4(),
    name: 'Imported from cURL',
    method,
    url: base,
    headers: toKeyValue(headers.filter(([k]) => k.toLowerCase() !== 'authorization')),
    queryParams: params.length > 0 ? params : [createEmptyKeyValue()],
    pathParams: syncPathParams(base),
    body: hasBody
      ? {
          type: contentTypeHeader.includes('json')
            ? 'json'
            : contentTypeHeader.includes('x-www-form-urlencoded') || !contentTypeHeader
              ? 'x-www-form-urlencoded'
              : 'text',
          content: bodyContent
        }
      : createDefaultBody(),
    auth: createDefaultAuth(),
    tests: '',
    folderId: null,
    updatedAt: new Date().toISOString()
  }

  const bearerHeader = headers.find(([k]) => k.toLowerCase() === 'authorization')?.[1]
  if (bearerHeader?.toLowerCase().startsWith('bearer ')) {
    request.auth = { type: 'bearer', bearerToken: bearerHeader.slice(7).trim() }
  } else if (basicAuth) {
    const [basicUsername, basicPassword = ''] = basicAuth.split(':')
    request.auth = { type: 'basic', basicUsername, basicPassword }
  }

  return request
}
