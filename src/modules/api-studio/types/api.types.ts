export type {
  ApiCollection,
  ApiEnvironment,
  ApiExecutionResult,
  ApiFolder,
  ApiHistoryEntry,
  ApiRequest,
  ApiTestResult,
  AuthType,
  CollectionRunnerItemResult,
  CollectionRunnerOptions,
  CollectionRunnerReport,
  FormDataField,
  GeneratedApiRequestResult,
  GraphQLRequestConfig,
  GraphQLResponseError,
  GraphQLResponseInfo,
  GraphQLSchemaMetadata,
  HawkAlgorithm,
  HttpMethod,
  JwtAlgorithm,
  KeyValuePair,
  OAuth1SignatureMethod,
  OAuth2GrantType,
  RequestAuth,
  RequestBody,
  RequestBodyType,
  RequestType,
  ResolvedHttpRequest
} from '@shared/types/api-studio'

export { isSignedAuthType, SIGNED_AUTH_TYPES } from '@shared/types/api-studio'

export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const

export const METHOD_COLORS: Record<string, string> = {
  GET: 'text-emerald-600 dark:text-emerald-400',
  POST: 'text-amber-600 dark:text-amber-400',
  PUT: 'text-blue-600 dark:text-blue-400',
  PATCH: 'text-purple-600 dark:text-purple-400',
  DELETE: 'text-red-600 dark:text-red-400',
  HEAD: 'text-slate-600 dark:text-slate-400',
  OPTIONS: 'text-slate-600 dark:text-slate-400',
  GQL: 'text-pink-600 dark:text-pink-400',
  WS: 'text-cyan-600 dark:text-cyan-400'
}

export function requestProtocolLabel(request: { requestType?: string; method: string }): string {
  if (request.requestType === 'websocket') return 'WS'
  if (request.requestType === 'graphql') return 'GQL'
  return request.method
}

export type RequestTab =
  | 'params'
  | 'headers'
  | 'body'
  | 'auth'
  | 'pre-request'
  | 'tests'
  | 'notes'
  | 'settings'
  | 'query'
  | 'variables'
export type ResponseTab = 'body' | 'headers' | 'cookies' | 'tests' | 'errors'
export type WorkspaceSplit = 'horizontal' | 'vertical'
