import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Bot,
  FlaskConical,
  Play,
  RefreshCw,
  Shield,
  Sparkles,
  Upload
} from 'lucide-react'
import { toast } from 'sonner'
import { ModulePage, PageContent, PageHeader } from '@/shared/components/layout/ModulePage'
import { Button } from '@/shared/components/ui/button'
import { Switch } from '@/shared/components/ui/switch'
import { Badge } from '@/shared/components/ui/badge'
import { ScrollArea } from '@/shared/components/ui/scroll-area'
import { Card } from '@/shared/components/ui/card'
import { useAiEngineerStore } from '../stores/aiEngineerStore'
import { useApiStudioStore } from '@/modules/api-studio/stores/apiStudioStore'
import { cn } from '@/shared/lib/utils'

export function AIEngineerPage() {
  const collections = useApiStudioStore((s) => s.collections)
  const environments = useApiStudioStore((s) => s.environments)
  const activeEnvironmentId = useApiStudioStore((s) => s.activeEnvironmentId)

  const {
    config,
    providerOnline,
    dashboard,
    analyses,
    suites,
    activeRun,
    busy,
    progress,
    loadAll,
    updateConfig,
    analyzeCollection,
    analyzeOpenApi,
    generateTests,
    runSuite,
    selectedAnalysisId,
    selectedSuiteId
  } = useAiEngineerStore()

  const [collectionId, setCollectionId] = useState<string>('')

  useEffect(() => {
    void loadAll()
  }, [loadAll])

  useEffect(() => {
    if (!collectionId && collections[0]) setCollectionId(collections[0].id)
  }, [collections, collectionId])

  const selectedAnalysis = analyses.find((a) => a.id === selectedAnalysisId) ?? analyses[0]
  const selectedSuite = suites.find((s) => s.id === selectedSuiteId) ?? suites[0]
  const selectedCollection = collections.find((c) => c.id === collectionId) ?? null

  const envVariables = useMemo(() => {
    const env = environments.find((e) => e.id === activeEnvironmentId)
    if (!env) return {}
    const out: Record<string, string> = {}
    for (const v of env.variables) {
      if (v.enabled && v.key.trim()) out[v.key] = v.value
    }
    return out
  }, [environments, activeEnvironmentId])

  const handleAnalyze = useCallback(async () => {
    if (!selectedCollection) {
      toast.error('Select a collection to analyze')
      return
    }
    const record = await analyzeCollection(selectedCollection)
    if (record) toast.success(`Analyzed ${record.spec.endpointCount} endpoints`)
    else toast.error('Analysis failed')
  }, [analyzeCollection, selectedCollection])

  const handleGenerate = useCallback(async () => {
    if (!selectedAnalysis) {
      toast.error('Run analysis first')
      return
    }
    const suite = await generateTests(selectedAnalysis.id)
    if (suite) toast.success(`Generated ${suite.tests.length} tests (${suite.aiGenerated ? 'AI + baseline' : 'baseline'})`)
    else toast.error('Could not generate tests')
  }, [generateTests, selectedAnalysis])

  const handleRun = useCallback(
    async (approvedMutations: boolean) => {
      if (!selectedSuite || !config) {
        toast.error('Generate a test suite first')
        return
      }
      const run = await runSuite(selectedSuite, selectedCollection, approvedMutations, envVariables)
      if (run) toast.success(`Run complete — ${run.passed} passed, ${run.failed} failed, ${run.skipped} skipped`)
      else toast.error('Test run failed')
    },
    [selectedSuite, config, runSuite, selectedCollection, envVariables]
  )

  async function importOpenApiFile(file: File) {
    const text = await file.text()
    const record = await analyzeOpenApi(text, file.name.replace(/\.[^.]+$/, ''))
    if (record) toast.success(`Imported OpenAPI — ${record.spec.endpointCount} endpoints`)
    else toast.error('OpenAPI import failed')
  }

  return (
    <ModulePage>
      <PageHeader
        title="AI Engineer"
        description="Understand, generate tests, execute with your existing request engine, and analyze failures — with evidence."
        actions={
          <Button size="sm" variant="outline" onClick={() => void loadAll()} disabled={busy}>
            <RefreshCw className={cn('h-3.5 w-3.5', busy && 'animate-spin')} /> Refresh
          </Button>
        }
      />
      <PageContent className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden p-4">
        <div className="flex flex-wrap items-center gap-4 rounded-xl border border-border bg-card/40 p-3 text-xs">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="font-medium">AI provider</span>
            <Badge variant={providerOnline ? 'success' : 'secondary'}>
              {providerOnline ? 'Online' : 'Unavailable — baseline analysis still works'}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={config?.sendApiDataToAi ?? false}
              onCheckedChange={(v) => void updateConfig({ sendApiDataToAi: v })}
            />
            <span>Send API data to AI provider (sanitized)</span>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={config?.requireApprovalForMutations ?? true}
              onCheckedChange={(v) => void updateConfig({ requireApprovalForMutations: v })}
            />
            <span>Require approval for POST/PUT/PATCH/DELETE tests</span>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-3">
          <Card className="flex flex-col p-4 lg:col-span-1">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <Bot className="h-4 w-4" /> Dashboard
            </h2>
            <dl className="space-y-2 text-xs">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Endpoints (latest)</dt>
                <dd className="font-mono">{dashboard?.endpointCount ?? 0}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Tests executed</dt>
                <dd className="font-mono">{dashboard?.testsExecuted ?? 0}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Pass rate</dt>
                <dd className="font-mono">{dashboard?.passRate ?? 0}%</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Findings</dt>
                <dd className="font-mono">
                  {dashboard?.findings.high ?? 0} high · {dashboard?.findings.medium ?? 0} med
                </dd>
              </div>
            </dl>

            <div className="mt-4 space-y-2">
              <label className="text-xs font-medium">Collection</label>
              <select
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs"
                value={collectionId}
                onChange={(e) => setCollectionId(e.target.value)}
              >
                {collections.length === 0 ? (
                  <option value="">No collections</option>
                ) : (
                  collections.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))
                )}
              </select>
              <Button className="w-full" size="sm" disabled={busy || !selectedCollection} onClick={() => void handleAnalyze()}>
                Analyze API
              </Button>
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-border py-2 text-xs text-muted-foreground hover:bg-accent/40">
                <Upload className="h-3.5 w-3.5" /> Import OpenAPI JSON
                <input
                  type="file"
                  accept=".json,application/json"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) void importOpenApiFile(f)
                    e.target.value = ''
                  }}
                />
              </label>
            </div>
          </Card>

          <Card className="flex min-h-0 flex-col p-4 lg:col-span-1">
            <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <FlaskConical className="h-4 w-4" /> Analysis & tests
            </h2>
            {selectedAnalysis ? (
              <div className="mb-3 space-y-1 text-xs">
                <p className="font-medium">{selectedAnalysis.collectionName ?? selectedAnalysis.spec.name}</p>
                <p className="text-muted-foreground">
                  {selectedAnalysis.spec.endpointCount} endpoints · {selectedAnalysis.spec.authEndpointCount} auth-related ·{' '}
                  {selectedAnalysis.spec.protectedEndpointCount} protected
                </p>
                {selectedAnalysis.aiEnriched && (
                  <Badge variant="outline" className="text-[10px]">
                    AI-enriched summary
                  </Badge>
                )}
              </div>
            ) : (
              <p className="mb-3 text-xs text-muted-foreground">No analysis yet.</p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" disabled={busy || !selectedAnalysis} onClick={() => void handleGenerate()}>
                Generate tests
              </Button>
              <Button size="sm" disabled={busy || !selectedSuite} onClick={() => void handleRun(false)}>
                <Play className="h-3.5 w-3.5" /> Run safe tests
              </Button>
              <Button size="sm" variant="secondary" disabled={busy || !selectedSuite} onClick={() => void handleRun(true)}>
                Run all (approved)
              </Button>
            </div>
            {selectedSuite && (
              <p className="mt-2 text-[10px] text-muted-foreground">
                Suite: {selectedSuite.tests.length} tests · {selectedSuite.tests.filter((t) => t.aiGenerated).length} AI-generated
              </p>
            )}
            {progress && (
              <p className="mt-3 text-xs text-primary">
                {progress.label} ({progress.current}/{progress.total})
              </p>
            )}
            {selectedAnalysis?.aiSummary && (
              <ScrollArea className="mt-3 max-h-40 rounded-md border border-border/60 bg-muted/20 p-2 text-[11px]">
                <pre className="whitespace-pre-wrap font-sans">{selectedAnalysis.aiSummary}</pre>
              </ScrollArea>
            )}
          </Card>

          <Card className="flex min-h-0 flex-col p-4 lg:col-span-1">
            <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <Shield className="h-4 w-4" /> Latest run
            </h2>
            {!activeRun ? (
              <p className="text-xs text-muted-foreground">Run a test suite to see results.</p>
            ) : (
              <>
                <p className="mb-2 text-xs">
                  <span className="text-emerald-600">{activeRun.passed} passed</span> ·{' '}
                  <span className="text-destructive">{activeRun.failed} failed</span> · {activeRun.skipped} skipped
                </p>
                <ScrollArea className="min-h-0 flex-1">
                  {activeRun.results.map((r) => (
                    <div key={r.testId} className="border-b border-border/40 py-1.5 text-[11px]">
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={
                            r.status === 'passed' ? 'success' : r.status === 'skipped' ? 'secondary' : 'destructive'
                          }
                        >
                          {r.status}
                        </Badge>
                        <span className="min-w-0 flex-1 truncate">{r.testName}</span>
                        <span className="font-mono text-muted-foreground">{r.statusCode || '—'}</span>
                      </div>
                      {r.status === 'failed' && (
                        <p className="mt-1 text-muted-foreground">
                          {r.assertionResults.find((a) => !a.passed)?.message ?? r.error}
                        </p>
                      )}
                    </div>
                  ))}
                </ScrollArea>
                {activeRun.failureAnalyses.length > 0 && (
                  <div className="mt-2 border-t border-border pt-2">
                    <p className="mb-1 text-xs font-medium">Failure analysis {activeRun.failureAnalyses[0]?.aiGenerated && '(AI)'}</p>
                    <p className="text-[11px] text-muted-foreground">{activeRun.failureAnalyses[0]?.likelyExplanation}</p>
                  </div>
                )}
              </>
            )}
          </Card>
        </div>
      </PageContent>
    </ModulePage>
  )
}
