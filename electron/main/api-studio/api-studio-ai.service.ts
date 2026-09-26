import { aiRouter } from '../ai'
import { logger } from '../infra/logger.service'
import type {
  ApiRequest,
  DescribeApiRequestInput,
  EnhanceApiRequestInput,
  EnhanceApiRequestResult,
  ExplainApiResponseInput,
  FixApiRequestInput,
  GenerateApiRequestInput,
  GenerateApiTestsInput,
  GenerateCollectionDocumentInput,
  GeneratedApiRequestResult
} from '@shared/types/api-studio'

const REQUEST_JSON_SYSTEM = `You are an expert API engineer helping build HTTP requests inside an API testing tool.
Return JSON ONLY, matching this exact shape:
{
  "request": {
    "name": string,
    "method": "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS",
    "url": string,
    "headers": [{ "key": string, "value": string }],
    "queryParams": [{ "key": string, "value": string }],
    "body": { "type": "none" | "json" | "text" | "form-data" | "x-www-form-urlencoded", "content": string },
    "auth": { "type": "none" | "bearer" | "basic" | "apiKey", "bearerToken"?: string, "basicUsername"?: string, "basicPassword"?: string, "apiKeyName"?: string, "apiKeyValue"?: string, "apiKeyLocation"?: "header" | "query" }
  },
  "notes": string
}
Prefer existing environment placeholders like {{baseUrl}} when those keys are listed. For JSON bodies, "content" must be a pretty-printed JSON string (not an object). Never wrap the JSON in markdown fences. Do not invent real secrets — use placeholders like YOUR_TOKEN.`

function compactRequest(request: ApiRequest) {
  return {
    name: request.name,
    method: request.method,
    url: request.url,
    headers: request.headers.filter((h) => h.enabled && h.key.trim()).map((h) => ({ key: h.key, value: h.value })),
    queryParams: request.queryParams
      .filter((p) => p.enabled && p.key.trim())
      .map((p) => ({ key: p.key, value: p.value })),
    pathParams: (request.pathParams ?? [])
      .filter((p) => p.enabled && p.key.trim())
      .map((p) => ({ key: p.key, value: p.value })),
    body: {
      type: request.body.type,
      content: request.body.content.slice(0, 4000)
    },
    auth: { type: request.auth.type, apiKeyLocation: request.auth.apiKeyLocation, apiKeyName: request.auth.apiKeyName },
    description: request.description ?? ''
  }
}

function envHint(keys?: string[], name?: string | null): string {
  if (!keys?.length) return 'No environment variables are defined.'
  return `Active environment${name ? ` "${name}"` : ''} keys (use as {{key}}): ${keys.join(', ')}`
}

function parseGeneratedRequest(raw: string): GeneratedApiRequestResult {
  let text = raw.trim()
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenceMatch) text = fenceMatch[1].trim()
  const parsed = JSON.parse(text) as GeneratedApiRequestResult

  const req = parsed.request ?? ({} as GeneratedApiRequestResult['request'])
  return {
    request: {
      name: req.name || 'Generated Request',
      method: (req.method || 'GET') as GeneratedApiRequestResult['request']['method'],
      url: req.url || 'https://api.example.com',
      headers: Array.isArray(req.headers) ? req.headers : [],
      queryParams: Array.isArray(req.queryParams) ? req.queryParams : [],
      body: req.body?.type ? req.body : { type: 'none', content: '' },
      auth: req.auth?.type ? req.auth : { type: 'none' }
    },
    notes: parsed.notes
  }
}

function parseJsonObject<T>(raw: string): T {
  let text = raw.trim()
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenceMatch) text = fenceMatch[1].trim()
  return JSON.parse(text) as T
}

export class ApiStudioAIService {
  async generateRequest(input: GenerateApiRequestInput): Promise<GeneratedApiRequestResult> {
    const context = [
      `Create an API request for: ${input.prompt}`,
      envHint(input.environmentKeys),
      input.currentRequest
        ? `Current draft (keep matching names/URLs unless the prompt changes them):\n${JSON.stringify(compactRequest(input.currentRequest), null, 2)}`
        : ''
    ]
      .filter(Boolean)
      .join('\n\n')

    try {
      const result = await aiRouter.chat(
        [
          { role: 'system', content: REQUEST_JSON_SYSTEM },
          { role: 'user', content: context }
        ],
        {
          temperature: 0.3,
          maxTokens: 2048,
          json: true,
          requestType: 'API_GENERATION',
          meta: { projectId: input.projectId ?? undefined, feature: 'api-studio-generate' }
        }
      )
      return parseGeneratedRequest(result.text || '{}')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to generate request'
      logger.error(message, 'ApiStudioAIService')
      throw new Error(message)
    }
  }

