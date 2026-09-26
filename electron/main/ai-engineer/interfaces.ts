import type {
  AnalyzeAiFailureInput,
  AnalyzeApiInput,
  ApiAnalysisRecord,
  AiEngineerConfig,
  AiFailureAnalysis,
  AiFinding,
  AiTestRun,
  AiTestSuite,
  GenerateAiTestsInput
} from '@shared/types/ai-engineer'

export interface AIAnalysisService {
  analyze(input: AnalyzeApiInput): Promise<ApiAnalysisRecord>
  getAnalysis(id: string): ApiAnalysisRecord | undefined
  listAnalyses(): ApiAnalysisRecord[]
}

export interface TestGenerationService {
  generate(input: GenerateAiTestsInput): Promise<AiTestSuite>
}

export interface FailureAnalysisService {
  analyzeFailure(input: AnalyzeAiFailureInput): Promise<AiFailureAnalysis>
}

export interface AiEngineerStoreService {
  getConfig(): AiEngineerConfig
  updateConfig(patch: Partial<AiEngineerConfig>): AiEngineerConfig
  getSuite(id: string): AiTestSuite | undefined
  getRun(id: string): AiTestRun | undefined
  saveRun(run: AiTestRun): AiTestRun
  listRuns(): AiTestRun[]
  listFindings(): AiFinding[]
  addFinding(finding: AiFinding): AiFinding
}
