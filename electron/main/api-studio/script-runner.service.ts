/**
 * pm-style script runner for API Studio pre-request and test scripts.
 *
 * Scripts come from imported collections, so they are untrusted: they run in the QuickJS
 * sandbox (see script-sandbox.ts) and everything they hand back is re-validated here.
 */
import type {
  ApiTestResult,
  ApiTestRun,
  PreRequestScriptResult,
  RunApiTestsInput,
  RunPreRequestScriptInput,
  ScriptLogEntry
} from '@shared/types/api-studio'
import { runInSandbox } from './script-sandbox'

const MAX_RESULTS = 1000
const MAX_LOGS = 500
const MAX_TEXT_CHARS = 10_000
const MAX_VARIABLES = 10_000
const LOG_LEVELS = new Set<ScriptLogEntry['level']>(['log', 'info', 'warn', 'error'])

interface GuestOutput {
  results: ApiTestResult[]
  logs: ScriptLogEntry[]
  variables: Record<string, string>
  collectionVariables: Record<string, string>
  globals: Record<string, string>
}

function clip(value: unknown): string {
  const text = typeof value === 'string' ? value : String(value)
  return text.length > MAX_TEXT_CHARS ? `${text.slice(0, MAX_TEXT_CHARS)}…` : text
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

function sanitizeVariables(value: unknown, fallback: Record<string, string>): Record<string, string> {
  const source = asRecord(value)
  if (!source) return { ...fallback }
  const out: Record<string, string> = {}
  let count = 0
  for (const [key, v] of Object.entries(source)) {
    if (key === '__proto__' || typeof v !== 'string') continue
    if (++count > MAX_VARIABLES) break
    out[key] = v
  }
  return out
}

/** The guest's output is attacker-controlled JSON: keep only well-formed, bounded fields. */
function parseGuestOutput(
  raw: string | undefined,
  fallback: Pick<GuestOutput, 'variables' | 'collectionVariables' | 'globals'>
): GuestOutput {
  let parsed: Record<string, unknown> | null = null
  try {
    parsed = raw ? asRecord(JSON.parse(raw)) : null
  } catch {
    parsed = null
  }

  const results: ApiTestResult[] = []
  if (Array.isArray(parsed?.results)) {
    for (const item of parsed.results.slice(0, MAX_RESULTS)) {
      const entry = asRecord(item)
      if (!entry) continue
      const result: ApiTestResult = { name: clip(entry.name ?? ''), passed: entry.passed === true }
      if (!result.passed && entry.error !== undefined) result.error = clip(entry.error)
      results.push(result)
    }
  }

  const logs: ScriptLogEntry[] = []
  if (Array.isArray(parsed?.logs)) {
    for (const item of parsed.logs.slice(0, MAX_LOGS)) {
      const entry = asRecord(item)
      if (!entry) continue
      const level = LOG_LEVELS.has(entry.level as ScriptLogEntry['level']) ? (entry.level as ScriptLogEntry['level']) : 'log'
      logs.push({ level, message: clip(entry.message ?? '') })
    }
  }

  return {
    results,
    logs,
    variables: sanitizeVariables(parsed?.variables, fallback.variables),
    collectionVariables: sanitizeVariables(parsed?.collectionVariables, fallback.collectionVariables),
    globals: sanitizeVariables(parsed?.globals, fallback.globals)
  }
}

/** Scopes the caller passed in come back (possibly changed); ones it didn't pass stay out. */
function scopeResults(
  input: { collectionVariables?: Record<string, string>; globals?: Record<string, string> },
  output: GuestOutput
): Pick<PreRequestScriptResult, 'collectionVariables' | 'globals'> {
  return {
    ...(input.collectionVariables ? { collectionVariables: output.collectionVariables } : {}),
    ...(input.globals ? { globals: output.globals } : {})
  }
}

export class ScriptRunnerService {
  async runPreRequest(input: RunPreRequestScriptInput): Promise<PreRequestScriptResult> {
    const script = input.script?.trim()
    if (!script) return { variables: { ...input.variables } }

    const fallback = {
      variables: { ...input.variables },
      collectionVariables: { ...input.collectionVariables },
      globals: { ...input.globals }
    }
    try {
      const outcome = await runInSandbox({
        input: JSON.stringify({ event: 'prerequest', ...fallback }),
        script,
        filename: 'pre-request-script.js'
      })
      const output = parseGuestOutput(outcome.output, fallback)
      const logs = output.logs.length ? { logs: output.logs } : {}
      if (outcome.error) {
        // A failed pre-request script leaves the variables as they were.
        return { variables: fallback.variables, error: outcome.error, ...logs }
      }
      return { variables: output.variables, ...scopeResults(input, output), ...logs }
    } catch (e) {
      return {
        variables: fallback.variables,
        error: e instanceof Error ? e.message : 'Pre-request script failed'
      }
    }
  }

  async runTests(input: RunApiTestsInput): Promise<ApiTestRun> {
    const script = input.script?.trim()
    const fallback = {
      variables: { ...input.variables },
      collectionVariables: { ...input.collectionVariables },
      globals: { ...input.globals }
    }
    if (!script) return { results: [], ...(input.variables ? { variables: fallback.variables } : {}) }

    const response = input.response
    const guestInput = {
      event: 'test',
      requestName: input.request.name,
      ...fallback,
      request: {
        method: input.request.method,
        url: input.request.url,
        headers: Object.fromEntries(
          (input.request.headers ?? []).filter((h) => h.enabled && h.key).map((h) => [h.key, h.value])
        )
      },
      response: {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        headers: response.headers ?? {},
        body: response.data ?? '',
        responseTime: response.timeMs,
        responseSize: response.sizeBytes
      }
    }

    let output: GuestOutput
    let error: string | undefined
    try {
      const outcome = await runInSandbox({ input: JSON.stringify(guestInput), script, filename: 'test-script.js' })
      output = parseGuestOutput(outcome.output, fallback)
      error = outcome.error
    } catch (e) {
      output = parseGuestOutput(undefined, fallback)
      error = e instanceof Error ? e.message : 'Test script failed to run'
    }

    const results = [...output.results]
    if (error) results.push({ name: 'Script execution', passed: false, error })
    return {
      results,
      ...(input.variables ? { variables: output.variables } : {}),
      ...scopeResults(input, output),
      ...(output.logs.length ? { logs: output.logs } : {})
    }
  }
}

export const scriptRunnerService = new ScriptRunnerService()
