import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bot, ChevronRight, Eye, FileJson, Folder, FolderOpen, GitCompare, ShieldAlert, FolderSearch, GitMerge, Lock, RefreshCw, Server, Sparkles, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'
import type { AuthScheme, CodeScanConfidence, CodeScanResult, DetectedEndpoint } from '@shared/types/code-scanner'
import { ModulePage, ModuleTab, PageContent, PageHeader } from '@/shared/components/layout/ModulePage'
import { Button } from '@/shared/components/ui/button'
import { Badge } from '@/shared/components/ui/badge'
import { Card } from '@/shared/components/ui/card'
import { Input } from '@/shared/components/ui/input'
import { Switch } from '@/shared/components/ui/switch'
import { Spinner } from '@/shared/components/ui/spinner'
import { EmptyState } from '@/shared/components/ui/empty-state'
import { METHOD_COLORS } from '@/modules/api-studio/types/api.types'
import { cn } from '@/shared/lib/utils'
import { useCodeScannerStore } from '../stores/codeScannerStore'
import {
  analyzeInAiEngineer,
  applyScanMerge,
  createMockServer,
  defaultAccepted,
  exportOpenApi,
  importScannedEndpoints,
  planScanMerge,
  scannedCollections,
  type ScanMerge
} from '../services/importScan'
import { groupEndpoints, type EndpointGroup } from '@shared/lib/code-scanner/group'
import { validationCases } from '@shared/lib/code-scanner/validation-tests'
import { assessRisks, riskCounts, type RiskFinding, type RiskSeverity } from '@shared/lib/code-scanner/risks'
import { EnrichDialog } from '../components/EnrichDialog'
import { ScanDiffPanel } from '../components/ScanDiffPanel'
import { diffScans } from '@shared/lib/code-scanner/scan-diff'
import { MergeDialog } from '../components/MergeDialog'
import { useApiStudioStore } from '@/modules/api-studio/stores/apiStudioStore'

const SUPPORTED_FRAMEWORKS =
  'Express, Fastify, NestJS, Next.js, FastAPI, Flask and Django backends, OpenAPI files, and frontend calls (fetch, axios, SWR, RTK Query, Angular, GraphQL)'

type View = 'all' | 'backend' | 'frontend' | 'mismatches' | 'review'

const VIEW_FILTERS: Record<Exclude<View, 'review'>, (e: DetectedEndpoint) => boolean> = {
  all: () => true,
  backend: (e) => e.origin !== 'frontend',
  frontend: (e) => Boolean(e.callers?.length),
  mismatches: (e) => e.crossCheck === 'no-backend' || e.crossCheck === 'not-called'
}

const RISK_BADGE: Record<RiskSeverity, 'destructive' | 'warning' | 'outline'> = { high: 'destructive', medium: 'warning', low: 'outline' }

/** What an endpoint row needs from the page besides the endpoint itself. */
interface RowContext {
  risks: Map<string, RiskFinding[]>
  selected: Record<string, boolean>
  setSelected: (ids: string[], value: boolean) => void
  openSource: (file: string, line: number) => void
}

const CROSS_CHECK_BADGE = {
  'no-backend': { variant: 'warning', label: 'No backend route', title: 'The frontend calls this, but no backend route matches it.' },
  'not-called': { variant: 'outline', label: 'Not called', title: 'No frontend call to this route was found.' }
} as const

const CONFIDENCE_BADGE: Record<CodeScanConfidence, { variant: 'secondary' | 'warning'; label: string } | null> = {
  high: null,
  medium: { variant: 'secondary', label: 'Medium confidence' },
  low: { variant: 'warning', label: 'Low confidence' }
}

function authLabel(auth: AuthScheme): string {
  if (auth.type === 'apiKey') return `API key (${auth.in} ${auth.name})`
  if (auth.type === 'basic') return 'Basic auth'
  return auth.prefix && auth.prefix !== 'Bearer' ? `Authorization: ${auth.prefix} <token>` : 'Bearer token'
}

