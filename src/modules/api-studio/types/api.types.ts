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
  OPTIONS: 'text-slate-600 dark:text-slate-400'
}

export type RequestTab = 'params' | 'headers' | 'body' | 'auth' | 'pre-request' | 'tests' | 'notes' | 'settings'
export type ResponseTab = 'body' | 'headers' | 'cookies' | 'tests'
export type WorkspaceSplit = 'horizontal' | 'vertical'
