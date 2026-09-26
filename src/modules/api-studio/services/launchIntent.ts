/**
 * One-shot actions another screen (e.g. the welcome flow) can ask the API Studio page to run
 * on arrival, passed as react-router location state.
 */
export type ApiStudioLaunchIntent = 'new-request' | 'import'

export interface ApiStudioLaunchState {
  apiStudioIntent?: ApiStudioLaunchIntent
}

export function readLaunchIntent(state: unknown): ApiStudioLaunchIntent | null {
  if (!state || typeof state !== 'object') return null
  const intent = (state as ApiStudioLaunchState).apiStudioIntent
  return intent === 'new-request' || intent === 'import' ? intent : null
}

/** Public sample REST API so a first request works with no setup. Only called when the user presses Send. */
export const SAMPLE_REQUEST_URL = 'https://jsonplaceholder.typicode.com/todos/1'
