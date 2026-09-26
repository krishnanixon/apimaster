/**
 * Sandboxed pm-style script runner for API Studio pre-request and test scripts.
 */
import vm from 'node:vm'
import type {
  ApiExecutionResult,
  ApiRequest,
  ApiTestResult,
  PreRequestScriptResult,
  RunApiTestsInput,
  RunPreRequestScriptInput
} from '@shared/types/api-studio'

const SCRIPT_TIMEOUT_MS = 2000

function createEnvironmentApi(variables: Record<string, string>) {
  const store = { ...variables }
  return {
    get: (key: string) => store[key],
    set: (key: string, value: string) => {
      store[key] = String(value)
    },
    unset: (key: string) => {
      delete store[key]
    },
    toJSON: () => ({ ...store }),
    _snapshot: () => ({ ...store })
  }
}

export class ScriptRunnerService {
  runPreRequest(input: RunPreRequestScriptInput): PreRequestScriptResult {
    const script = input.script?.trim()
    if (!script) return { variables: { ...input.variables } }

    const environment = createEnvironmentApi(input.variables)
    const variables = {
      get: (key: string) => environment.get(key),
      set: (key: string, value: string) => environment.set(key, value),
      unset: (key: string) => environment.unset(key)
    }

    const pm = { environment, variables }

    try {
      const context = vm.createContext({ pm, console: { log: () => {}, error: () => {} } })
      const wrapped = `(function(){\n${script}\n})()`
      const compiled = new vm.Script(wrapped, { filename: 'api-studio-pre-request.js' })
      compiled.runInContext(context, { timeout: SCRIPT_TIMEOUT_MS })
      return { variables: environment._snapshot() }
    } catch (e) {
      return {
        variables: { ...input.variables },
        error: e instanceof Error ? e.message : 'Pre-request script failed'
      }
    }
  }

  runTests(input: RunApiTestsInput): ApiTestResult[] {
    const results: ApiTestResult[] = []
    const script = input.script?.trim()
    if (!script) return results

    let responseJson: unknown = undefined
    let jsonParseError: Error | null = null
    try {
      responseJson = input.response.data ? JSON.parse(input.response.data) : undefined
    } catch (e) {
      jsonParseError = e instanceof Error ? e : new Error('Invalid JSON')
    }

    const pm = {
      response: {
        status: input.response.status,
        ok: input.response.ok,
        headers: input.response.headers,
        responseTime: input.response.timeMs,
        text: () => input.response.data,
        json: () => {
          if (jsonParseError) throw jsonParseError
          return responseJson
        }
      },
      request: {
        method: input.request.method,
        url: input.request.url
      },
      test: (name: string, fn: () => void) => {
        try {
          fn()
          results.push({ name, passed: true })
        } catch (e) {
          results.push({ name, passed: false, error: e instanceof Error ? e.message : String(e) })
        }
      },
      expect: (actual: unknown) => ({
        to: {
          equal: (expected: unknown) => {
            if (actual !== expected) {
              throw new Error(`Expected ${JSON.stringify(actual)} to equal ${JSON.stringify(expected)}`)
            }
          },
          be: {
            ok: () => {
              if (!actual) throw new Error(`Expected value to be truthy, got ${JSON.stringify(actual)}`)
            }
          }
        }
      })
    }

    try {
      const context = vm.createContext({ pm, console: { log: () => {}, error: () => {} } })
      const wrapped = `(function(){\n${script}\n})()`
      const compiled = new vm.Script(wrapped, { filename: 'api-studio-test.js' })
      compiled.runInContext(context, { timeout: SCRIPT_TIMEOUT_MS })
    } catch (e) {
      results.push({
        name: 'Script execution',
        passed: false,
        error: e instanceof Error ? e.message : 'Test script failed to run'
      })
    }

    return results
  }
}

export const scriptRunnerService = new ScriptRunnerService()
