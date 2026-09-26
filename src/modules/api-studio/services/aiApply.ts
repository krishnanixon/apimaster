import { v4 as uuidv4 } from 'uuid'
import { createEmptyKeyValue, syncPathParams } from './requestBuilder'
import type { ApiRequest, GeneratedApiRequestResult, KeyValuePair } from '../types/api.types'

function toPairs(entries: { key: string; value: string }[]): KeyValuePair[] {
  const pairs = entries
    .filter((e) => e.key.trim())
    .map((e) => ({ id: uuidv4(), key: e.key, value: e.value, enabled: true }))
  return pairs.length > 0 ? [...pairs, createEmptyKeyValue()] : [createEmptyKeyValue()]
}

export function applyGeneratedRequest(result: GeneratedApiRequestResult): Partial<ApiRequest> {
  const { request } = result
  const url = request.url || ''
  const patch: Partial<ApiRequest> = {
    name: request.name,
    method: request.method,
    url,
    headers: toPairs(request.headers),
    queryParams: toPairs(request.queryParams),
    pathParams: syncPathParams(url),
    body: request.body,
    auth: request.auth
  }
  const notes = result.notes?.trim()
  if (notes) patch.description = notes
  return patch
}
