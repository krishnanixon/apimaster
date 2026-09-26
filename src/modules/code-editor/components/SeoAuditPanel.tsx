import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  FileCode2,
  Link2Off,
  Loader2,
  RefreshCw,
  SearchCheck,
  Sparkles
} from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { cn } from '@/shared/lib/utils'
import { useCodeEditorStore } from '../stores/codeEditor.store'
import { useSeoAuditStore } from '../stores/seoAudit.store'
import { useAgentStore } from '../stores/agent.store'
import { useWorkbenchLayoutStore } from '../stores/workbench.store'
import type { SeoAuditCategory, SeoAuditSeverity } from '@shared/types/seo-audit'

const CATEGORY_LABEL: Record<SeoAuditCategory, string> = {
  crawlability: 'Crawlability',
  metadata: 'Metadata',
  content: 'Content',
  'structured-data': 'Structured data',
  citation: 'LLM citation',
  'code-quality': 'Code quality'
}

const SCORE_LABEL: Record<string, string> = {
  discoverability: 'Discoverability',
  machineUnderstanding: 'Machine understanding',
  citationReadiness: 'Citation readiness',
  codeQuality: 'Code quality'
}

const SEVERITY_CLASS: Record<SeoAuditSeverity, string> = {
  critical: 'bg-[var(--wb-danger)]',
  warning: 'bg-[var(--wb-warn)]',
  recommendation: 'bg-sky-500'
}

const FINDINGS_PAGE = 80
const PAGES_PAGE = 100

function scoreTone(value: number): string {
  if (value >= 80) return 'text-[var(--wb-ok)]'
  if (value >= 60) return 'text-[var(--wb-warn)]'
  return 'text-[var(--wb-danger)]'
}

