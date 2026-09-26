import type { ApiExecutionResult } from '../../types/api-studio'
import type { AiAssertion, AiAssertionResult } from '../../types/ai-engineer'

function getJsonPath(obj: unknown, path: string): unknown {
  const parts = path.split('.').filter(Boolean)
  let cur: unknown = obj
  for (const part of parts) {
    if (!cur || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[part]
  }
  return cur
}

export function runAssertions(
  assertions: AiAssertion[],
  response: ApiExecutionResult,
  expectedStatus: number[]
): AiAssertionResult[] {
  const results: AiAssertionResult[] = []

  const statusAssertion: AiAssertion = { type: 'status', values: expectedStatus }
  const allAssertions = assertions.some((a) => a.type === 'status')
    ? assertions
    : [statusAssertion, ...assertions]

  let parsedBody: unknown
  if (response.contentType.includes('json') && response.data) {
    try {
      parsedBody = JSON.parse(response.data)
    } catch {
      parsedBody = undefined
    }
  }

  for (const assertion of allAssertions) {
    switch (assertion.type) {
      case 'status': {
        const passed = assertion.values.includes(response.status)
        results.push({
          assertion,
          passed,
          message: passed
            ? `Status ${response.status} is expected`
            : `Expected status in [${assertion.values.join(', ')}], got ${response.status}`
        })
        break
      }
      case 'jsonPath': {
        const value = getJsonPath(parsedBody, assertion.path)
        if (assertion.operator === 'exists') {
          const passed = value !== undefined && value !== null
          results.push({
            assertion,
            passed,
            message: passed ? `${assertion.path} exists` : `${assertion.path} is missing`
          })
        } else if (assertion.operator === 'equals') {
          const passed = JSON.stringify(value) === JSON.stringify(assertion.value)
          results.push({
            assertion,
            passed,
            message: passed ? `${assertion.path} equals expected value` : `${assertion.path} mismatch`
          })
        } else {
          const passed = typeof value === assertion.value
          results.push({
            assertion,
            passed,
            message: passed ? `${assertion.path} has type ${String(assertion.value)}` : `${assertion.path} wrong type`
          })
        }
        break
      }
      case 'header': {
        const key = Object.keys(response.headers).find(
          (h) => h.toLowerCase() === assertion.name.toLowerCase()
        )
        if (assertion.operator === 'exists') {
          const passed = Boolean(key)
          results.push({
            assertion,
            passed,
            message: passed ? `Header ${assertion.name} present` : `Header ${assertion.name} missing`
          })
        } else {
          const actual = key ? response.headers[key] : ''
          const passed = actual === assertion.value
          results.push({
            assertion,
            passed,
            message: passed ? `Header ${assertion.name} matches` : `Header ${assertion.name} mismatch`
          })
        }
        break
      }
      case 'bodyContains': {
        const passed = response.data.includes(assertion.value)
        results.push({
          assertion,
          passed,
          message: passed ? 'Body contains expected text' : 'Body missing expected text'
        })
        break
      }
    }
  }

  return results
}
