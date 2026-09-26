import type {
  AiEngineerConfig,
  AiEngineerDocument,
  AiFinding,
  AiTestRun,
  AiTestSuite,
  ApiAnalysisRecord
} from '@shared/types/ai-engineer'
import { DEFAULT_AI_ENGINEER_CONFIG as DEFAULT_CONFIG } from '@shared/types/ai-engineer'
import { readJsonFile, writeJsonFile } from '../infra/json-store'

const STORE_FILE = 'ai-engineer.json'

const EMPTY: AiEngineerDocument = {
  version: 1,
  config: DEFAULT_CONFIG,
  analyses: [],
  suites: [],
  runs: [],
  findings: []
}

export class AiEngineerRepository {
  private cache: AiEngineerDocument | null = null

  load(): AiEngineerDocument {
    if (this.cache) return this.cache
    const raw = readJsonFile<Partial<AiEngineerDocument>>(STORE_FILE, EMPTY)
    this.cache = {
      version: 1,
      config: { ...DEFAULT_CONFIG, ...(raw.config ?? {}) },
      analyses: Array.isArray(raw.analyses) ? raw.analyses : [],
      suites: Array.isArray(raw.suites) ? raw.suites : [],
      runs: Array.isArray(raw.runs) ? raw.runs : [],
      findings: Array.isArray(raw.findings) ? raw.findings : []
    }
    return this.cache
  }

  private persist(doc: AiEngineerDocument): void {
    writeJsonFile(STORE_FILE, doc)
    this.cache = doc
  }

  getConfig(): AiEngineerConfig {
    return { ...this.load().config }
  }

  updateConfig(patch: Partial<AiEngineerConfig>): AiEngineerConfig {
    const doc = this.load()
    doc.config = { ...doc.config, ...patch }
    this.persist(doc)
    return doc.config
  }

  saveAnalysis(record: ApiAnalysisRecord): ApiAnalysisRecord {
    const doc = this.load()
    doc.analyses = [record, ...doc.analyses.filter((a) => a.id !== record.id)].slice(0, 50)
    this.persist(doc)
    return record
  }

  getAnalysis(id: string): ApiAnalysisRecord | undefined {
    return this.load().analyses.find((a) => a.id === id)
  }

  listAnalyses(): ApiAnalysisRecord[] {
    return [...this.load().analyses]
  }

  saveSuite(suite: AiTestSuite): AiTestSuite {
    const doc = this.load()
    doc.suites = [suite, ...doc.suites.filter((s) => s.id !== suite.id)].slice(0, 100)
    this.persist(doc)
    return suite
  }

  getSuite(id: string): AiTestSuite | undefined {
    return this.load().suites.find((s) => s.id === id)
  }

  listSuites(): AiTestSuite[] {
    return [...this.load().suites]
  }

  saveRun(run: AiTestRun): AiTestRun {
    const doc = this.load()
    doc.runs = [run, ...doc.runs.filter((r) => r.id !== run.id)].slice(0, 100)
    this.persist(doc)
    return run
  }

  getRun(id: string): AiTestRun | undefined {
    return this.load().runs.find((r) => r.id === id)
  }

  listRuns(): AiTestRun[] {
    return [...this.load().runs]
  }

  addFinding(finding: AiFinding): AiFinding {
    const doc = this.load()
    doc.findings = [finding, ...doc.findings.filter((f) => f.id !== finding.id)].slice(0, 200)
    this.persist(doc)
    return finding
  }

  listFindings(): AiFinding[] {
    return [...this.load().findings]
  }

  getDashboardStats() {
    const doc = this.load()
    const latestAnalysis = doc.analyses[0]
    const runs = doc.runs
    const totalTests = runs.reduce((s, r) => s + r.total, 0)
    const passed = runs.reduce((s, r) => s + r.passed, 0)
    const findings = doc.findings
    return {
      endpointCount: latestAnalysis?.spec.endpointCount ?? 0,
      analysisCount: doc.analyses.length,
      suiteCount: doc.suites.length,
      runCount: runs.length,
      testsExecuted: totalTests,
      passRate: totalTests > 0 ? Math.round((passed / totalTests) * 1000) / 10 : 0,
      findings: {
        high: findings.filter((f) => f.severity === 'high' || f.severity === 'critical').length,
        medium: findings.filter((f) => f.severity === 'medium').length,
        low: findings.filter((f) => f.severity === 'low' || f.severity === 'info').length
      },
      recentFindings: findings.slice(0, 5)
    }
  }
}

export const aiEngineerRepository = new AiEngineerRepository()
