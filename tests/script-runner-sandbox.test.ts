import { describe, expect, it } from 'vitest'
import { ScriptRunnerService } from '../electron/main/api-studio/script-runner.service'
import { runInSandbox } from '../electron/main/api-studio/script-sandbox'
import type { ApiExecutionResult, ApiRequest, ApiTestRun } from '../shared/types/api-studio'

const runner = new ScriptRunnerService()

const request = {
  id: 'r1',
  name: 'Get user',
  method: 'GET',
  url: 'https://api.example.com/users/1',
  headers: [{ id: 'h1', key: 'Accept', value: 'application/json', enabled: true }],
  queryParams: [],
  body: { type: 'none', content: '' },
  auth: { type: 'none' },
  updatedAt: '2026-10-17T00:00:00.000Z'
} as unknown as ApiRequest

function response(overrides: Partial<ApiExecutionResult> = {}): ApiExecutionResult {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: { 'Content-Type': 'application/json', 'X-Request-Id': 'abc' },
    data: JSON.stringify({ id: 1, name: 'Ada', roles: ['admin', 'dev'], profile: { age: 36 } }),
    isBinary: false,
    contentType: 'application/json',
    timeMs: 42,
    sizeBytes: 64,
    ...overrides
  }
}

function runTests(script: string, extra: Partial<Parameters<ScriptRunnerService['runTests']>[0]> = {}): Promise<ApiTestRun> {
  return runner.runTests({ script, request, response: response(), ...extra })
}

/** Every escape attempt reports what it reached; none of it may be the host's `process`. */
const ESCAPE_ATTEMPTS: Record<string, string> = {
  'pm.test.constructor': "return pm.test.constructor('return process')()",
  'pm.expect.constructor': "return pm.expect.constructor('return process')()",
  'this.constructor.constructor': "return this.constructor.constructor('return process')()",
  'pm.environment.get.constructor': "return pm.environment.get.constructor('return process')()",
  'response JSON prototype chain': "var body = pm.response.json(); return body.constructor.constructor('return process')()",
  'response JSON __proto__': "var body = pm.response.json(); return body.__proto__.constructor.constructor('return process')()",
  'response headers prototype chain': "return pm.response.headers.get.constructor('return process')()",
  'console.log prototype chain': "return console.log.constructor('return process')()",
  'error stack prepare hook': "var r; Error.prepareStackTrace = function (e, s) { r = s[0] && s[0].getThis && s[0].getThis(); return '' }; new Error().stack; return r && r.process",
  'globalThis.process': 'return globalThis.process',
  'require': "return typeof require === 'function' ? require('child_process') : undefined"
}

describe('script sandbox isolation', () => {
  for (const [label, attempt] of Object.entries(ESCAPE_ATTEMPTS)) {
    it(`cannot reach host process via ${label}`, async () => {
      const run = await runTests(`
        var reached
        try { reached = (function () { ${attempt} })() } catch (e) { reached = undefined }
        var leaked = !!(reached && (reached.versions || reached.mainModule || reached.binding || reached.exec || reached.spawn))
        pm.test('isolated', function () { if (leaked) throw new Error('escaped: ' + Object.keys(reached).slice(0, 5).join(',')) })
      `)
      expect(run.results).toEqual([{ name: 'isolated', passed: true }])
    })
  }

  it('cannot see Node globals at all', async () => {
    const run = await runTests(`
      pm.test('no node globals', function () {
        pm.expect(typeof process).to.equal('undefined')
        pm.expect(typeof require).to.equal('undefined')
        pm.expect(typeof Buffer).to.equal('undefined')
        pm.expect(typeof module).to.equal('undefined')
      })
    `)
    expect(run.results).toEqual([{ name: 'no node globals', passed: true }])
  })

  it('does not let a pre-request script reach the host either', async () => {
    const result = await runner.runPreRequest({
      script: "var p = pm.environment.set.constructor('return typeof process')(); pm.environment.set('leak', p)",
      variables: {}
    })
    expect(result.error).toBeUndefined()
    expect(result.variables.leak).toBe('undefined')
  })

  it('stops an infinite loop at the timeout', async () => {
    const started = Date.now()
    const run = await runTests("pm.test('before', function () {}); while (true) {}")
    expect(Date.now() - started).toBeLessThan(5000)
    expect(run.results[0]).toEqual({ name: 'before', passed: true })
    expect(run.results.at(-1)).toMatchObject({ name: 'Script execution', passed: false })
    expect(run.results.at(-1)?.error).toMatch(/timed out/i)
  })

  it('stops an infinite loop in a pre-request script and keeps the old variables', async () => {
    const result = await runner.runPreRequest({ script: "pm.environment.set('a', '2'); for (;;) {}", variables: { a: '1' } })
    expect(result.error).toMatch(/timed out/i)
    expect(result.variables).toEqual({ a: '1' })
  })

  it('caps memory use', async () => {
    // A long time budget keeps this about the memory cap alone, even on a loaded CI machine.
    const run = await runInSandbox({
      input: '{}',
      script: 'var all = []; for (;;) all.push(new ArrayBuffer(1024 * 1024))',
      filename: 'memory-cap.js',
      timeoutMs: 15_000,
      memoryLimitBytes: 8 * 1024 * 1024
    })
    expect(run.error).toMatch(/memory limit/i)
  }, 20_000)

  it('kills a script whose built-in calls outrun the interrupt check', async () => {
    const started = Date.now()
    const run = await runTests("var parts = []; for (;;) parts.push(new Array(100000).fill('x').join(''))")
    expect(Date.now() - started).toBeLessThan(6000)
    expect(run.results.at(-1)).toMatchObject({ name: 'Script execution', passed: false })
    expect(run.results.at(-1)?.error).toMatch(/timed out|memory limit/i)
  }, 10_000)

  it('can run again after a script blew its limits', async () => {
    await runTests('while (true) {}')
    const run = await runTests("pm.test('fine', function () { pm.response.to.have.status(200) })")
    expect(run.results).toEqual([{ name: 'fine', passed: true }])
  })

  it('keeps a prototype-polluting response from affecting the host', async () => {
    const run = await runner.runTests({
      script: "var body = pm.response.json(); pm.environment.set('polluted', String(({}).polluted))",
      request,
      response: response({ data: '{"__proto__": {"polluted": "yes"}, "constructor": {"prototype": {"polluted": "yes"}}}' }),
      variables: {}
    })
    expect(run.variables?.polluted).toBe('undefined')
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })
})

