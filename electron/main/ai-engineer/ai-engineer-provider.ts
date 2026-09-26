import { aiRouter } from '../ai'
import { aiManager } from '../ai'
import { logger } from '../infra/logger.service'
import {
  aiFailureAnalysisResponseSchema,
  aiTestGenerationResponseSchema,
  type ParsedAiGeneratedTest
} from '@shared/lib/ai-engineer/schemas'
import type { ApiSpec } from '@shared/types/ai-engineer'

function stripMarkdownJson(text: string): string {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  return fence ? fence[1].trim() : text.trim()
}

function parseWithRetry<T>(schema: { parse: (v: unknown) => T }, raw: string, label: string): T {
  const cleaned = stripMarkdownJson(raw)
  try {
    return schema.parse(JSON.parse(cleaned))
  } catch (first) {
    logger.warn(`AI Engineer: invalid ${label} JSON, retrying`, 'AIEngineer')
    throw first
  }
}

export class AIEngineerProvider {
  isAvailable(): boolean {
    try {
      const status = aiManager.getConfig()
      return Boolean(status.mode)
    } catch {
      return false
    }
  }

  async isOnline(): Promise<boolean> {
    try {
      const st = await aiManager.getStatus()
      const active = st.providers.find((p) => p.id === st.activeProvider)
      return Boolean(active?.configured && active.online)
    } catch {
      return false
    }
  }

  async enrichAnalysis(spec: ApiSpec): Promise<string | undefined> {
    const online = await this.isOnline()
    if (!online) return undefined
    const result = await aiRouter.chat(
      [
        {
          role: 'system',
          content:
            'You summarize REST APIs for engineers. Output markdown only. Do not invent endpoints. Mention auth patterns and notable validation gaps based on the spec provided.'
        },
        {
          role: 'user',
          content: `API specification (sanitized JSON):\n${JSON.stringify(spec, null, 2).slice(0, 120_000)}`
        }
      ],
      {
        temperature: 0.3,
        maxTokens: 1200,
        requestType: 'API_GENERATION',
        meta: { feature: 'ai-engineer-analyze' }
      }
    )
    return result.text.trim()
  }

  async generateTests(spec: ApiSpec, maxTests: number): Promise<ParsedAiGeneratedTest[]> {
    const online = await this.isOnline()
    if (!online) return []

    const endpointSample = spec.endpoints.slice(0, 40)
    const result = await aiRouter.chat(
      [
        {
          role: 'system',
          content: `You generate API test cases. Return JSON ONLY matching:
{"tests":[{"name","method","url","headers":{},"query":{},"body?","bodyType":"none|json|text","expectedStatus":[number],"assertions":[],"reason","riskLevel":"low|medium|high","category":"functional|edge|auth|regression","endpointId?"}]}
Rules:
- Use base URL prefix from spec: ${spec.baseUrl}
- Prefer low risk GET/HEAD tests; mark mutations medium/high risk
- Include auth tests (missing/invalid token) when securityRequired
- Include edge cases (missing fields, invalid types) for POST/PUT/PATCH
- Max ${maxTests} tests total
- Never include real secrets; use {{token}} placeholders
- Do not wrap in markdown`
        },
        {
          role: 'user',
          content: JSON.stringify({ baseUrl: spec.baseUrl, endpoints: endpointSample }, null, 2).slice(0, 100_000)
        }
      ],
      {
        temperature: 0.25,
        maxTokens: 4096,
        json: true,
        requestType: 'API_GENERATION',
        meta: { feature: 'ai-engineer-generate-tests' }
      }
    )

    try {
      const parsed = parseWithRetry(aiTestGenerationResponseSchema, result.text, 'test generation')
      return parsed.tests.slice(0, maxTests)
    } catch (e) {
      logger.error(e instanceof Error ? e.message : 'Test generation parse failed', 'AIEngineer')
      return []
    }
  }

  async analyzeFailure(payload: {
    testName: string
    method: string
    url: string
    expectedStatus: number[]
    responseStatus: number
    responseBody: string
    assertionMessages: string[]
  }): Promise<ReturnType<typeof aiFailureAnalysisResponseSchema.parse> | null> {
    const online = await this.isOnline()
    if (!online) return null

    const result = await aiRouter.chat(
      [
        {
          role: 'system',
          content: `You analyze failed API tests for developers. Return JSON ONLY:
{"title","observedBehavior","expectedBehavior","likelyExplanation","category","suggestedNextStep"}
Rules:
- Separate observed vs expected vs speculation
- Do not claim confirmed vulnerabilities; use "appears to" / "potential issue"
- Do not invent server code or stack traces
- Base conclusions only on evidence provided`
        },
        {
          role: 'user',
          content: JSON.stringify(payload, null, 2).slice(0, 8000)
        }
      ],
      {
        temperature: 0.2,
        maxTokens: 1024,
        json: true,
        requestType: 'API_GENERATION',
        meta: { feature: 'ai-engineer-failure-analysis' }
      }
    )

    try {
      return parseWithRetry(aiFailureAnalysisResponseSchema, result.text, 'failure analysis')
    } catch {
      return null
    }
  }
}

export const aiEngineerProvider = new AIEngineerProvider()