export function SeoAuditPanel() {
  const rootPath = useCodeEditorStore((state) => state.rootPath)
  const openFileAtLine = useCodeEditorStore((state) => state.openFileAtLine)
  const setAgentMode = useAgentStore((state) => state.setMode)
  const setAgentDraft = useAgentStore((state) => state.setDraft)
  const openAgent = useWorkbenchLayoutStore((state) => state.openAgent)
  const report = useSeoAuditStore((state) => state.report)
  const crawlReport = useSeoAuditStore((state) => state.crawlReport)
  const auditLoading = useSeoAuditStore((state) => state.auditLoading)
  const crawlLoading = useSeoAuditStore((state) => state.crawlLoading)
  const error = useSeoAuditStore((state) => state.error)
  const run = useSeoAuditStore((state) => state.run)
  const crawl = useSeoAuditStore((state) => state.crawl)

  const [url, setUrl] = useState('http://localhost:3000')
  const [maxPages, setMaxPages] = useState(100)
  const [view, setView] = useState<'source' | 'live'>('source')
  const [liveTab, setLiveTab] = useState<'pages' | 'broken'>('pages')
  const [category, setCategory] = useState<SeoAuditCategory | 'all'>('all')
  const [severity, setSeverity] = useState<SeoAuditSeverity | 'all'>('all')
  const [filter, setFilter] = useState('')
  const [findingsLimit, setFindingsLimit] = useState(FINDINGS_PAGE)
  const [pagesLimit, setPagesLimit] = useState(PAGES_PAGE)

  const findings = useMemo(
    () =>
      report?.findings.filter((item) => {
        if (category !== 'all' && item.category !== category) return false
        if (severity !== 'all' && item.severity !== severity) return false
        const query = filter.trim().toLowerCase()
        return (
          !query ||
          `${item.title} ${item.message} ${item.relativePath} ${item.ruleId}`.toLowerCase().includes(query)
        )
      }) ?? [],
    [report, category, severity, filter]
  )
  const visibleFindings = findings.slice(0, findingsLimit)
  const visiblePages = crawlReport?.pages.slice(0, pagesLimit) ?? []
  const brokenLinks = crawlReport?.brokenLinks ?? []

  const fixWithAi = (item: NonNullable<typeof report>['findings'][number]) => {
    setAgentMode('edit')
    setAgentDraft(`Fix this SEO/LLM-search finding in ${item.relativePath}:${item.line}.

Rule: ${item.ruleId}
Issue: ${item.title}
Evidence: ${item.message}
Recommended direction: ${item.recommendation}

Inspect the surrounding code, make the smallest safe framework-aware change, preserve existing behavior, and validate the result. Do not invent factual claims, citations, metadata, or business information; leave a clear TODO when human input is required.`)
    openAgent()
  }

  return (
    <div className="flex h-full min-h-0 flex-col text-[12px]">
      <div className="wb-panel-header">
        <span className="text-[11px] text-[var(--wb-muted)]">
          {view === 'source' ? 'Workspace source heuristics' : 'Rendered site crawl'}
        </span>
        {view === 'source' ? (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            disabled={!rootPath || auditLoading}
            onClick={() => void run()}
            title="Audit workspace"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', auditLoading && 'animate-spin')} />
          </Button>
        ) : null}
      </div>

      <div className="wb-segment">
        <button type="button" data-active={view === 'source'} onClick={() => setView('source')}>
          Source audit
        </button>
        <button type="button" data-active={view === 'live'} onClick={() => setView('live')}>
          Live crawl
        </button>
      </div>

      {view === 'live' ? (
        <>
          <form
            className="flex flex-col gap-2 border-b border-[var(--wb-border)] p-2.5"
            onSubmit={(event) => {
              event.preventDefault()
              setPagesLimit(PAGES_PAGE)
              void crawl(url, maxPages)
            }}
          >
            <div className="flex gap-1.5">
              <input
                aria-label="Site URL"
                className="wb-field min-w-0 flex-1"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://example.com"
              />
              <Button size="sm" className="h-7 gap-1.5 px-3" disabled={crawlLoading || !url.trim()}>
                {crawlLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                Crawl
              </Button>
            </div>
            <label className="flex items-center justify-between gap-2 text-[10px] text-[var(--wb-muted)]">
              <span>Max pages</span>
              <select
                aria-label="Max pages"
                className="wb-field h-6 w-[4.5rem]"
                value={maxPages}
                onChange={(event) => setMaxPages(Number(event.target.value))}
              >
                {[25, 50, 100, 200, 500].map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
          </form>

          {crawlLoading && !crawlReport ? (
            <div className="wb-empty flex-row items-center gap-2 py-6">
              <Loader2 className="h-4 w-4 animate-spin text-[var(--wb-accent)]" />
              <p>Crawling site…</p>
            </div>
          ) : null}

          {crawlReport ? (
            <div className="wb-sidebar-scroll min-h-0 flex-1 overflow-y-auto">
              <div className="wb-score-grid grid-cols-3">
                <PolicyChip label="Google" allowed={crawlReport.policy.googleAllowed} />
                <PolicyChip label="ChatGPT" allowed={crawlReport.policy.openAiSearchAllowed} />
                <PolicyChip label="Bing" allowed={crawlReport.policy.bingAllowed} />
              </div>
              <div className="flex items-center justify-between border-b border-[var(--wb-border)] px-3 py-1.5 text-[10px] text-[var(--wb-muted)]">
                <span>
                  {crawlReport.pages.length} pages · {brokenLinks.length} broken ·{' '}
                  {(crawlReport.durationMs / 1000).toFixed(1)}s
                </span>
                {!crawlReport.policy.reachable ? (
                  <span className="inline-flex items-center gap-1 text-[var(--wb-warn)]">
                    <AlertTriangle className="h-3 w-3" /> robots.txt missing
                  </span>
                ) : null}
              </div>
              <div className="wb-segment">
                <button type="button" data-active={liveTab === 'pages'} onClick={() => setLiveTab('pages')}>
                  Pages
                </button>
                <button type="button" data-active={liveTab === 'broken'} onClick={() => setLiveTab('broken')}>
                  Broken ({brokenLinks.length})
                </button>
              </div>

              {liveTab === 'broken' ? (
                brokenLinks.length === 0 ? (
                  <p className="px-3 py-4 text-[var(--wb-ok)]">No broken links in this crawl.</p>
                ) : (
                  brokenLinks.map((link) => (
                    <div key={`${link.sourceUrl}-${link.targetUrl}`} className="wb-list-row">
                      <div className="flex items-start gap-2">
                        <Link2Off className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--wb-danger)]" />
                        <div className="min-w-0">
                          <p className="truncate font-medium text-[var(--wb-fg)]" title={link.targetUrl}>
                            <span className="mr-1.5 font-semibold text-[var(--wb-danger)]">
                              {link.status || 'ERR'}
                            </span>
                            {link.targetUrl}
                          </p>
                          <p className="mt-0.5 truncate text-[10px] text-[var(--wb-muted)]" title={link.sourceUrl}>
                            from {link.sourceUrl}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))
                )
              ) : (
                <>
                  {visiblePages.map((page) => (
                    <div key={page.url} className="wb-list-row">
                      <div className="flex gap-2">
                        <span
                          className={cn(
                            'shrink-0 font-semibold tabular-nums',
                            page.status >= 400 || page.status === 0
                              ? 'text-[var(--wb-danger)]'
                              : page.status >= 300
                                ? 'text-[var(--wb-warn)]'
                                : 'text-[var(--wb-ok)]'
                          )}
                        >
                          {page.status || 'ERR'}
                        </span>
                        <p className="min-w-0 truncate text-[var(--wb-fg)]" title={page.url}>
                          {page.url}
                        </p>
                      </div>
                      <p className="mt-1 truncate text-[11px] text-[var(--wb-muted)]">
                        {page.title ?? 'Missing title'} · H1 {page.h1Count} · {page.responseMs}ms
                        {page.description ? ` · ${page.description}` : ' · No description'}
                      </p>
                      {(page.canonical || page.robots || page.redirectUrl || page.error) && (
                        <p className="mt-0.5 truncate text-[10px] text-[var(--wb-muted)]">
                          {[
                            page.canonical ? `canonical ${page.canonical}` : null,
                            page.robots ? `robots ${page.robots}` : null,
                            page.redirectUrl ? `→ ${page.redirectUrl}` : null,
                            page.error
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      )}
                    </div>
                  ))}
                  {crawlReport.pages.length > pagesLimit ? (
                    <button
                      type="button"
                      className="wb-show-more"
                      onClick={() => setPagesLimit((value) => value + PAGES_PAGE)}
                    >
                      Show more ({crawlReport.pages.length - pagesLimit} remaining)
                    </button>
                  ) : null}
                </>
              )}
            </div>
          ) : !crawlLoading ? (
            <div className="wb-empty">
              <SearchCheck />
              <p>
                Crawl a local, staging, or production site to inspect status codes, titles, descriptions,
                canonicals, redirects, broken links, and AI crawler access.
              </p>
            </div>
          ) : null}
          {error && view === 'live' ? <p className="px-3 py-2 text-destructive">{error}</p> : null}
        </>
      ) : (
        <>
          {report ? (
            <div className="wb-score-grid">
              {Object.entries(report.scores).map(([key, value]) => (
                <div key={key} className="wb-score-cell">
                  <span>{SCORE_LABEL[key] ?? key}</span>
                  <strong className={scoreTone(value)}>{value}</strong>
                </div>
              ))}
            </div>
          ) : null}

          <div className="flex border-b border-[var(--wb-border)]">
            <select
              className="h-8 min-w-0 flex-1 bg-transparent px-2.5 text-[11px] outline-none"
              value={category}
              onChange={(event) => {
                setCategory(event.target.value as SeoAuditCategory | 'all')
                setFindingsLimit(FINDINGS_PAGE)
              }}
            >
              <option value="all">All categories</option>
              {Object.entries(CATEGORY_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <select
              className="h-8 w-[7.5rem] border-l border-[var(--wb-border)] bg-transparent px-2 text-[11px] outline-none"
              value={severity}
              onChange={(event) => {
                setSeverity(event.target.value as SeoAuditSeverity | 'all')
                setFindingsLimit(FINDINGS_PAGE)
              }}
            >
              <option value="all">All severity</option>
              <option value="critical">Critical</option>
              <option value="warning">Warning</option>
              <option value="recommendation">Tips</option>
            </select>
          </div>
          <div className="border-b border-[var(--wb-border)] p-2">
            <input
              aria-label="Filter audit findings"
              className="wb-field"
              value={filter}
              onChange={(event) => {
                setFilter(event.target.value)
                setFindingsLimit(FINDINGS_PAGE)
              }}
              placeholder="Filter issues or files…"
            />
          </div>

          <div className="wb-sidebar-scroll min-h-0 flex-1 overflow-y-auto">
            {error && view === 'source' ? <p className="px-3 py-2 text-destructive">{error}</p> : null}
            {auditLoading && !report ? (
              <div className="wb-empty flex-row items-center gap-2 py-6">
                <Loader2 className="h-4 w-4 animate-spin text-[var(--wb-accent)]" />
                <p>Scanning workspace…</p>
              </div>
            ) : null}
            {!report && !auditLoading ? (
              <div className="wb-empty">
                <SearchCheck />
                <p>
                  Audit source for SEO, AI crawler access, citation readiness, structured data, and web
                  code quality.
                </p>
                <Button size="sm" className="h-7" disabled={!rootPath} onClick={() => void run()}>
                  Run workspace audit
                </Button>
              </div>
            ) : null}
            {report && findings.length === 0 ? (
              <p className="px-3 py-4 text-[var(--wb-ok)]">No findings in this filter.</p>
            ) : null}
            {visibleFindings.map((item) => (
              <div key={item.id} className="wb-list-row">
                <div className="flex items-start gap-2.5">
                  <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', SEVERITY_CLASS[item.severity])} />
                  <div className="min-w-0">
                    <p className="font-medium text-[var(--wb-fg)]">{item.title}</p>
                    <p className="mt-0.5 text-[11px] leading-snug text-[var(--wb-muted)]">{item.message}</p>
                    <p className="mt-1.5 text-[10px] text-[var(--wb-accent)]">
                      {item.relativePath}:{item.line} · {CATEGORY_LABEL[item.category]}
                    </p>
                    <p className="mt-1 text-[11px] leading-snug text-[var(--wb-muted)]">
                      Fix: {item.recommendation}
                    </p>
                  </div>
                </div>
                <div className="mt-2.5 flex gap-1.5 pl-4">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 gap-1 px-2 text-[10px]"
                    onClick={() => void openFileAtLine(item.filePath, item.line)}
                  >
                    <FileCode2 className="h-3 w-3" /> Open
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 gap-1 px-2 text-[10px]"
                    onClick={() => fixWithAi(item)}
                  >
                    <Sparkles className="h-3 w-3" /> Fix with AI
                  </Button>
                </div>
              </div>
            ))}
            {findings.length > findingsLimit ? (
              <button
                type="button"
                className="wb-show-more"
                onClick={() => setFindingsLimit((value) => value + FINDINGS_PAGE)}
              >
                Show more ({findings.length - findingsLimit} remaining)
              </button>
            ) : null}
          </div>
          {report ? (
            <div className="wb-footer-meta">
              {report.scannedFiles} files · {report.findings.length} findings
              {findings.length !== report.findings.length ? ` · ${findings.length} matching` : ''}
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}

function PolicyChip({ label, allowed }: { label: string; allowed: boolean }) {
  return (
    <div className="wb-score-cell text-center">
      <span>{label}</span>
      <strong className={allowed ? 'text-[var(--wb-ok)]' : 'text-[var(--wb-danger)]'}>
        {allowed ? 'Allowed' : 'Blocked'}
      </strong>
    </div>
  )
}
