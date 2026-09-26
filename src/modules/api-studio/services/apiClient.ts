/**
 * Renderer-facing API execution client. The actual network call happens in
 * the main process (see electron/main/api-studio/http-client.service.ts) so
 * requests are never subject to renderer CORS/webSecurity restrictions.
 */
import type { ApiCollection, ApiExecutionResult, ApiRequest, ResolvedHttpRequest } from '../types/api.types'
import { resolveRequest } from './requestBuilder'
import { applyEnvironmentVariables } from './environment'
import { applyParentInheritance } from './inheritance'

const DEFAULT_TIMEOUT_MS = 30_000

function normalizeUrl(url: string): string {
  const trimmed = url.trim()
  if (!trimmed) return trimmed
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
}

/** Resolves a request (parent inherit + env vars + auth + query) into its wire-ready form, without sending it. */
export function prepareRequest(
  request: ApiRequest,
  options?: { timeoutMs?: number; variables?: Record<string, string>; collection?: ApiCollection | null }
) {
  const inherited = applyParentInheritance(request, options?.collection)
  const withVariables = options?.variables ? applyEnvironmentVariables(inherited, options.variables) : inherited
  return resolveRequest(
    { ...withVariables, url: normalizeUrl(withVariables.url) },
    { timeoutMs: options?.timeoutMs ?? DEFAULT_TIMEOUT_MS }
  )
}

/** Executes an already-resolved request. Split out from `sendRequest` so callers can
 * know the `clientRequestId` synchronously (e.g. to store it for cancellation/staleness
 * checks) before awaiting the network round-trip. */
export async function executeResolved(resolved: ResolvedHttpRequest): Promise<ApiExecutionResult> {
  const response = await window.electronAPI.apiStudio.sendRequest(resolved)
  if (!response.success || !response.data) {
    return {
      ok: false,
      status: 0,
      statusText: '',
      headers: {},
      data: '',
      isBinary: false,
      contentType: '',
      timeMs: 0,
      sizeBytes: 0,
      error: response.error ?? 'Request failed'
    }
  }
  return response.data
}

export async function sendRequest(
  request: ApiRequest,
  options?: { timeoutMs?: number; variables?: Record<string, string>; collection?: ApiCollection | null }
): Promise<{ clientRequestId: string; result: ApiExecutionResult }> {
  const resolved = prepareRequest(request, options)
  const result = await executeResolved(resolved)
  return { clientRequestId: resolved.clientRequestId, result }
}

export async function cancelRequest(clientRequestId: string): Promise<void> {
  await window.electronAPI.apiStudio.cancelRequest(clientRequestId)
}
