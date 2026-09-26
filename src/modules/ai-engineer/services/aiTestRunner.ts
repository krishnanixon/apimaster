import { v4 as uuidv4 } from 'uuid'
import type { AiGeneratedTest, AiTestEvidence, AiTestResult, AiTestRun } from '@shared/types/ai-engineer'
import type { ApiCollection, ApiRequest } from '@shared/types/api-studio'
import { runAssertions } from '@shared/lib/ai-engineer/assertions'
import { canAutoRun } from '@shared/lib/ai-engineer/execution-policy'
import type { AiEngineerConfig } from '@shared/types/ai-engineer'
import { prepareRequest, executeResolved, finishExecution } from '@/modules/api-studio/services/apiClient'
import { createEmptyKeyValue, createDefaultAuth, createDefaultBody } from '@/modules/api-studio/services/requestBuilder'
import { redactExecutionResult } from '@shared/lib/redact-secrets'

export interface AiTestRunProgress {
  current: number
  total: number
  testName: string
}

function testToRequest(test: AiGeneratedTest): ApiRequest {
  const queryString = Object.entries(test.query)
    .filter(([, v]) => v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&')
  const url = queryString && !test.url.includes('?') ? `${test.url}?${queryString}` : test.url

  return {
    id: test.id,
    name: test.name,
    method: test.method,
    url,
    headers: [
      ...Object.entries(test.headers).map(([key, value]) => ({
        id: uuidv4(),
        key,
        value,
        enabled: true
      })),
      createEmptyKeyValue()
    ],
    queryParams: [createEmptyKeyValue()],
    pathParams: [],
    body:
      test.bodyType === 'json'
        ? { type: 'json', content: test.body ?? '{}' }
        : test.bodyType === 'text'
          ? { type: 'text', content: test.body ?? '' }
          : createDefaultBody(),
    auth: createDefaultAuth(),
    tests: '',
    preRequestScript: '',
    description: test.reason,
    requestType: 'http',
    folderId: null,
    timeoutMs: 30_000,
    updatedAt: new Date().toISOString()
  }
}

function buildEvidence(request: ApiRequest, response: ReturnType<typeof finishExecution> extends infer R ? R : never): AiTestEvidence[] {
  const redacted = redactExecutionResult(response)
  return [
    { kind: 'request', label: 'Request', value: `${request.method} ${request.url}` },
    { kind: 'response', label: 'Status', value: String(redacted.status) },
    {
      kind: 'response',
      label: 'Body',
      value: redacted.isBinary ? '[binary]' : redacted.data.slice(0, 2000)
    }
  ]
}

export async function runAiTestSuite(options: {
  suiteId: string
  analysisId: string
  name: string
  tests: AiGeneratedTest[]
  config: AiEngineerConfig
  variables?: Record<string, string>
  approvedMutations: boolean
  collection?: ApiCollection | null
  onProgress?: (p: AiTestRunProgress) => void
  shouldAbort?: () => boolean
}): Promise<AiTestRun> {
  const startedAt = new Date().toISOString()
  const run: AiTestRun = {
    id: uuidv4(),
    suiteId: options.suiteId,
    analysisId: options.analysisId,
    name: options.name,
    startedAt,
    status: 'running',
    total: options.tests.length,
    passed: 0,
    failed: 0,
    skipped: 0,
    errors: 0,
    results: [],
    failureAnalyses: [],
    approvedMutations: options.approvedMutations
  }

  for (let i = 0; i < options.tests.length; i++) {
    if (options.shouldAbort?.()) {
      run.status = 'cancelled'
      break
    }

    const test = options.tests[i]
    options.onProgress?.({ current: i + 1, total: options.tests.length, testName: test.name })

    if (!canAutoRun(test, options.config, options.approvedMutations)) {
      run.skipped++
      run.results.push({
        testId: test.id,
        testName: test.name,
        status: 'skipped',
        statusCode: 0,
        durationMs: 0,
        assertionsPassed: 0,
        assertionsFailed: 0,
        assertionResults: [],
        evidence: [],
        skipReason: 'Requires approval (mutation or elevated risk)'
      })
      continue
    }

    try {
      const request = testToRequest(test)
      const resolved = prepareRequest(request, {
        variables: options.variables,
        collection: options.collection ?? null
      })
      const raw = await executeResolved(resolved)
      const response = finishExecution(request, raw)
      const assertionResults = runAssertions(test.assertions, response, test.expectedStatus)
      const failed = assertionResults.filter((a) => !a.passed).length
      const passed = assertionResults.length - failed
      const status =
        response.error && !response.aborted ? 'error' : failed > 0 || !test.expectedStatus.includes(response.status) ? 'failed' : 'passed'

      if (status === 'passed') run.passed++
      else if (status === 'skipped') run.skipped++
      else if (status === 'error') run.errors++
      else run.failed++

      run.results.push({
        testId: test.id,
        testName: test.name,
        status,
        statusCode: response.status,
        durationMs: response.timeMs,
        assertionsPassed: passed,
        assertionsFailed: failed,
        assertionResults,
        evidence: buildEvidence(request, response),
        error: response.error
      })
    } catch (e) {
      run.errors++
      run.results.push({
        testId: test.id,
        testName: test.name,
        status: 'error',
        statusCode: 0,
        durationMs: 0,
        assertionsPassed: 0,
        assertionsFailed: 0,
        assertionResults: [],
        evidence: [],
        error: e instanceof Error ? e.message : 'Execution error'
      })
    }
  }

  run.status = run.status === 'cancelled' ? 'cancelled' : 'completed'
  run.finishedAt = new Date().toISOString()
  return run
}
