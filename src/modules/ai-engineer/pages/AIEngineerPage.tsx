import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FlaskConical, Play, RefreshCw, Shield, Sparkles, Upload } from 'lucide-react'
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
  const fileInputRef = useRef<HTMLInputElement>(null)

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
    if (suite)
      toast.success(
        `Generated ${suite.tests.length} tests (${suite.aiGenerated ? 'AI + baseline' : 'baseline'})`
      )
    else toast.error('Could not generate tests')
  }, [generateTests, selectedAnalysis])

  const handleRun = useCallback(
    async (approvedMutations: boolean) => {
      if (!selectedSuite || !config) {
        toast.error('Generate a test suite first')
        return
      }
      const run = await runSuite(selectedSuite, selectedCollection, approvedMutations, envVariables)
      if (run)
        toast.success(
          `Run complete — ${run.passed} passed, ${run.failed} failed, ${run.skipped} skipped`
        )
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

  const findingsHigh = dashboard?.findings.high ?? 0
  const findingsMedium = dashboard?.findings.medium ?? 0

  return (
    <ModulePage>
      <PageHeader
        title="AI Engineer"
        description="Analyze a collection, generate tests, run them against your API, and explain failures."
        actions={
          <>
            <select
              aria-label="Collection"
              className="h-8 min-w-[180px] rounded-md border border-input bg-background px-2 text-xs"
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
            <Button
              size="sm"
              disabled={busy || !selectedCollection}
              onClick={() => void handleAnalyze()}
            >
              <Sparkles className="h-3.5 w-3.5" /> Analyze API
            </Button>
            <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()}>
              <Upload className="h-3.5 w-3.5" /> Import OpenAPI
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void importOpenApiFile(f)
                e.target.value = ''
              }}
            />
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              title="Refresh"
              aria-label="Refresh"
              onClick={() => void loadAll()}
              disabled={busy}
            >
              <RefreshCw className={cn('h-3.5 w-3.5', busy && 'animate-spin')} />
            </Button>
          </>
        }
      />
      <PageContent fullBleed className="gap-4 overflow-hidden p-5">
        <div className="grid shrink-0 grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile
            label="Endpoints"
            value={dashboard?.endpointCount ?? 0}
            hint="in latest analysis"
          />
          <StatTile
            label="Tests executed"
            value={dashboard?.testsExecuted ?? 0}
            hint="across all runs"
          />
          <StatTile label="Pass rate" value={`${dashboard?.passRate ?? 0}%`} hint="latest run" />
          <StatTile
            label="Findings"
            value={findingsHigh + findingsMedium}
            hint={`${findingsHigh} high · ${findingsMedium} medium`}
            tone={findingsHigh > 0 ? 'danger' : undefined}
          />
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-border bg-card px-4 py-2.5 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">AI provider</span>
            <Badge variant={providerOnline ? 'success' : 'secondary'}>
              {providerOnline ? 'Online' : 'Offline · baseline analysis only'}
            </Badge>
          </div>
          <div className="h-4 w-px bg-border" aria-hidden />
          <label className="flex cursor-pointer items-center gap-2">
            <Switch
              checked={config?.sendApiDataToAi ?? false}
              onCheckedChange={(v) => void updateConfig({ sendApiDataToAi: v })}
            />
            <span>Send sanitized API data to AI</span>
          </label>
          <label className="flex cursor-pointer items-center gap-2">
            <Switch
              checked={config?.requireApprovalForMutations ?? true}
              onCheckedChange={(v) => void updateConfig({ requireApprovalForMutations: v })}
            />
            <span>Require approval for write methods (POST/PUT/PATCH/DELETE)</span>
          </label>
        </div>

        <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-5">
          <Card className="flex min-h-0 flex-col lg:col-span-2">
            <PanelHeading icon={<FlaskConical className="h-4 w-4" />} title="Test suite" />
            <div className="flex min-h-0 flex-1 flex-col gap-4 p-4">
              {selectedAnalysis ? (
                <div className="space-y-1">
                  <p className="text-sm font-medium">
                    {selectedAnalysis.collectionName ?? selectedAnalysis.spec.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {selectedAnalysis.spec.endpointCount} endpoints ·{' '}
                    {selectedAnalysis.spec.authEndpointCount} auth-related ·{' '}
                    {selectedAnalysis.spec.protectedEndpointCount} protected
                  </p>
                  {selectedAnalysis.aiEnriched && (
                    <Badge variant="outline" className="text-[10px]">
                      AI-enriched summary
                    </Badge>
                  )}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Choose a collection and click{' '}
                  <span className="font-medium text-foreground">Analyze API</span> to get started.
                </p>
              )}

              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy || !selectedAnalysis}
                  onClick={() => void handleGenerate()}
                >
                  Generate tests
                </Button>
                <Button
                  size="sm"
                  disabled={busy || !selectedSuite}
                  onClick={() => void handleRun(false)}
                >
                  <Play className="h-3.5 w-3.5" /> Run safe tests
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busy || !selectedSuite}
                  onClick={() => void handleRun(true)}
                >
                  Run all (approved)
                </Button>
              </div>

              {selectedSuite && (
                <p className="text-[11px] text-muted-foreground">
                  {selectedSuite.tests.length} tests in suite ·{' '}
                  {selectedSuite.tests.filter((t) => t.aiGenerated).length} AI-generated
                </p>
              )}
              {progress && (
                <p className="text-xs text-primary">
                  {progress.label} ({progress.current}/{progress.total})
                </p>
              )}
              {selectedAnalysis?.aiSummary && (
                <ScrollArea className="min-h-0 flex-1 rounded-md border border-border/60 bg-muted/20 p-3 text-[11px]">
                  <pre className="whitespace-pre-wrap font-sans">{selectedAnalysis.aiSummary}</pre>
                </ScrollArea>
              )}
            </div>
          </Card>

          <Card className="flex min-h-0 flex-col lg:col-span-3">
            <PanelHeading
              icon={<Shield className="h-4 w-4" />}
              title="Latest run"
              meta={
                activeRun && (
                  <span className="flex items-center gap-3 text-xs">
                    <span className="text-emerald-600 dark:text-emerald-400">
                      {activeRun.passed} passed
                    </span>
                    <span className="text-destructive">{activeRun.failed} failed</span>
                    <span className="text-muted-foreground">{activeRun.skipped} skipped</span>
                  </span>
                )
              }
            />
            {!activeRun ? (
              <div className="flex flex-1 items-center justify-center p-8 text-center text-xs text-muted-foreground">
                Results appear here after you run a test suite.
              </div>
            ) : (
              <>
                <ScrollArea className="min-h-0 flex-1">
                  {activeRun.results.map((r) => (
                    <div key={r.testId} className="border-b border-border/40 px-4 py-2 text-xs">
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={
                            r.status === 'passed'
                              ? 'success'
                              : r.status === 'skipped'
                                ? 'secondary'
                                : 'destructive'
                          }
                        >
                          {r.status}
                        </Badge>
                        <span className="min-w-0 flex-1 truncate">{r.testName}</span>
                        <span className="font-mono text-muted-foreground">
                          {r.statusCode || '—'}
                        </span>
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
                  <div className="border-t border-border px-4 py-3">
                    <p className="mb-1 text-xs font-medium">
                      Failure analysis {activeRun.failureAnalyses[0]?.aiGenerated && '(AI)'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {activeRun.failureAnalyses[0]?.likelyExplanation}
                    </p>
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

function StatTile({
  label,
  value,
  hint,
  tone
}: {
  label: string
  value: string | number
  hint?: string
  tone?: 'danger'
}) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          'mt-1 text-2xl font-semibold tabular-nums tracking-tight',
          tone === 'danger' && 'text-destructive'
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  )
}

function PanelHeading({
  icon,
  title,
  meta
}: {
  icon: React.ReactNode
  title: string
  meta?: React.ReactNode
}) {
  return (
    <div className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-border px-4">
      <h2 className="flex items-center gap-2 text-[13px] font-semibold">
        <span className="text-muted-foreground">{icon}</span>
        {title}
      </h2>
      {meta}
    </div>
  )
}