describe('pm API', () => {
  it('supports pm.response.to.have.status and friends', async () => {
    const run = await runTests(`
      pm.test('status', function () { pm.response.to.have.status(200) })
      pm.test('reason', function () { pm.response.to.have.status('OK') })
      pm.test('ok', function () { pm.response.to.be.ok })
      pm.test('header', function () { pm.response.to.have.header('content-type') })
      pm.test('not 404', function () { pm.response.to.not.have.status(404) })
      pm.test('wrong status', function () { pm.response.to.have.status(201) })
    `)
    expect(run.results).toEqual([
      { name: 'status', passed: true },
      { name: 'reason', passed: true },
      { name: 'ok', passed: true },
      { name: 'header', passed: true },
      { name: 'not 404', passed: true },
      { name: 'wrong status', passed: false, error: 'expected response to have status code 201 but got 200' }
    ])
  })

  it('reads headers case-insensitively and keeps them iterable', async () => {
    const run = await runTests(`
      pm.test('get', function () { pm.expect(pm.response.headers.get('x-request-id')).to.equal('abc') })
      pm.test('has', function () { pm.expect(pm.response.headers.has('CONTENT-TYPE')).to.be.true })
      pm.test('iterate', function () {
        var names = []
        for (var name in pm.response.headers) names.push(name)
        pm.expect(names).to.eql(['Content-Type', 'X-Request-Id'])
      })
    `)
    expect(run.results.every((r) => r.passed)).toBe(true)
  })

  it('supports chai-style pm.expect chains', async () => {
    const run = await runTests(`
      var body = pm.response.json()
      pm.test('eql', function () { pm.expect(body.roles).to.eql(['admin', 'dev']) })
      pm.test('include string', function () { pm.expect(body.name).to.include('Ad') })
      pm.test('include array', function () { pm.expect(body.roles).to.include('dev') })
      pm.test('property', function () { pm.expect(body).to.have.property('name', 'Ada') })
      pm.test('nested property chain', function () { pm.expect(body).to.have.property('profile').that.has.property('age').above(30) })
      pm.test('type', function () { pm.expect(body.id).to.be.a('number'); pm.expect(body.roles).to.be.an('array') })
      pm.test('above/below', function () { pm.expect(pm.response.responseTime).to.be.below(1000).and.above(0) })
      pm.test('not', function () { pm.expect(body.name).to.not.equal('Bob') })
      pm.test('ok callable', function () { pm.expect(body.id).to.be.ok() })
      pm.test('lengthOf', function () { pm.expect(body.roles).to.have.lengthOf(2) })
      pm.test('keys', function () { pm.expect(body.profile).to.have.all.keys('age') })
      pm.test('oneOf', function () { pm.expect(pm.response.code).to.be.oneOf([200, 201]) })
      pm.test('fails eql', function () { pm.expect(body.roles).to.eql(['admin']) })
      pm.test('fails property', function () { pm.expect(body).to.have.property('email') })
      pm.test('fails type', function () { pm.expect(body.name).to.be.a('number') })
    `)
    const failed = run.results.filter((r) => !r.passed)
    expect(run.results).toHaveLength(15)
    expect(failed.map((r) => r.name)).toEqual(['fails eql', 'fails property', 'fails type'])
    expect(failed[0].error).toBe(`expected ["admin","dev"] to deeply equal ["admin"]`)
    expect(failed[1].error).toBe(`expected {"id":1,"name":"Ada","roles":["admin","dev"],"profile":{"age":36}} to have property 'email'`)
    expect(failed[2].error).toBe(`expected 'Ada' to be a number`)
  })

  it('keeps pm.response.status numeric for existing scripts', async () => {
    const run = await runTests("pm.test('numeric', function () { if (pm.response.status !== 200) throw new Error('was ' + pm.response.status) })")
    expect(run.results).toEqual([{ name: 'numeric', passed: true }])
  })

  it('round-trips collection variables and globals', async () => {
    const run = await runTests(
      `
      pm.collectionVariables.set('page', pm.collectionVariables.get('page') + '1')
      pm.globals.set('seen', true)
      pm.globals.unset('old')
      pm.environment.set('token', pm.response.json().name)
      pm.test('resolution order', function () { pm.expect(pm.variables.get('shared')).to.equal('env') })
    `,
      {
        variables: { shared: 'env' },
        collectionVariables: { page: '1', shared: 'collection' },
        globals: { old: 'x', shared: 'global' }
      }
    )
    expect(run.results).toEqual([{ name: 'resolution order', passed: true }])
    expect(run.variables).toEqual({ shared: 'env', token: 'Ada' })
    expect(run.collectionVariables).toEqual({ page: '11', shared: 'collection' })
    expect(run.globals).toEqual({ shared: 'global', seen: 'true' })
  })

  it('leaves out scopes the caller did not pass', async () => {
    const run = await runTests("pm.globals.set('a', '1')")
    expect(run.variables).toBeUndefined()
    expect(run.globals).toBeUndefined()
    expect(run.collectionVariables).toBeUndefined()
  })

  it('captures console output in order', async () => {
    const run = await runTests(`
      console.log('status', pm.response.code, { ok: true })
      console.warn('slow')
      console.error(new Error('boom'))
      pm.test('t', function () { console.info('inside test') })
    `)
    expect(run.logs).toEqual([
      { level: 'log', message: 'status 200 {"ok":true}' },
      { level: 'warn', message: 'slow' },
      { level: 'error', message: 'Error: boom' },
      { level: 'info', message: 'inside test' }
    ])
  })

  it('returns console output from pre-request scripts, even when they fail', async () => {
    const result = await runner.runPreRequest({ script: "console.log('about to fail'); throw new Error('nope')", variables: { a: '1' } })
    expect(result.error).toBe('nope')
    expect(result.variables).toEqual({ a: '1' })
    expect(result.logs).toEqual([{ level: 'log', message: 'about to fail' }])
  })

  it('keeps pre-request variable changes and reads all scopes', async () => {
    const result = await runner.runPreRequest({
      script: "pm.variables.set('userId', '123'); pm.environment.unset('drop'); pm.collectionVariables.set('c', pm.globals.get('g'))",
      variables: { drop: 'x', keep: 'y' },
      collectionVariables: {},
      globals: { g: 'from-global' }
    })
    expect(result).toEqual({
      variables: { keep: 'y', userId: '123' },
      collectionVariables: { c: 'from-global' },
      globals: { g: 'from-global' }
    })
  })

  it('supports the legacy tests[] object', async () => {
    const run = await runTests("tests['Status is 200'] = responseCode.code === 200; tests['Has body'] = responseBody.length === 0")
    expect(run.results).toEqual([
      { name: 'Status is 200', passed: true },
      { name: 'Has body', passed: false }
    ])
  })

  it('reports a script error after the tests that ran', async () => {
    const run = await runTests("pm.test('first', function () {}); notDefined()")
    expect(run.results).toEqual([
      { name: 'first', passed: true },
      { name: 'Script execution', passed: false, error: "ReferenceError: 'notDefined' is not defined" }
    ])
  })

  it('reports invalid JSON from pm.response.json() as a failed test', async () => {
    const run = await runner.runTests({
      script: "pm.test('json', function () { pm.response.json() })",
      request,
      response: response({ data: '<html>' })
    })
    expect(run.results[0]).toMatchObject({ name: 'json', passed: false })
  })
})
