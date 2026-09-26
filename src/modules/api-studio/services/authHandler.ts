import type { KeyValuePair, RequestAuth } from '../types/api.types'

/**
 * Resolves the request-level auth config into concrete header/query entries.
 * Signed types (JWT, Digest, OAuth1, AWS, Hawk) are applied in the main process.
 */
export function applyAuth(
  auth: RequestAuth,
  headers: Record<string, string>,
  params: Record<string, string>
): { headers: Record<string, string>; params: Record<string, string> } {
  const nextHeaders = { ...headers }
  const nextParams = { ...params }

  switch (auth.type) {
    case 'bearer': {
      if (auth.bearerToken) nextHeaders['Authorization'] = `Bearer ${auth.bearerToken}`
      break
    }
    case 'basic': {
      if (auth.basicUsername || auth.basicPassword) {
        const token = base64Encode(`${auth.basicUsername ?? ''}:${auth.basicPassword ?? ''}`)
        nextHeaders['Authorization'] = `Basic ${token}`
      }
      break
    }
    case 'apiKey': {
      if (auth.apiKeyName && auth.apiKeyValue) {
        if (auth.apiKeyLocation === 'query') {
          nextParams[auth.apiKeyName] = auth.apiKeyValue
        } else {
          nextHeaders[auth.apiKeyName] = auth.apiKeyValue
        }
      }
      break
    }
    case 'oauth2': {
      if (auth.oauth2AccessToken) {
        nextHeaders['Authorization'] = `Bearer ${auth.oauth2AccessToken}`
      }
      break
    }
    case 'inherit':
    default:
      break
  }

  return { headers: nextHeaders, params: nextParams }
}

/** UTF-8 safe base64 encode — the renderer runs in a browser context without Node's Buffer. */
export function base64Encode(input: string): string {
  const utf8Bytes = encodeURIComponent(input).replace(/%([0-9A-F]{2})/g, (_, hex) =>
    String.fromCharCode(parseInt(hex, 16))
  )
  return btoa(utf8Bytes)
}

export function enabledEntries(pairs: KeyValuePair[]): Record<string, string> {
  const result: Record<string, string> = {}
  for (const pair of pairs) {
    if (pair.enabled && pair.key.trim()) result[pair.key] = pair.value
  }
  return result
}
