import type { ApiCollection, ApiExecutionResult, ApiRequest } from '../../types/api-studio'
import { redactExecutionResult, redactRequest } from '../redact-secrets'
import type { ApiSpec } from '../../types/ai-engineer'

/** Strip secrets before optional AI enrichment. */
export function sanitizeSpecForAi(spec: ApiSpec): ApiSpec {
  return {
    ...spec,
    endpoints: spec.endpoints.map((e) => ({
      ...e,
      description: e.description,
      requestBody: e.requestBody
        ? {
            ...e.requestBody,
            example: e.requestBody.example
          }
        : undefined
    }))
  }
}

export function sanitizeCollectionForAi(collection: ApiCollection): ApiCollection {
  return {
    ...collection,
    requests: collection.requests.map((r) => redactRequest(r))
  }
}

export function sanitizeResultForAi(result: ApiExecutionResult): ApiExecutionResult {
  return redactExecutionResult(result)
}

export function sanitizeRequestForAi(request: ApiRequest): ApiRequest {
  return redactRequest(request)
}
