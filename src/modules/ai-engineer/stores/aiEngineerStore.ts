import { create } from 'zustand'
import type {
  AiEngineerConfig,
  AiFailureAnalysis,
  AiFinding,
  AiTestRun,
  AiTestSuite,
  ApiAnalysisRecord
} from '@shared/types/ai-engineer'
import { runAiTestSuite } from '../services/aiTestRunner'
import type { ApiCollection } from '@shared/types/api-studio'

interface DashboardStats {
  endpointCount: number
  analysisCount: number
  suiteCount: number
  runCount: number
  testsExecuted: number
  passRate: number
  findings: { high: number; medium: number; low: number }
  recentFindings: AiFinding[]
}

interface AiEngineerState {
  config: AiEngineerConfig | null
  providerOnline: boolean | null
  dashboard: DashboardStats | null
  analyses: ApiAnalysisRecord[]
  suites: AiTestSuite[]
  runs: AiTestRun[]
  findings: AiFinding[]
  selectedAnalysisId: string | null
  selectedSuiteId: string | null
  activeRun: AiTestRun | null
  busy: boolean
  progress: { current: number; total: number; label: string } | null
  loadAll: () => Promise<void>
  updateConfig: (patch: Partial<AiEngineerConfig>) => Promise<void>
  analyzeCollection: (collection: ApiCollection) => Promise<ApiAnalysisRecord | null>
  analyzeOpenApi: (json: string, name?: string) => Promise<ApiAnalysisRecord | null>
  generateTests: (analysisId: string) => Promise<AiTestSuite | null>
  runSuite: (suite: AiTestSuite, collection: ApiCollection | null, approvedMutations: boolean, variables?: Record<string, string>) => Promise<AiTestRun | null>
  analyzeFailure: (run: AiTestRun, testId: string) => Promise<AiFailureAnalysis | null>
}

export const useAiEngineerStore = create<AiEngineerState>((set, get) => ({
  config: null,
  providerOnline: null,
  dashboard: null,
  analyses: [],
  suites: [],
  runs: [],
  findings: [],
  selectedAnalysisId: null,
  selectedSuiteId: null,
  activeRun: null,
  busy: false,
  progress: null,

  async loadAll() {
    const [configRes, statusRes, dashRes, analysesRes, suitesRes, runsRes, findingsRes] = await Promise.all([
      window.electronAPI.aiEngineer.getConfig(),
      window.electronAPI.aiEngineer.status(),
      window.electronAPI.aiEngineer.dashboard(),
      window.electronAPI.aiEngineer.listAnalyses(),
      window.electronAPI.aiEngineer.listSuites(),
      window.electronAPI.aiEngineer.listRuns(),
      window.electronAPI.aiEngineer.listFindings()
    ])
    set({
      config: configRes.success && configRes.data ? configRes.data : null,
      providerOnline: statusRes.success && statusRes.data ? statusRes.data.providerOnline : false,
      dashboard: dashRes.success && dashRes.data ? dashRes.data : null,
      analyses: analysesRes.success && analysesRes.data ? analysesRes.data : [],
      suites: suitesRes.success && suitesRes.data ? suitesRes.data : [],
      runs: runsRes.success && runsRes.data ? runsRes.data : [],
      findings: findingsRes.success && findingsRes.data ? findingsRes.data : [],
      selectedAnalysisId:
        get().selectedAnalysisId ?? (analysesRes.data?.[0]?.id ?? null),
      selectedSuiteId: get().selectedSuiteId ?? (suitesRes.data?.[0]?.id ?? null)
    })
  },

  async updateConfig(patch) {
    const res = await window.electronAPI.aiEngineer.updateConfig(patch)
    if (res.success && res.data) set({ config: res.data })
  },

  async analyzeCollection(collection) {
    set({ busy: true, progress: { current: 0, total: 1, label: 'Analyzing collection…' } })
    const res = await window.electronAPI.aiEngineer.analyze({
      collection,
      collectionId: collection.id,
      collectionName: collection.name,
      enrichWithAi: true
    })
    set({ busy: false, progress: null })
    if (!res.success || !res.data) return null
    await get().loadAll()
    set({ selectedAnalysisId: res.data.id })
    return res.data
  },

  async analyzeOpenApi(json, name) {
    set({ busy: true, progress: { current: 0, total: 1, label: 'Parsing OpenAPI…' } })
    const res = await window.electronAPI.aiEngineer.analyze({
      openApiJson: json,
      collectionName: name,
      enrichWithAi: true
    })
    set({ busy: false, progress: null })
    if (!res.success || !res.data) return null
    await get().loadAll()
    set({ selectedAnalysisId: res.data.id })
    return res.data
  },

  async generateTests(analysisId) {
    set({ busy: true, progress: { current: 0, total: 1, label: 'Generating tests…' } })
    const res = await window.electronAPI.aiEngineer.generateTests({ analysisId, scope: 'all' })
    set({ busy: false, progress: null })
    if (!res.success || !res.data) return null
    await get().loadAll()
    set({ selectedSuiteId: res.data.id })
    return res.data
  },

  async runSuite(suite, collection, approvedMutations, variables) {
    const config = get().config
    if (!config) return null
    set({ busy: true, progress: { current: 0, total: suite.tests.length, label: 'Running tests…' } })
    const run = await runAiTestSuite({
      suiteId: suite.id,
      analysisId: suite.analysisId,
      name: `Run — ${suite.name}`,
      tests: suite.tests,
      config,
      variables,
      approvedMutations,
      collection,
      onProgress: (p) =>
        set({ progress: { current: p.current, total: p.total, label: `Running: ${p.testName}` } })
    })
    const saved = await window.electronAPI.aiEngineer.saveRun(run)
    set({ busy: false, progress: null, activeRun: saved.success && saved.data ? saved.data : run })
    await get().loadAll()

    if (saved.success && saved.data) {
      for (const result of saved.data.results.filter((r) => r.status === 'failed' || r.status === 'error')) {
        const test = suite.tests.find((t) => t.id === result.testId)
        if (test) await get().analyzeFailure(saved.data!, result.testId)
      }
    }

    return saved.success && saved.data ? saved.data : run
  },

  async analyzeFailure(run, testId) {
    const suite = get().suites.find((s) => s.id === run.suiteId)
    const test = suite?.tests.find((t) => t.id === testId)
    const result = run.results.find((r) => r.testId === testId)
    if (!test || !result) return null
    const res = await window.electronAPI.aiEngineer.analyzeFailure({ runId: run.id, testId, test, result })
    if (res.success && res.data) {
      await get().loadAll()
      return res.data
    }
    return null
  }
}))
