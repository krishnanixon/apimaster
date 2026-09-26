import type { ApiEnvironment, ApiRequest, KeyValuePair, RequestAuth } from '../types/api.types'

const VARIABLE_PATTERN = /\{\{\s*([\w.-]+)\s*\}\}/g

export function enabledVariableMap(variables: KeyValuePair[]): Record<string, string> {
  const map: Record<string, string> = {}
  for (const v of variables) {
    if (v.enabled && v.key.trim()) map[v.key.trim()] = v.value
  }
  return map
}

/** Replaces every `{{key}}` occurrence in `input` using `variables`. Unknown keys are left untouched. */
export function substituteVariables(input: string, variables: Record<string, string>): string {
  if (!input) return input
  return input.replace(VARIABLE_PATTERN, (match, key: string) => (key in variables ? variables[key] : match))
}

function substitutePairs(pairs: KeyValuePair[], variables: Record<string, string>): KeyValuePair[] {
  return pairs.map((p) => ({ ...p, key: substituteVariables(p.key, variables), value: substituteVariables(p.value, variables) }))
}

function substituteAuth(auth: RequestAuth, variables: Record<string, string>): RequestAuth {
  const next = { ...auth }
  for (const [key, value] of Object.entries(next)) {
    if (typeof value === 'string') {
      ;(next as Record<string, unknown>)[key] = substituteVariables(value, variables)
    }
  }
  return next
}

/**
 * Applies `{{variable}}` substitution across every string field of a request
 * (url, headers, params, body content, auth) before it's resolved/sent.
 * Returns a new `ApiRequest`; the original is left untouched.
 */
export function applyEnvironmentVariables(request: ApiRequest, variables: Record<string, string>): ApiRequest {
  if (Object.keys(variables).length === 0) return request

  return {
    ...request,
    url: substituteVariables(request.url, variables),
    headers: substitutePairs(request.headers, variables),
    queryParams: substitutePairs(request.queryParams, variables),
    pathParams: request.pathParams ? substitutePairs(request.pathParams, variables) : request.pathParams,
    body: {
      ...request.body,
      content: substituteVariables(request.body.content, variables),
      formData: request.body.formData?.map((f) => ({
        ...f,
        key: substituteVariables(f.key, variables),
        value: substituteVariables(f.value, variables)
      }))
    },
    auth: substituteAuth(request.auth, variables)
  }
}

export function createEmptyEnvironment(name = 'New Environment'): Omit<ApiEnvironment, 'id'> {
  const now = new Date().toISOString()
  return { name, variables: [], createdAt: now, updatedAt: now }
}

/** Returns every `{{key}}` token referenced by a request, for "undefined variable" hints. */
export function extractVariableNames(request: ApiRequest): string[] {
  const names = new Set<string>()
  const scan = (value?: string) => {
    if (!value) return
    for (const match of value.matchAll(VARIABLE_PATTERN)) names.add(match[1])
  }
  scan(request.url)
  request.headers.forEach((h) => (scan(h.key), scan(h.value)))
  request.queryParams.forEach((p) => (scan(p.key), scan(p.value)))
  request.pathParams?.forEach((p) => (scan(p.key), scan(p.value)))
  scan(request.body.content)
  for (const value of Object.values(request.auth)) {
    if (typeof value === 'string') scan(value)
  }
  return [...names]
}
