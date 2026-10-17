import type {
  ApiCollection,
  ApiRequest,
  ApiTestResult,
  CollectionRunnerItemResult,
  CollectionRunnerOptions,
  CollectionRunnerReport
} from '../types/api.types'
import { prepareRequest, executeResolved, finishExecution } from './apiClient'
import { collectFolderTreeRequests } from './folderTree'
import { applyParentInheritance } from './inheritance'

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function runPreRequestScript(
  request: ApiRequest,
  variables: Record<string, string>
): Promise<{ variables: Record<string, string>; error?: string }> {
  if (!request.preRequestScript?.trim()) return { variables }
  const res = await window.electronAPI.apiStudio.runPreRequest({
    script: request.preRequestScript,
    variables
  })
  if (!res.success || !res.data) {
    return { variables, error: res.error ?? 'Pre-request script failed' }
  }
  return res.data
}

async function runTests(
  request: ApiRequest,
  response: Awaited<ReturnType<typeof executeResolved>>,
  variables: Record<string, string>
): Promise<{ results: ApiTestResult[]; variables: Record<string, string> }> {
  if (!request.tests?.trim()) return { results: [], variables }
  const res = await window.electronAPI.apiStudio.runTests({
    script: request.tests,
    request,
    response,
    variables
  })
  return res.success && res.data ? { results: res.data.results, variables: res.data.variables ?? variables } : { results: [], variables }
}

function isRequestFailed(
  response: Awaited<ReturnType<typeof executeResolved>>,
  testResults: ApiTestResult[]
): boolean {
  if (response.error && !response.aborted) return true
  if (response.status >= 400) return true
  return testResults.some((t) => !t.passed)
}

export interface RunnerProgress {
  current: number
  total: number
  currentName: string
}

export async function runRequestList(
  requests: ApiRequest[],
  options: CollectionRunnerOptions & {
    collectionName: string
    scopeLabel: string
    variables?: Record<string, string>
    collection?: ApiCollection
    onProgress?: (progress: RunnerProgress) => void
    shouldAbort?: () => boolean
  }
): Promise<CollectionRunnerReport> {
  const started = performance.now()
  const results: CollectionRunnerItemResult[] = []
  let passed = 0
  let failed = 0
  let stoppedEarly = false
  let runtimeVariables = { ...(options.variables ?? {}) }

  for (let i = 0; i < requests.length; i++) {
    if (options.shouldAbort?.()) {
      stoppedEarly = true
      break
    }

    const request = options.collection
      ? applyParentInheritance(requests[i], options.collection)
      : requests[i]
    options.onProgress?.({ current: i + 1, total: requests.length, currentName: request.name })

    const pre = await runPreRequestScript(request, runtimeVariables)
    runtimeVariables = pre.variables

    if (pre.error) {
      failed++
      results.push({
        requestId: request.id,
        requestName: request.name,
        method: request.method,
        url: request.url,
        ok: false,
        status: 0,
        timeMs: 0,
        error: pre.error,
        testResults: []
      })
      if (options.stopOnFail) {
        stoppedEarly = true
        break
      }
      if (options.delayMs > 0 && i < requests.length - 1) await sleep(options.delayMs)
      continue
    }

    if (!request.url.trim()) {
      failed++
      results.push({
        requestId: request.id,
        requestName: request.name,
        method: request.method,
        url: request.url,
        ok: false,
        status: 0,
        timeMs: 0,
        error: 'Missing URL',
        testResults: []
      })
      if (options.stopOnFail) {
        stoppedEarly = true
        break
      }
      if (options.delayMs > 0 && i < requests.length - 1) await sleep(options.delayMs)
      continue
    }

    let resolved
    try {
      resolved = prepareRequest(request, {
        variables: runtimeVariables,
        timeoutMs: request.timeoutMs
      })
    } catch (error) {
      failed++
      results.push({
        requestId: request.id,
        requestName: request.name,
        method: request.method,
        url: request.url,
        ok: false,
        status: 0,
        timeMs: 0,
        error: error instanceof Error ? error.message : 'Could not prepare the request',
        testResults: []
      })
      if (options.stopOnFail) {
        stoppedEarly = true
        break
      }
      if (options.delayMs > 0 && i < requests.length - 1) await sleep(options.delayMs)
      continue
    }
    const reqStarted = performance.now()
    const response = finishExecution(request, await executeResolved(resolved))
    const timeMs = Math.round(performance.now() - reqStarted)
    // Later requests see what the tests saved (a login's token, a created id).
    const tests = await runTests(request, response, runtimeVariables)
    runtimeVariables = tests.variables
    const testResults = tests.results
    const requestFailed = isRequestFailed(response, testResults)

    if (requestFailed) failed++
    else passed++

    results.push({
      requestId: request.id,
      requestName: request.name,
      method: request.method,
      url: request.url,
      ok: !requestFailed,
      status: response.status,
      timeMs,
      error: response.error,
      testResults
    })

    if (requestFailed && options.stopOnFail) {
      stoppedEarly = true
      break
    }

    if (options.delayMs > 0 && i < requests.length - 1) await sleep(options.delayMs)
  }

  return {
    collectionName: options.collectionName,
    scopeLabel: options.scopeLabel,
    total: requests.length,
    passed,
    failed,
    durationMs: Math.round(performance.now() - started),
    results,
    stoppedEarly
  }
}

export function collectCollectionRequests(collection: ApiCollection, folderId?: string | null): ApiRequest[] {
  if (folderId) {
    return collection.requests.filter((r) => r.folderId === folderId)
  }
  return [...collection.requests]
}

export function collectFolderRequests(collection: ApiCollection, folderId: string): ApiRequest[] {
  return collectFolderTreeRequests(collection.folders, collection.requests, folderId)
}