  async fixRequest(input: FixApiRequestInput): Promise<GeneratedApiRequestResult> {
    const context = `Current request:
${JSON.stringify(compactRequest(input.request), null, 2)}

${input.response ? `Last response: status ${input.response.status} ${input.response.statusText}\nBody: ${input.response.data.slice(0, 2000)}` : ''}
${input.errorMessage ? `Error: ${input.errorMessage}` : ''}
${envHint(input.environmentKeys)}`

    try {
      const result = await aiRouter.chat(
        [
          { role: 'system', content: REQUEST_JSON_SYSTEM },
          {
            role: 'user',
            content: `This API request is broken or returning an error. Diagnose and fix it, keeping the original intent.\n\n${context}`
          }
        ],
        {
          temperature: 0.3,
          maxTokens: 2048,
          json: true,
          requestType: 'API_GENERATION',
          meta: { projectId: input.projectId ?? undefined, feature: 'api-studio-fix' }
        }
      )
      return parseGeneratedRequest(result.text || '{}')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fix request'
      logger.error(message, 'ApiStudioAIService')
      throw new Error(message)
    }
  }

  async enhance(input: EnhanceApiRequestInput): Promise<EnhanceApiRequestResult> {
    try {
      switch (input.action) {
        case 'complete':
          return await this.completeRequest(input)
        case 'body':
          return await this.generateBody(input)
        case 'script':
          return await this.generateScript(input)
        case 'review':
          return await this.reviewRequest(input)
        case 'variables':
          return await this.suggestVariables(input)
        default:
          throw new Error('Unknown AI action')
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to enhance request'
      logger.error(message, 'ApiStudioAIService')
      throw new Error(message)
    }
  }

  private async completeRequest(input: EnhanceApiRequestInput): Promise<EnhanceApiRequestResult> {
    const result = await aiRouter.chat(
      [
        { role: 'system', content: REQUEST_JSON_SYSTEM },
        {
          role: 'user',
          content: `Complete this HTTP request. Fill realistic example query params, headers (Accept, Content-Type when needed), and a JSON body for POST/PUT/PATCH. Keep the method and URL unless they are empty.
${envHint(input.environmentKeys, input.environmentName)}
${input.prompt ? `Extra instruction: ${input.prompt}` : ''}

Current request:
${JSON.stringify(compactRequest(input.request), null, 2)}`
        }
      ],
      {
        temperature: 0.3,
        maxTokens: 2048,
        json: true,
        requestType: 'API_GENERATION',
        meta: { projectId: input.projectId ?? undefined, feature: 'api-studio-complete' }
      }
    )
    const parsed = parseGeneratedRequest(result.text || '{}')
    return { request: parsed.request, notes: parsed.notes }
  }

  private async generateBody(input: EnhanceApiRequestInput): Promise<EnhanceApiRequestResult> {
    const result = await aiRouter.chat(
      [
        {
          role: 'system',
          content: `You generate HTTP request bodies for an API tester.
Return JSON ONLY: { "type": "json" | "text" | "x-www-form-urlencoded", "content": string }
For json, content must be pretty-printed JSON. Use realistic example values. No markdown fences.`
        },
        {
          role: 'user',
          content: `Generate a request body for:
${JSON.stringify(compactRequest(input.request), null, 2)}
${input.prompt ? `Instruction: ${input.prompt}` : 'Infer fields from the URL, method, and name.'}`
        }
      ],
      {
        temperature: 0.3,
        maxTokens: 1536,
        json: true,
        requestType: 'API_GENERATION',
        meta: { projectId: input.projectId ?? undefined, feature: 'api-studio-body' }
      }
    )
    const parsed = parseJsonObject<{ type?: string; content?: string }>(result.text || '{}')
    const type = parsed.type === 'text' || parsed.type === 'x-www-form-urlencoded' ? parsed.type : 'json'
    let content = parsed.content ?? '{}'
    if (type === 'json') {
      try {
        content = JSON.stringify(JSON.parse(content), null, 2)
      } catch {
        /* keep raw */
      }
    }
    return { body: { type, content } }
  }

  private async generateScript(input: EnhanceApiRequestInput): Promise<EnhanceApiRequestResult> {
    const result = await aiRouter.chat(
      [
        {
          role: 'system',
          content: `You write pre-request scripts for an API tester. The sandbox exposes:
- pm.environment.set(key, value)
- pm.environment.get(key)
- pm.variables.set(key, value)
Return ONLY JavaScript (no markdown fences). Keep it short and practical.`
        },
        {
          role: 'user',
          content: `Write a pre-request script for:
${JSON.stringify(compactRequest(input.request), null, 2)}
${envHint(input.environmentKeys, input.environmentName)}
${input.prompt ? `Instruction: ${input.prompt}` : 'Set useful derived values (timestamps, request ids) and document them with comments.'}`
        }
      ],
      {
        temperature: 0.3,
        maxTokens: 1024,
        requestType: 'API_GENERATION',
        meta: { projectId: input.projectId ?? undefined, feature: 'api-studio-script' }
      }
    )
    let script = result.text.trim()
    const fence = script.match(/```(?:javascript|js)?\s*([\s\S]*?)```/)
    if (fence) script = fence[1].trim()
    return { script }
  }

  private async reviewRequest(input: EnhanceApiRequestInput): Promise<EnhanceApiRequestResult> {
    const result = await aiRouter.chat(
      [
        {
          role: 'system',
          content: `You are a senior API reviewer. Write concise markdown covering:
1. What this request does
2. Auth / header issues
3. Missing or weak validation
4. Security (secrets in URL, missing HTTPS, overly broad tokens)
5. Suggested improvements
Be specific to the given request. Do not invent endpoints.`
        },
        {
          role: 'user',
          content: `Review this request:
${JSON.stringify(compactRequest(input.request), null, 2)}
${input.response ? `Last response: ${input.response.status} ${input.response.statusText}\n${input.response.data.slice(0, 1500)}` : 'No response yet.'}`
        }
      ],
      {
        temperature: 0.35,
        maxTokens: 1536,
        requestType: 'API_GENERATION',
        meta: { projectId: input.projectId ?? undefined, feature: 'api-studio-review' }
      }
    )
    return { review: result.text.trim() }
  }

  private async suggestVariables(input: EnhanceApiRequestInput): Promise<EnhanceApiRequestResult> {
    const result = await aiRouter.chat(
      [
        {
          role: 'system',
          content: `You extract reusable environment variables from an HTTP request.
Return JSON ONLY:
{
  "variables": [{ "key": string, "value": string }],
  "request": { same shape as the API tester request object with hardcoded hosts/tokens replaced by {{key}} }
}
Keys should be camelCase or snake_case (baseUrl, token, userId). Do not invent extra endpoints. Never wrap in markdown.`
        },
        {
          role: 'user',
          content: `${envHint(input.environmentKeys, input.environmentName)}

Request:
${JSON.stringify(compactRequest(input.request), null, 2)}`
        }
      ],
      {
        temperature: 0.2,
        maxTokens: 2048,
        json: true,
        requestType: 'API_GENERATION',
        meta: { projectId: input.projectId ?? undefined, feature: 'api-studio-variables' }
      }
    )
    const parsed = parseJsonObject<{
      variables?: { key: string; value: string }[]
      request?: GeneratedApiRequestResult['request']
    }>(result.text || '{}')
    const generated = parsed.request ? parseGeneratedRequest(JSON.stringify({ request: parsed.request })) : null
    return {
      variables: Array.isArray(parsed.variables) ? parsed.variables.filter((v) => v.key?.trim()) : [],
      request: generated?.request
    }
  }

  async explainResponse(input: ExplainApiResponseInput): Promise<string> {
    const bodyPreview = input.response.isBinary
      ? '[binary payload]'
      : input.response.data.slice(0, 4000)

    try {
      const result = await aiRouter.chat(
        [
          {
            role: 'system',
            content:
              'You are a senior backend engineer. Explain HTTP API responses clearly and concisely in markdown for another developer debugging an integration.'
          },
          {
            role: 'user',
            content: `Request: ${input.request.method} ${input.request.url}

Response status: ${input.response.status} ${input.response.statusText}
Response time: ${input.response.timeMs}ms
Response headers: ${JSON.stringify(input.response.headers)}
Response body:
${bodyPreview}

Explain what this response means, whether it indicates success or failure, and call out anything notable (errors, pagination, rate limits, auth issues, etc.).`
          }
        ],
        {
          temperature: 0.4,
          maxTokens: 2048,
          requestType: 'API_GENERATION',
          meta: { projectId: input.projectId ?? undefined, feature: 'api-studio-explain' }
        }
      )
      return result.text
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to explain response'
      logger.error(message, 'ApiStudioAIService')
      throw new Error(message)
    }
  }

  async generateTests(input: GenerateApiTestsInput): Promise<string> {
    try {
      const result = await aiRouter.chat(
        [
          {
            role: 'system',
            content: `You write pm.test-style test scripts for an API testing tool. The sandbox exposes:
- pm.test(name, fn) — register an assertion
- pm.response.status, pm.response.headers, pm.response.responseTime
- pm.response.json() / pm.response.text()
Return ONLY the JavaScript test script body (no markdown fences, no explanation).`
          },
          {
            role: 'user',
            content: `Request: ${input.request.method} ${input.request.url}
Response status: ${input.response.status}
Response body sample:
${input.response.isBinary ? '[binary payload]' : input.response.data.slice(0, 2000)}

Generate 3-5 meaningful pm.test assertions for this response (status code, response time, key fields, content type as applicable).`
          }
        ],
        {
          temperature: 0.3,
          maxTokens: 1024,
          requestType: 'API_GENERATION',
          meta: { projectId: input.projectId ?? undefined, feature: 'api-studio-tests' }
        }
      )
      let script = result.text.trim()
      const fenceMatch = script.match(/```(?:javascript|js)?\s*([\s\S]*?)```/)
      if (fenceMatch) script = fenceMatch[1].trim()
      return script
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to generate tests'
      logger.error(message, 'ApiStudioAIService')
      throw new Error(message)
    }
  }

  async describeRequest(input: DescribeApiRequestInput): Promise<string> {
    const bodyPreview =
      input.request.body.type === 'none'
        ? '(none)'
        : input.request.body.content.slice(0, 3000) ||
          (input.request.body.formData
            ? JSON.stringify(
                input.request.body.formData
                  .filter((f) => f.enabled)
                  .map((f) => ({ key: f.key, type: f.type, value: f.type === 'file' ? f.fileName : f.value })),
                null,
                2
              )
            : '(empty)')

    try {
      const result = await aiRouter.chat(
        [
          {
            role: 'system',
            content: `You write short developer notes for API requests in an API testing tool.
Return plain text only (no markdown fences). 2–5 sentences covering:
what the endpoint does, important query/header/auth details, and what the request body fields mean.
Be specific to the given payload — do not invent unrelated endpoints.`
          },
          {
            role: 'user',
            content: `Name: ${input.request.name}
Method: ${input.request.method}
URL: ${input.request.url}
Auth: ${input.request.auth.type}
Query: ${JSON.stringify(input.request.queryParams.filter((p) => p.enabled && p.key.trim()))}
Headers: ${JSON.stringify(input.request.headers.filter((h) => h.enabled && h.key.trim()).map((h) => h.key))}
Body type: ${input.request.body.type}
Body:
${bodyPreview}

Write a concise description/notes for this request.`
          }
        ],
        {
          temperature: 0.35,
          maxTokens: 512,
          requestType: 'API_GENERATION',
          meta: { projectId: input.projectId ?? undefined, feature: 'api-studio-describe' }
        }
      )
      let text = result.text.trim()
      const fenceMatch = text.match(/^```(?:markdown|md|text)?\s*([\s\S]*?)```\s*$/)
      if (fenceMatch) text = fenceMatch[1].trim()
      return text
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to describe request'
      logger.error(message, 'ApiStudioAIService')
      throw new Error(message)
    }
  }

  async documentCollection(input: GenerateCollectionDocumentInput): Promise<string> {
    const system = `You are a senior API documentation writer. Turn an API collection into polished developer documentation in Markdown.

Requirements:
- Start with a title (# Collection name) and a short overview.
- Include a table of contents / endpoint index grouped by folder.
- Document every endpoint with method, URL, auth, query params, headers, and body examples.
- Write clear, professional prose (ChatGPT-style clarity) — not just raw dumps.
- Keep all real URLs, methods, parameter names, and example values from the input.
- Never invent endpoints that are not in the input.
- Redact or keep secrets as already provided (do not invent credentials).
- Return ONLY Markdown (no surrounding explanation).`

    const user = `Collection: ${input.collectionName}

Structured summary (JSON):
${input.collectionSummary.slice(0, 28000)}

${input.baseMarkdown ? `Draft markdown to refine (keep all endpoints):\n${input.baseMarkdown.slice(0, 20000)}` : ''}

Produce complete API documentation for this collection.`

    try {
      const result = await aiRouter.chat(
        [
          { role: 'system', content: system },
          { role: 'user', content: user }
        ],
        {
          temperature: 0.35,
          maxTokens: 8192,
          requestType: 'API_GENERATION',
          meta: { projectId: input.projectId ?? undefined, feature: 'api-studio-document' }
        }
      )
      let text = result.text.trim()
      const fenceMatch = text.match(/^```(?:markdown|md)?\s*([\s\S]*?)```\s*$/)
      if (fenceMatch) text = fenceMatch[1].trim()
      return text
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to generate collection document'
      logger.error(message, 'ApiStudioAIService')
      throw new Error(message)
    }
  }
}

export const apiStudioAIService = new ApiStudioAIService()
