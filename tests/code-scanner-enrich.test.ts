import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  applyEnrichment,
  buildEndpointContext,
  buildEnrichMessages,
  estimateEnrichTokens,
  parseEnrichResponse
} from '../shared/lib/code-scanner/enrich'
import { buildCollectionFromEndpoints } from '../shared/lib/code-scanner/spec-to-collection'
import type { DetectedEndpoint } from '../shared/types/code-scanner'

const chat = vi.fn()
const getStatus = vi.fn()
const getConfig = vi.fn()

class CreditBudgetError extends Error {}

vi.mock('../electron/main/ai', () => ({ aiRouter: { chat }, aiManager: { getStatus, getConfig } }))

function aiConfig(overrides: Record<string, unknown> = {}) {
  return {
    mode: 'openai',
    cloudProvider: 'openai',
    fallbackEnabled: false,
    creditGuardEnabled: true,
    allowPaidFallback: false,
    ollama: { model: 'llama3.2' },
    openai: { model: 'gpt-x' },
    ...overrides
  }
}

const providers = (online = true) => [
  { id: 'openai', label: 'OpenAI', configured: true, online },
  { id: 'ollama', label: 'Ollama', configured: true, online: true }
]
vi.mock('../electron/main/ai/credit-guard', () => ({ CreditBudgetError }))
vi.mock('../electron/main/infra/logger.service', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

function endpoint(overrides: Partial<DetectedEndpoint> = {}): DetectedEndpoint {
  return {
    id: 'ep1',
    method: 'POST',
    path: '/api/users',
    parameters: [{ name: 'page', in: 'query', required: false }],
    requestBody: { required: true, contentTypes: ['application/json'], example: { email: '', age: 0, password: '' } },
    responses: [],
    securityRequired: false,
    tags: ['users'],
    origin: 'backend',
    framework: 'express',
    confidence: 'high',
    sources: [{ file: 'src/users.ts', line: 5 }],
    summary: 'Create user',
    ...overrides
  }
}

const CODE = `const router = Router()
const API_KEY = "sk_live_abc123"
// headers: { authorization: "Bearer eyJhbGciOiJIUzI1NiJ9.secret" }
router.post('/users', (req, res) => {
  const { email, age, password, nickname } = req.body
  const role = req.query.role
  res.status(201).json({ id: 1, email })
})`

describe('building the AI context', () => {
  it('sends code around the source with credentials redacted', () => {
    const context = buildEndpointContext(endpoint(), 'e0', () => CODE.split('\n'))
    expect(context).toMatchObject({ key: 'e0', method: 'POST', path: '/api/users', query: ['page'], headers: [] })
    expect(context.snippets).toHaveLength(1)
    expect(context.snippets[0].line).toBe(1) // includes the lines above the route (doc comments, decorators)
    expect(context.snippets[0].code).toContain("router.post('/users'")
    expect(context.snippets[0].code).not.toContain('sk_live_abc123')
    expect(context.snippets[0].code).not.toContain('eyJhbGciOiJIUzI1NiJ9')
  })

  it('adds the service function the handler passes the body to', () => {
    const files: Record<string, string> = {
      'src/articles.controller.ts': [
        "import { createArticle } from './articles.service'",
        "router.post('/articles', async (req, res) => {",
        '  const article = await createArticle(req.body.article)',
        '  res.status(201).json({ article })',
        '})'
      ].join('\n'),
      'src/articles.service.ts': [
        "import db from './db'",
        'export const createArticle = async (article: any) => {',
        '  const { title, description, tagList } = article',
        '}'
      ].join('\n')
    }
    const context = buildEndpointContext(
      endpoint({ sources: [{ file: 'src/articles.controller.ts', line: 2 }], requestBody: { required: true, contentTypes: [], example: { article: '' } } }),
      'e0',
      (file) => files[file]?.split('\n') ?? null
    )
    expect(context.snippets.map((s) => [s.file, s.line])).toEqual([
      ['src/articles.controller.ts', 1],
      ['src/articles.service.ts', 2]
    ])
    const ground = context.snippets.map((s) => s.code).join('\n')
    const next = applyEnrichment(
      endpoint({ requestBody: { required: true, contentTypes: [], example: { article: '' } } }),
      { id: 'e0', requestBody: { article: { title: 'Hello', description: 'Intro', tagList: ['dev'], invented: true } } },
      ground
    )
    expect(next.requestBody?.example).toEqual({ article: { title: 'Hello', description: 'Intro', tagList: ['dev'] } })
  })

  it('finds Python helpers imported with a relative from-import', () => {
    const files: Record<string, string> = {
      'app/views.py': ['from .services import create_user', '', '@bp.post("/users")', 'def register():', '    create_user(request.json)'].join('\n'),
      'app/services.py': ['def create_user(data):', '    email = data["email"]'].join('\n')
    }
    const context = buildEndpointContext(endpoint({ sources: [{ file: 'app/views.py', line: 3 }] }), 'e0', (f) => files[f]?.split('\n') ?? null)
    expect(context.snippets.map((s) => s.file)).toEqual(['app/views.py', 'app/services.py'])
  })

  it('includes one caller snippet and skips unreadable files', () => {
    const context = buildEndpointContext(
      endpoint({ callers: [{ file: 'web/api.ts', line: 1 }], sources: [{ file: 'missing.ts', line: 1 }, { file: 'web/api.ts', line: 1 }] }),
      'e0',
      (file) => (file === 'web/api.ts' ? ["export const create = (u) => fetch('/api/users', { method: 'POST' })"] : null)
    )
    expect(context.snippets.map((s) => s.file)).toEqual(['web/api.ts'])
  })

  it('estimates tokens from the prompt size plus an output budget', () => {
    const contexts = Array.from({ length: 7 }, (_, i) => buildEndpointContext(endpoint(), `e${i}`, () => CODE.split('\n')))
    const tokens = estimateEnrichTokens(contexts)
    const promptChars = buildEnrichMessages(contexts.slice(0, 6)).reduce((n, m) => n + m.content.length, 0)
    expect(tokens).toBeGreaterThan(Math.ceil(promptChars / 4) + 6 * 400)
  })
})

describe('secret scrubbing', () => {
  it('removes credentials that appear in code', async () => {
    const { scrubCode } = await import('../shared/lib/code-scanner/enrich')
    const code = [
      'headers: { Authorization: "Bearer abcdef123456.xyz" }',
      'const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTYifQ.sig"',
      "const stripe = 'sk_live_51HxYzAbCdEf'",
      'const gh = "ghp_abcdefghijklmnopqrstuvwxyz123456"',
      'const aws = "AKIAIOSFODNN7EXAMPLE"',
      'const blob = "Zm9vYmFyYmF6cXV4MTIzNDU2Nzg5MGFiY2RlZmdo"',
      "router.get('/api/users/:id', handler) // keep ordinary code"
    ].join('\n')
    const out = scrubCode(code)
    for (const secret of ['abcdef123456', 'eyJhbGci', 'sk_live_51', 'ghp_abcdef', 'AKIAIOSFODNN7', 'Zm9vYmFy']) {
      expect(out).not.toContain(secret)
    }
    expect(out).toContain("router.get('/api/users/:id', handler)")
  })
})

describe('parsing the AI reply', () => {
  it('accepts fenced JSON and bare arrays, and drops malformed items', () => {
    expect(parseEnrichResponse('```json\n{"endpoints":[{"id":"e0","summary":"Create a user"},{"summary":"no id"}]}\n```')).toEqual([
      { id: 'e0', summary: 'Create a user' }
    ])
    expect(parseEnrichResponse('[{"id":"e1"}]')).toEqual([{ id: 'e1' }])
    expect(parseEnrichResponse('not json')).toEqual([])
  })
})

describe('merging the AI reply', () => {
  const ground = CODE

  it('fills placeholder values, keeps types and never sends credentials', () => {
    const next = applyEnrichment(
      endpoint(),
      {
        id: 'e0',
        summary: 'Create a user account',
        description: 'Registers a new user.',
        requestBody: { email: 'ada@example.com', age: 'thirty', password: 'hunter2', nickname: 'ada', isAdmin: true },
        response: { status: 201, example: { id: 1, email: 'ada@example.com', token: 'abc' } }
      },
      ground
    )
    expect(next.requestBody?.example).toEqual({
      email: 'ada@example.com',
      age: 0, // the AI tried to change a number into a string
      password: '', // credential-named: never filled
      nickname: 'ada' // new, but it appears in the code
      // isAdmin: not in the code, so not added
    })
    expect(next.summary).toBe('Create a user account')
    expect(next.description).toBe('Registers a new user.')
    expect(next.responseExample).toEqual({ id: 1, email: 'ada@example.com', token: '' })
    expect(next.responses).toEqual([{ status: '201', description: 'Example response' }])
    expect(next.aiEnriched).toEqual(['summary', 'description', 'body', 'response'])
  })

  it('adds only grounded parameters and keeps secrets out of header examples', () => {
    const next = applyEnrichment(
      endpoint({ parameters: [{ name: 'page', in: 'query', required: false }, { name: 'x-api-key', in: 'header', required: false }] }),
      {
        id: 'e0',
        query: [
          { name: 'page', example: 2, description: 'Page number' },
          { name: 'role', example: 'admin' },
          { name: 'limit', example: 10 }
        ],
        headers: [{ name: 'X-Api-Key', example: 'sk_live_123' }, { name: 'Authorization', example: 'Bearer x' }]
      },
      ground
    )
    expect(next.parameters).toEqual([
      { name: 'page', in: 'query', required: false, description: 'Page number', example: '2' },
      { name: 'x-api-key', in: 'header', required: false },
      { name: 'role', in: 'query', required: false, example: 'admin' }
    ])
  })

  it('leaves OpenAPI summaries and GET bodies alone, and returns the same object when nothing changes', () => {
    const openapi = endpoint({ origin: 'openapi', summary: 'From the spec' })
    expect(applyEnrichment(openapi, { id: 'e0', summary: 'AI summary' }, ground)).toBe(openapi)
    const get = endpoint({ method: 'GET', requestBody: undefined })
    const next = applyEnrichment(get, { id: 'e0', requestBody: { email: 'x' }, summary: 'List users' }, ground)
    expect(next.requestBody).toBeUndefined()
    expect(next.summary).toBe('List users')
  })

  it('replaces angle-bracket placeholders on ordinary fields', () => {
    const next = applyEnrichment(endpoint(), { id: 'e0', requestBody: { email: '<EMAIL>', nickname: '<NAME>' } }, ground)
    expect(next.requestBody?.example).toMatchObject({ email: 'user@example.com', nickname: '' })
  })

  it('creates a body from grounded fields when the scanner found none', () => {
    const next = applyEnrichment(endpoint({ requestBody: undefined }), { id: 'e0', requestBody: { email: 'a@b.co', invented: 1 } }, ground)
    expect(next.requestBody?.example).toEqual({ email: 'a@b.co' })
  })
})

describe('collection output', () => {
  it('prefills parameter examples and documents the example response', () => {
    const enriched = endpoint({
      parameters: [{ name: 'page', in: 'query', required: false, example: '2' }],
      responseExample: { id: 1 },
      responses: [{ status: '201', description: 'Example response' }]
    })
    const { collection } = buildCollectionFromEndpoints([enriched], { name: 'x', baseUrl: 'http://localhost' })
    const request = collection.requests[0]
    expect(request.queryParams[0]).toMatchObject({ key: 'page', value: '2' })
    expect(request.description).toContain('Example response (201)')
    expect(request.description).toContain('"id": 1')
  })
})

describe('enrichment service', () => {
  let root: string

  beforeEach(() => {
    chat.mockReset()
    getStatus.mockReset()
    root = mkdtempSync(join(tmpdir(), 'scan-'))
    mkdirSync(join(root, 'src'))
    writeFileSync(join(root, 'src/users.ts'), CODE)
    writeFileSync(join(tmpdir(), 'outside-secret.ts'), 'SECRET')
  })

  const load = async () => (await import('../electron/main/code-scanner/code-scanner-ai.service')).codeScannerAiService

  it('estimates with the provider the router will use and reports why it cannot run', async () => {
    getConfig.mockReturnValue(aiConfig())
    getStatus.mockResolvedValue({ activeProvider: 'openai', activeModel: 'gpt-x', providers: [{ id: 'openai', label: 'OpenAI', configured: false, online: false }] })
    const service = await load()
    const estimate = await service.estimate(root, [endpoint()])
    expect(estimate).toMatchObject({ endpoints: 1, batches: 1, provider: 'OpenAI', model: 'gpt-x', cloud: true, ready: false })
    expect(estimate.reason).toContain('OpenAI is not configured')
  })

  it('in hybrid mode names the cloud provider that large prompts go to, not the chat provider', async () => {
    // Plain chat would resolve to local Ollama, but enrichment prompts are large API_GENERATION requests.
    getConfig.mockReturnValue(aiConfig({ mode: 'hybrid' }))
    getStatus.mockResolvedValue({ activeProvider: 'ollama', activeModel: 'llama3.2', providers: providers() })
    const service = await load()
    const estimate = await service.estimate(root, [endpoint()])
    expect(estimate).toMatchObject({ provider: 'OpenAI', cloud: true, ready: true, fallbackProvider: null })
  })

  it('reports a cloud fallback behind a local provider', async () => {
    getConfig.mockReturnValue(aiConfig({ mode: 'ollama', fallbackEnabled: true, creditGuardEnabled: false }))
    getStatus.mockResolvedValue({ activeProvider: 'ollama', activeModel: 'llama3.2', providers: providers() })
    const service = await load()
    const estimate = await service.estimate(root, [endpoint()])
    expect(estimate).toMatchObject({ provider: 'Ollama', model: 'llama3.2', fallbackProvider: 'OpenAI', cloud: true })
  })

  it('is local only when no provider that could receive the code is a cloud one', async () => {
    getConfig.mockReturnValue(aiConfig({ mode: 'ollama', fallbackEnabled: true, creditGuardEnabled: true, allowPaidFallback: false }))
    getStatus.mockResolvedValue({ activeProvider: 'ollama', activeModel: 'llama3.2', providers: providers() })
    const service = await load()
    expect(await service.estimate(root, [endpoint()])).toMatchObject({ provider: 'Ollama', fallbackProvider: null, cloud: false })
  })

  it('batches endpoints, applies answers and never reads outside the project', async () => {
    chat.mockImplementation(async (messages: Array<{ content: string }>) => {
      const payload = JSON.parse(messages[1].content) as { endpoints: Array<{ id: string; snippets: unknown[] }> }
      return {
        text: JSON.stringify({ endpoints: payload.endpoints.map((e) => ({ id: e.id, summary: `Summary ${e.id}` })) }),
        model: 'gpt-x',
        totalTokens: 100
      }
    })
    const service = await load()
    symlinkSync(join(tmpdir(), 'outside-secret.ts'), join(root, 'src/link.ts'))
    const endpoints = Array.from({ length: 8 }, (_, i) =>
      endpoint({
        id: `ep${i}`,
        sources: [{ file: i === 7 ? '../outside-secret.ts' : i === 6 ? 'src/link.ts' : 'src/users.ts', line: 5 }]
      })
    )
    const progress: number[] = []
    const result = await service.enrich(root, { enrichId: 'run1', rootPath: root, endpoints }, (p) => progress.push(p.done))

    expect(chat).toHaveBeenCalledTimes(2)
    expect(chat.mock.calls[0][1]).toMatchObject({ json: true, requestType: 'API_GENERATION', meta: { feature: 'code-scanner-enrich' } })
    const sent = chat.mock.calls.map((c) => c[0][1].content as string).join('\n')
    expect(sent).not.toContain('SECRET')
    expect(result).toMatchObject({ enriched: 8, failedBatches: 0, tokens: 200, model: 'gpt-x' })
    expect(result.endpoints.map((e) => e.summary)).toEqual([...Array(6).keys()].map((i) => `Summary e${i}`).concat(['Summary e6', 'Summary e7']))
    expect(progress).toEqual([0, 1, 2])
  })

  it('stops at the daily budget and keeps what was already enriched', async () => {
    chat
      .mockResolvedValueOnce({ text: '{"endpoints":[{"id":"e0","summary":"First"}]}', model: 'm', totalTokens: 10 })
      .mockRejectedValueOnce(new CreditBudgetError('Daily API token budget reached'))
    const service = await load()
    const endpoints = Array.from({ length: 12 }, (_, i) => endpoint({ id: `ep${i}` }))
    const result = await service.enrich(root, { enrichId: 'run2', rootPath: root, endpoints }, () => {})
    expect(result.error).toBe('Daily API token budget reached')
    expect(result.enriched).toBe(1)
  })
})
