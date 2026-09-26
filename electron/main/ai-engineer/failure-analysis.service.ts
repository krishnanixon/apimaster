import { v4 as uuidv4 } from 'uuid'
import type { AiFinding, AnalyzeAiFailureInput, AiFailureAnalysis } from '@shared/types/ai-engineer'
import { aiEngineerProvider } from './ai-engineer-provider'
import { aiEngineerRepository } from './ai-engineer.repository'

export class FailureAnalysisService {
  async analyzeFailure(input: AnalyzeAiFailureInput): Promise<AiFailureAnalysis> {
    const config = aiEngineerRepository.getConfig()
    const evidenceBody = input.result.evidence.find((e) => e.kind === 'response')?.value ?? ''

    let analysis: AiFailureAnalysis = {
      testId: input.testId,
      title: `Test failed: ${input.test.name}`,
      observedBehavior: `HTTP ${input.result.statusCode}`,
      expectedBehavior: `Expected status in [${input.test.expectedStatus.join(', ')}]`,
      likelyExplanation: input.result.error ?? 'One or more assertions did not pass.',
      category: 'validation',
      suggestedNextStep: 'Review request parameters and server logs for this endpoint.',
      aiGenerated: false
    }

    if (config.sendApiDataToAi) {
      const ai = await aiEngineerProvider.analyzeFailure({
        testName: input.test.name,
        method: input.test.method,
        url: input.test.url,
        expectedStatus: input.test.expectedStatus,
        responseStatus: input.result.statusCode,
        responseBody: evidenceBody.slice(0, 4000),
        assertionMessages: input.result.assertionResults.filter((a) => !a.passed).map((a) => a.message)
      })
      if (ai) {
        analysis = {
          testId: input.testId,
          title: ai.title,
          observedBehavior: ai.observedBehavior,
          expectedBehavior: ai.expectedBehavior,
          likelyExplanation: ai.likelyExplanation,
          category: ai.category,
          suggestedNextStep: ai.suggestedNextStep,
          aiGenerated: true
        }
      }
    }

    const run = aiEngineerRepository.getRun(input.runId)
    if (run) {
      run.failureAnalyses = [...run.failureAnalyses.filter((f) => f.testId !== input.testId), analysis]
      aiEngineerRepository.saveRun(run)
    }

    const finding: AiFinding = {
      id: uuidv4(),
      title: analysis.title,
      severity: input.test.riskLevel === 'high' ? 'high' : input.test.riskLevel === 'medium' ? 'medium' : 'low',
      confidence: analysis.aiGenerated ? 'medium' : 'high',
      category: analysis.category,
      endpoint: input.test.url,
      method: input.test.method,
      description: analysis.likelyExplanation,
      observedBehavior: analysis.observedBehavior,
      expectedBehavior: analysis.expectedBehavior,
      evidence: input.result.evidence,
      recommendation: analysis.suggestedNextStep,
      testRunId: input.runId,
      testId: input.testId,
      createdAt: new Date().toISOString()
    }
    aiEngineerRepository.addFinding(finding)

    return analysis
  }
}

export const failureAnalysisService = new FailureAnalysisService()
