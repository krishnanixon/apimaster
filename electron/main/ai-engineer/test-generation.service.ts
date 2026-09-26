import { v4 as uuidv4 } from 'uuid'
import type { AiGeneratedTest, AiTestSuite, GenerateAiTestsInput } from '@shared/types/ai-engineer'
import { generateBaselineTests } from '@shared/lib/ai-engineer/baseline-tests'
import { testRequiresApproval } from '@shared/lib/ai-engineer/execution-policy'
import { aiEngineerRepository } from './ai-engineer.repository'
import { aiEngineerProvider } from './ai-engineer-provider'

export class TestGenerationService {
  async generate(input: GenerateAiTestsInput): Promise<AiTestSuite> {
    const analysis = aiEngineerRepository.getAnalysis(input.analysisId)
    if (!analysis) throw new Error('Analysis not found')

    const config = aiEngineerRepository.getConfig()
    const endpoints =
      input.scope === 'endpoint' && input.endpointId
        ? analysis.spec.endpoints.filter((e) => e.id === input.endpointId)
        : analysis.spec.endpoints

    const specSlice = { ...analysis.spec, endpoints }
    let tests = generateBaselineTests(analysis.id, specSlice)

    const maxAiTests = Math.max(0, config.maxTestsPerEndpoint * endpoints.length)
    if (config.sendApiDataToAi && maxAiTests > 0) {
      const aiTests = await aiEngineerProvider.generateTests(specSlice, maxAiTests)
      for (const t of aiTests) {
        if (input.categories && !input.categories.includes(t.category)) continue
        const generated: AiGeneratedTest = {
          id: uuidv4(),
          analysisId: analysis.id,
          endpointId: t.endpointId,
          name: t.name,
          method: t.method,
          url: t.url,
          headers: t.headers,
          query: t.query,
          body: t.body,
          bodyType: t.bodyType,
          expectedStatus: t.expectedStatus,
          assertions: t.assertions,
          reason: t.reason,
          riskLevel: t.riskLevel,
          category: t.category,
          requiresApproval: false,
          aiGenerated: true
        }
        generated.requiresApproval = testRequiresApproval(generated, config)
        tests.push(generated)
      }
    }

    for (const test of tests) {
      test.requiresApproval = testRequiresApproval(test, config)
    }

    tests = dedupeTests(tests).slice(0, config.maxTestsPerEndpoint * Math.max(endpoints.length, 1))

    const suite: AiTestSuite = {
      id: uuidv4(),
      analysisId: analysis.id,
      name: `Tests — ${analysis.collectionName ?? analysis.spec.name}`,
      tests,
      createdAt: new Date().toISOString(),
      aiGenerated: tests.some((t) => t.aiGenerated)
    }

    return aiEngineerRepository.saveSuite(suite)
  }
}

function dedupeTests(tests: AiGeneratedTest[]): AiGeneratedTest[] {
  const seen = new Set<string>()
  const out: AiGeneratedTest[] = []
  for (const t of tests) {
    const key = `${t.method}:${t.url}:${t.name}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(t)
  }
  return out
}

export const testGenerationService = new TestGenerationService()