function matchesFilter(endpoint: DetectedEndpoint, filter: string): boolean {
  if (!filter) return true
  const haystack = `${endpoint.method} ${endpoint.host ?? ''}${endpoint.path} ${endpoint.summary ?? ''} ${endpoint.graphql?.operationName ?? ''} ${endpoint.sources.map((s) => s.file).join(' ')}`
  return haystack.toLowerCase().includes(filter.toLowerCase())
}

export function CodeScannerPage() {
  const { status, rootPath, progress, result, error, selected, chooseAndScan, rescan, cancel, setSelected, enrich, watching, setWatching } =
    useCodeScannerStore()

  const scanning = status === 'scanning'
  const busy = scanning || enrich.phase === 'running'
  // Re-scans of the open folder (by hand or by the watcher) keep the results on screen.
  const firstScan = scanning && result?.rootPath !== rootPath

  return (
    <ModulePage>
      <PageHeader
        title="Code Scanner"
        description="Find the API routes in a project and turn them into ready-to-send requests. Code is read locally and never uploaded."
        actions={
          <>
            {rootPath && result && (
              <label
                className="flex items-center gap-2 text-xs"
                title="Re-scan automatically when source files in this folder change, and show what changed"
              >
                <Switch
                  checked={watching}
                  onCheckedChange={(on) => void setWatching(on).catch((e: unknown) => toast.error(e instanceof Error ? e.message : String(e)))}
                />
                <Eye className="h-3.5 w-3.5" /> Watch
              </label>
            )}
            {rootPath && (
              <Button size="sm" variant="outline" onClick={() => void rescan()} disabled={busy}>
                <RefreshCw className={cn('h-3.5 w-3.5', scanning && 'animate-spin')} /> Rescan
              </Button>
            )}
            <Button size="sm" onClick={() => void chooseAndScan()} disabled={busy}>
              <FolderOpen className="h-3.5 w-3.5" /> Choose folder
            </Button>
          </>
        }
      />
      <PageContent>
        {firstScan ? (
          <Card className="mx-auto mt-8 max-w-xl p-6">
            <div className="flex items-center gap-3">
              <Spinner size="sm" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {progress?.phase === 'parsing' ? 'Analyzing files…' : 'Listing project files…'}
                </p>
                <p className="truncate font-mono text-[11px] text-muted-foreground">{progress?.currentFile ?? rootPath}</p>
              </div>
              <Button size="sm" variant="outline" onClick={() => void cancel()}>
                Cancel
              </Button>
            </div>
            {progress && progress.filesTotal > 0 && (
              <div className="mt-4">
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-[width]"
                    style={{ width: `${Math.round((progress.filesDone / progress.filesTotal) * 100)}%` }}
                  />
                </div>
                <p className="mt-1.5 text-right text-[11px] text-muted-foreground">
                  {progress.filesDone} / {progress.filesTotal} files
                </p>
              </div>
            )}
          </Card>
        ) : result && (status === 'done' || scanning) ? (
          <ScanResults result={result} selected={selected} setSelected={setSelected} />
        ) : (
          <>
            {status === 'error' && error && (
              <div className="mx-auto mt-6 flex max-w-xl items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-400">
                <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}
            <EmptyState
              icon={<FolderSearch className="h-5 w-5" />}
              title="Scan a project for API endpoints"
              description={`Pick a backend project folder. The scanner reads ${SUPPORTED_FRAMEWORKS}, and builds a collection you can send right away.`}
              action={
                <Button onClick={() => void chooseAndScan()}>
                  <FolderOpen className="h-4 w-4" /> Choose folder
                </Button>
              }
            />
          </>
        )}
      </PageContent>
    </ModulePage>
  )
}

function ScanResults({
  result,
  selected,
  setSelected
}: {
  result: CodeScanResult
  selected: Record<string, boolean>
  setSelected: (ids: string[], value: boolean) => void
}) {
  const navigate = useNavigate()
  const { enrich, prepareEnrich, runEnrich, cancelEnrich, closeEnrich, changes, dismissChanges, compare, compareWithRef, closeCompare } =
    useCodeScannerStore()
  const [refDraft, setRefDraft] = useState(compare.ref)
  const compareDiff = useMemo(() => (compare.base ? diffScans(compare.base, result.endpoints) : null), [compare.base, result.endpoints])
  const [filter, setFilter] = useState('')
  const [view, setView] = useState<View>('all')
  const [name, setName] = useState(result.projectName)
  const [baseUrl, setBaseUrl] = useState(result.baseUrl)
  const [createEnvironment, setCreateEnvironment] = useState(true)
  const [validationTests, setValidationTests] = useState(true)

  useEffect(() => {
    setName(result.projectName)
    setBaseUrl(result.baseUrl)
  }, [result.scanId, result.projectName, result.baseUrl])

  const risks = useMemo(() => assessRisks(result.endpoints), [result.endpoints])
  const riskTotals = useMemo(() => riskCounts(risks), [risks])
  const visible = useMemo(
    () =>
      result.endpoints.filter((e) => (view === 'review' ? risks.has(e.id) : VIEW_FILTERS[view](e)) && matchesFilter(e, filter)),
    [result.endpoints, filter, view, risks]
  )
  const counts = useMemo(
    () => ({
      backend: result.endpoints.filter(VIEW_FILTERS.backend).length,
      frontend: result.endpoints.filter(VIEW_FILTERS.frontend).length,
      mismatches: result.endpoints.filter(VIEW_FILTERS.mismatches).length,
      noBackend: result.endpoints.filter((e) => e.crossCheck === 'no-backend').length,
      notCalled: result.endpoints.filter((e) => e.crossCheck === 'not-called').length,
      called: result.endpoints.filter((e) => e.crossCheck === 'called').length
    }),
    [result.endpoints]
  )
  const crossChecked = counts.called + counts.noBackend + counts.notCalled > 0
  const chosen = result.endpoints.filter((e) => selected[e.id])
  const allVisibleSelected = visible.length > 0 && visible.every((e) => selected[e.id])
  // Same folders the imported collection gets: `/user/:id` and `/users` sit together.
  const groups = useMemo(() => groupEndpoints(visible), [visible])
  const openSource = (file: string, line: number) => {
    void window.electronAPI.codeScanner.openSource({ rootPath: result.rootPath, file, line }).then((res) => {
      if (!res.success) toast.error(res.error ?? 'Could not open the file')
      else if (!res.data?.editor) toast.info('Opened in the default app; install VS Code, Cursor, Windsurf or Zed to jump to the line')
    })
  }
  const row: RowContext = { risks, selected, setSelected, openSource }
  const unsupported = result.frameworks.filter((f) => !f.supported)

  const enrichable = chosen.filter((e) => !e.graphql)
  const enrichedCount = result.endpoints.filter((e) => e.aiEnriched?.length).length

  const handlePrepareEnrich = () => {
    prepareEnrich(enrichable.map((e) => e.id)).catch((e: unknown) => {
      toast.error(e instanceof Error ? e.message : 'Could not prepare AI enrichment')
    })
  }

  const handleRunEnrich = async () => {
    try {
      const outcome = await runEnrich()
      if (!outcome) return
      if (outcome.error && outcome.error !== 'Cancelled') toast.warning(outcome.error)
      const tokens = outcome.tokens ? ` (${outcome.tokens.toLocaleString()} tokens)` : ''
      if (outcome.enriched > 0) toast.success(`AI improved ${outcome.enriched} ${outcome.enriched === 1 ? 'endpoint' : 'endpoints'}${tokens}`)
      else if (outcome.error !== 'Cancelled') toast.info(`The AI didn't add anything the code supports${tokens}`)
      if (outcome.failedBatches > 0) toast.warning(`${outcome.failedBatches} AI ${outcome.failedBatches === 1 ? 'request' : 'requests'} failed; those endpoints are unchanged`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'AI enrichment failed')
    }
  }

  // Import target: a new collection, or one the scanner created before (re-scan → merge).
  const collections = useApiStudioStore((s) => s.collections)
  const linked = useMemo(() => scannedCollections(collections), [collections])
  const [target, setTarget] = useState<string>('new')
  useEffect(() => {
    setTarget(linked.find((c) => c.source?.rootPath === result.rootPath)?.id ?? 'new')
    // Only when a new scan arrives; afterwards the choice is the user's.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result.scanId])
  const validationCount = chosen.reduce((n, e) => n + validationCases(e).length, 0)
  const importOptions = {
    name,
    baseUrl,
    rootPath: result.rootPath,
    createEnvironment,
    validationTests: validationTests && validationCount > 0,
    auth: result.auth
  }
  const [merge, setMerge] = useState<ScanMerge | null>(null)
  const [mergeInitial, setMergeInitial] = useState<Set<string>>(new Set())
  const [handoff, setHandoff] = useState<'openapi' | 'mock' | 'ai' | null>(null)

  const environmentNote = (env?: { name: string; reused: boolean }) =>
    env ? `${env.reused ? 'Updated' : 'Created'} and switched to environment "${env.name}"` : `Requests use ${baseUrl} directly`

  const handleImport = () => {
    if (chosen.length === 0) return
    const imported = importScannedEndpoints(chosen, importOptions)
    toast.success(`Created "${name.trim() || 'Scanned API'}" with ${imported.requests} requests`, {
      description: environmentNote(imported.environment)
    })
    navigate('/')
  }

  const handleReviewMerge = () => {
    const planned = planScanMerge(target, result.endpoints, importOptions)
    if (!planned) {
      toast.error('That collection no longer exists')
      setTarget('new')
      return
    }
    setMergeInitial(defaultAccepted(planned.plan, chosen))
    setMerge(planned)
  }

  const handleApplyMerge = (accepted: Set<string>) => {
    if (!merge) return
    const outcome = applyScanMerge(merge, accepted, importOptions)
    setMerge(null)
    const { added, updated, conflict, removed } = outcome.counts
    const parts = [
      added && `${added} added`,
      updated + conflict && `${updated + conflict} updated`,
      removed && `${removed} removed`
    ].filter(Boolean)
    toast.success(`Updated "${merge.collection.name}": ${parts.join(', ') || 'no changes'}`, {
      description: environmentNote(outcome.environment)
    })
    navigate('/')
  }

  const runHandoff = async (kind: 'openapi' | 'mock' | 'ai') => {
    const title = name.trim() || result.projectName
    setHandoff(kind)
    try {
      if (kind === 'openapi') {
        const path = await exportOpenApi(chosen, title, baseUrl, result.auth)
        if (path) toast.success('OpenAPI document saved', { description: path })
      } else if (kind === 'mock') {
        const { routes } = await createMockServer(chosen, title)
        toast.success(`Created "${title} Mock" with ${routes} routes`)
        navigate('/mock-servers')
      } else {
        await analyzeInAiEngineer(chosen, title, baseUrl, result.auth)
        toast.success('Sent to AI Engineer', { description: 'Generate tests from the new analysis there.' })
        navigate('/ai-engineer')
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setHandoff(null)
    }
  }

  return (
    <div className="space-y-4 py-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
        <span className="max-w-full truncate font-mono" title={result.rootPath}>
          {result.rootPath}
        </span>
        <span>
          {result.endpoints.length} endpoints · {result.stats.filesScanned} files · {(result.stats.durationMs / 1000).toFixed(1)}s
        </span>
        <div className="flex flex-wrap gap-1.5">
          {result.frameworks.map((fw) => (
            <Badge
              key={fw.id}
              variant={fw.supported ? 'success' : 'outline'}
              title={fw.supported ? `Detected in ${fw.evidence}` : `Detected in ${fw.evidence}. Route extraction is not supported yet.`}
            >
              {fw.label}
            </Badge>
          ))}
          {result.auth && (
            <Badge variant="info" title="How the collection will send credentials for protected endpoints">
              <Lock className="h-3 w-3" /> {authLabel(result.auth)}
            </Badge>
          )}
        </div>
      </div>

      <form
        className="flex flex-wrap items-center gap-2 text-xs"
        onSubmit={(e) => {
          e.preventDefault()
          if (refDraft.trim()) void compareWithRef(refDraft.trim())
        }}
      >
        <GitCompare className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-muted-foreground">Compare with branch</span>
        <Input
          value={refDraft}
          onChange={(e) => setRefDraft(e.target.value)}
          placeholder="main"
          aria-label="Branch, tag or commit to compare with"
          className="h-7 w-40 font-mono text-xs"
        />
        <Button size="sm" variant="outline" type="submit" disabled={compare.phase === 'running' || !refDraft.trim()}>
          {compare.phase === 'running' ? 'Scanning…' : 'Compare'}
        </Button>
        {compare.phase === 'error' && <span className="text-destructive">{compare.error}</span>}
      </form>

      {changes && (
        <ScanDiffPanel
          title="Code changed since the last scan"
          diff={changes}
          onClose={dismissChanges}
          actions={
            target !== 'new' ? (
              <Button size="sm" variant="ghost" onClick={handleReviewMerge}>
                <GitMerge className="h-3.5 w-3.5" /> Update collection
              </Button>
            ) : null
          }
        />
      )}
      {compare.phase === 'done' && compareDiff && (
        <ScanDiffPanel
          title={`API changes compared with ${compare.ref}${compare.commit ? ` (${compare.commit.slice(0, 7)})` : ''}`}
          diff={compareDiff}
          onClose={closeCompare}
        />
      )}

      {crossChecked && (
        <p className="text-xs text-muted-foreground">
          Compared backend routes with frontend calls: {counts.called} called by the frontend
          {counts.noBackend > 0 && (
            <span className="text-amber-700 dark:text-amber-400">
              {' '}· {counts.noBackend} {counts.noBackend === 1 ? 'call has' : 'calls have'} no backend route
            </span>
          )}
          {counts.notCalled > 0 && <span> · {counts.notCalled} {counts.notCalled === 1 ? 'route is' : 'routes are'} never called</span>}
        </p>
      )}

      {result.stats.truncated && (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          The project has more files than the scan limit, so some were not read. Scan a subfolder for full coverage.
        </p>
      )}

      {result.endpoints.length === 0 ? (
        <EmptyState
          icon={<FolderSearch className="h-5 w-5" />}
          title="No endpoints found"
          description={
            unsupported.length > 0
              ? `Detected ${unsupported.map((f) => f.label).join(', ')}, which the scanner can't read yet. Supported today: ${SUPPORTED_FRAMEWORKS}.`
              : `The scanner reads ${SUPPORTED_FRAMEWORKS}. Try choosing the backend folder itself.`
          }
        />
      ) : (
        <>
          <Card className="grid gap-3 p-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
            <div className="space-y-1.5">
              <span className="flex items-center justify-between gap-2 text-xs font-medium">
                Collection
                {linked.length > 0 && (
                  <select
                    aria-label="Import target"
                    className="h-6 max-w-[14rem] truncate rounded-md border border-input bg-background px-1.5 text-[11px] font-normal"
                    value={target}
                    onChange={(e) => setTarget(e.target.value)}
                  >
                    <option value="new">New collection</option>
                    {linked.map((c) => (
                      <option key={c.id} value={c.id}>
                        Update “{c.name}”
                      </option>
                    ))}
                  </select>
                )}
              </span>
              {target === 'new' ? (
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              ) : (
                <p className="flex h-9 items-center truncate rounded-lg border border-dashed border-border px-3 text-xs text-muted-foreground">
                  Changes from this scan are merged; your edits are kept.
                </p>
              )}
            </div>
            <label className="space-y-1.5">
              <span className="text-xs font-medium">Base URL</span>
              <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} className="font-mono text-xs" />
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-xs">
                <Switch checked={createEnvironment} onCheckedChange={setCreateEnvironment} />
                <span title="On: requests use {{baseUrl}} from an environment. Off: the base URL is written into each request.">
                  Use environment
                </span>
              </label>
              {validationCount > 0 && (
                <label className="flex items-center gap-2 text-xs">
                  <Switch checked={validationTests} onCheckedChange={setValidationTests} />
                  <span title="Requests that each break one rule the code validates (missing field, bad email, too short, …) and expect the API to reject them with a 4xx.">
                    Validation tests ({validationCount})
                  </span>
                </label>
              )}
              <Button
                variant="outline"
                onClick={handlePrepareEnrich}
                disabled={enrichable.length === 0 || enrich.phase !== 'idle'}
                title="Optional: use your AI provider to add example values, descriptions and example responses"
              >
                <Sparkles className="h-3.5 w-3.5" /> {enrich.phase === 'estimating' ? 'Checking…' : 'Enrich with AI'}
              </Button>
              {target === 'new' ? (
                <Button onClick={handleImport} disabled={chosen.length === 0 || enrich.phase === 'running'}>
                  Import {chosen.length} {chosen.length === 1 ? 'request' : 'requests'}
                </Button>
              ) : (
                <Button onClick={handleReviewMerge} disabled={enrich.phase === 'running'}>
                  <GitMerge className="h-3.5 w-3.5" /> Review changes
                </Button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3 text-xs md:col-span-3">
              <span className="text-muted-foreground">Use the {chosen.length} selected endpoints:</span>
              <Button size="sm" variant="ghost" disabled={handoff !== null || chosen.length === 0} onClick={() => void runHandoff('mock')}>
                <Server className="h-3.5 w-3.5" /> {handoff === 'mock' ? 'Creating…' : 'Create mock server'}
              </Button>
              <Button size="sm" variant="ghost" disabled={handoff !== null || chosen.length === 0} onClick={() => void runHandoff('ai')}>
                <Bot className="h-3.5 w-3.5" /> {handoff === 'ai' ? 'Sending…' : 'Test in AI Engineer'}
              </Button>
              <Button size="sm" variant="ghost" disabled={handoff !== null || chosen.length === 0} onClick={() => void runHandoff('openapi')}>
                <FileJson className="h-3.5 w-3.5" /> Export OpenAPI
              </Button>
            </div>
            {enrich.phase === 'running' && (
              <div className="flex items-center gap-3 md:col-span-3">
                <Spinner size="sm" />
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-[width]"
                    style={{ width: `${enrich.progress && enrich.progress.total ? Math.round((enrich.progress.done / enrich.progress.total) * 100) : 0}%` }}
                  />
                </div>
                <span className="text-[11px] text-muted-foreground">
                  AI request {Math.min((enrich.progress?.done ?? 0) + 1, enrich.progress?.total ?? 1)} of {enrich.progress?.total ?? 1}
                </span>
                <Button size="sm" variant="outline" onClick={() => void cancelEnrich()}>
                  Cancel
                </Button>
              </div>
            )}
            {enrichedCount > 0 && enrich.phase === 'idle' && (
              <p className="text-[11px] text-muted-foreground md:col-span-3">
                <Sparkles className="mr-1 inline h-3 w-3 text-primary" />
                {enrichedCount} {enrichedCount === 1 ? 'endpoint was' : 'endpoints were'} improved by AI. Review them before sending requests.
              </p>
            )}
          </Card>
          <MergeDialog
            collectionName={merge?.collection.name ?? null}
            plan={merge?.plan ?? null}
            initial={mergeInitial}
            onCancel={() => setMerge(null)}
            onApply={handleApplyMerge}
          />
          <EnrichDialog
            estimate={enrich.phase === 'confirm' ? enrich.estimate : null}
            onCancel={closeEnrich}
            onConfirm={() => void handleRunEnrich()}
          />

          <Card className="overflow-hidden">
            {(counts.frontend > 0 || risks.size > 0) && (
              <div className="flex items-center gap-1 border-b border-border px-3 py-1.5">
                <ModuleTab active={view === 'all'} onClick={() => setView('all')} count={result.endpoints.length}>
                  All
                </ModuleTab>
                {counts.backend > 0 && counts.frontend > 0 && (
                  <ModuleTab active={view === 'backend'} onClick={() => setView('backend')} count={counts.backend}>
                    Backend routes
                  </ModuleTab>
                )}
                {counts.frontend > 0 && (
                  <ModuleTab active={view === 'frontend'} onClick={() => setView('frontend')} count={counts.frontend}>
                    Frontend calls
                  </ModuleTab>
                )}
                {crossChecked && (
                  <ModuleTab active={view === 'mismatches'} onClick={() => setView('mismatches')} count={counts.mismatches}>
                    Mismatches
                  </ModuleTab>
                )}
                {risks.size > 0 && (
                  <ModuleTab active={view === 'review'} onClick={() => setView('review')} count={risks.size}>
                    <span className="inline-flex items-center gap-1">
                      <ShieldAlert className="h-3.5 w-3.5" /> Review
                    </span>
                  </ModuleTab>
                )}
              </div>
            )}
            {view === 'review' && (
              <p className="border-b border-border bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
                {riskTotals.high} high, {riskTotals.medium} medium, {riskTotals.low} low. Found from what the scan knows about auth, frontend calls and
                validation: things to check, not confirmed vulnerabilities. Auth applied outside the scanned code (a gateway, another package) can
                make a route look open.
              </p>
            )}
            <div className="flex items-center gap-3 border-b border-border px-3 py-2">
              <input
                type="checkbox"
                aria-label="Select all visible endpoints"
                className="h-3.5 w-3.5 accent-primary"
                checked={allVisibleSelected}
                onChange={(e) => setSelected(visible.map((v) => v.id), e.target.checked)}
              />
              <Input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter by method, path or file"
                className="h-7 max-w-xs text-xs"
              />
              <span className="ml-auto text-[11px] text-muted-foreground">
                {chosen.length} of {result.endpoints.length} selected
              </span>
            </div>
            {groups.length > 1 ? (
              <div className="divide-y divide-border">
                {groups.map((group) => (
                  <EndpointGroupSection key={group.key} group={group} row={row} />
                ))}
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {visible.map((endpoint) => (
                  <EndpointRow key={endpoint.id} endpoint={endpoint} row={row} />
                ))}
              </ul>
            )}
          </Card>
        </>
      )}

      {result.warnings.length > 0 && (
        <details className="rounded-lg border border-border p-3 text-xs">
          <summary className="cursor-pointer font-medium">
            {result.warnings.length} {result.warnings.length === 1 ? 'note' : 'notes'} from the scan
          </summary>
          <ul className="mt-2 space-y-1 text-muted-foreground">
            {result.warnings.map((w, i) => (
              <li key={i}>
                {w.file && (
                  <span className="font-mono">
                    {w.file}
                    {w.line ? `:${w.line}` : ''}{' '}
                  </span>
                )}
                {w.message}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}

function EndpointGroupSection({ group, row }: { group: EndpointGroup; row: RowContext }) {
  const { selected, setSelected } = row
  const [open, setOpen] = useState(true)
  const ids = group.endpoints.map((e) => e.id)
  const count = ids.filter((id) => selected[id]).length
  return (
    <section>
      <div className="flex items-center gap-3 bg-muted/30 px-3 py-1.5">
        <input
          type="checkbox"
          aria-label={`Select all endpoints in ${group.name}`}
          className="h-3.5 w-3.5 accent-primary"
          checked={count === ids.length}
          ref={(el) => {
            if (el) el.indeterminate = count > 0 && count < ids.length
          }}
          onChange={(e) => setSelected(ids, e.target.checked)}
        />
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-xs font-medium"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          <ChevronRight className={cn('h-3.5 w-3.5 shrink-0 transition-transform', open && 'rotate-90')} />
          <Folder className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate">{group.name}</span>
          <span className="text-[11px] font-normal text-muted-foreground">
            {count === ids.length ? ids.length : `${count} of ${ids.length}`}
          </span>
        </button>
      </div>
      {open && (
        <ul className="divide-y divide-border border-t border-border">
          {group.endpoints.map((endpoint) => (
            <EndpointRow key={endpoint.id} endpoint={endpoint} row={row} />
          ))}
        </ul>
      )}
    </section>
  )
}

function EndpointRow({ endpoint, row }: { endpoint: DetectedEndpoint; row: RowContext }) {
  const checked = Boolean(row.selected[endpoint.id])
  const onChange = (value: boolean) => row.setSelected([endpoint.id], value)
  const findings = row.risks.get(endpoint.id)
  const topFinding = findings?.[0]
  const confidence = CONFIDENCE_BADGE[endpoint.confidence]
  const crossCheck = endpoint.crossCheck && endpoint.crossCheck !== 'called' ? CROSS_CHECK_BADGE[endpoint.crossCheck] : null
  const source = endpoint.sources[0]
  const methodLabel = endpoint.graphql ? 'GQL' : endpoint.method
  return (
    <li>
      <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-accent/40">
        <input
          type="checkbox"
          className="h-3.5 w-3.5 accent-primary"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className={cn('w-14 shrink-0 font-mono text-[11px] font-semibold', METHOD_COLORS[methodLabel])}>
          {methodLabel}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-xs">
            {endpoint.graphql ? (
              <>
                {endpoint.graphql.operationName ?? 'Anonymous operation'}
                <span className="text-muted-foreground"> · {endpoint.path}</span>
              </>
            ) : (
              <>
                {endpoint.host && <span className="text-muted-foreground">{endpoint.host}</span>}
                {endpoint.path}
              </>
            )}
          </p>
          {endpoint.summary && !endpoint.graphql && (
            <p className="truncate text-[11px] text-muted-foreground">{endpoint.summary}</p>
          )}
        </div>
        {endpoint.host && (
          <Badge variant="outline" className="shrink-0 text-[10px]" title="A third-party API the frontend calls directly">
            Third-party
          </Badge>
        )}
        {topFinding && topFinding.id !== 'broken-call' && topFinding.id !== 'unused-route' ? (
          <Badge
            variant={RISK_BADGE[topFinding.severity]}
            className="shrink-0 text-[10px]"
            title={findings!.map((f) => `${f.title}: ${f.detail}`).join('\n\n')}
          >
            {topFinding.title}
            {findings!.length > 1 ? ` +${findings!.length - 1}` : ''}
          </Badge>
        ) : (
          crossCheck && (
            <Badge variant={crossCheck.variant} className="shrink-0 text-[10px]" title={crossCheck.title}>
              {crossCheck.label}
            </Badge>
          )
        )}
        {endpoint.aiEnriched?.length ? (
          <span title={`Filled in by AI: ${endpoint.aiEnriched.join(', ')}`} className="shrink-0">
            <Sparkles className="h-3.5 w-3.5 text-primary" aria-label="Improved by AI" />
          </span>
        ) : null}
        {endpoint.securityRequired && (
          <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label="Requires authentication" />
        )}
        {confidence && (
          <Badge variant={confidence.variant} className="shrink-0 text-[10px]">
            {confidence.label}
          </Badge>
        )}
        {source && (
          <button
            type="button"
            className="hidden max-w-[16rem] shrink-0 truncate font-mono text-[11px] text-muted-foreground hover:text-foreground hover:underline md:inline"
            title={`Open in editor\n${endpoint.sources.map((s) => `${s.file}:${s.line}`).join('\n')}`}
            onClick={(e) => {
              // The row is a <label>; don't toggle the checkbox.
              e.preventDefault()
              row.openSource(source.file, source.line)
            }}
          >
            {source.file}:{source.line}
            {endpoint.sources.length > 1 ? ` +${endpoint.sources.length - 1}` : ''}
          </button>
        )}
      </label>
    </li>
  )
}
