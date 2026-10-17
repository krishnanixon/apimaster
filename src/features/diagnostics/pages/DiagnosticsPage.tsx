import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Bug, CheckCircle2, Clipboard, FileClock, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import type { BugReport, BugReportCategory, BugReportSeverity, LogEntry } from '@shared/types'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { Card } from '@/shared/components/ui/card'
import { Input } from '@/shared/components/ui/input'
import { Textarea } from '@/shared/components/ui/textarea'
import { writeClipboardText } from '@/shared/lib/clipboard'
import { ModulePage, PageContent, PageHeader } from '@/shared/components/layout/ModulePage'

const RELEASES = [
  {
    version: '1.0.0',
    date: '2026-08-24',
    changes: [
      'Added a Diagnostics center with searchable runtime logs.',
      'Added local bug and crash reports with optional diagnostic context.',
      'Added global renderer error and unhandled promise capture.',
      'Added automatic redaction of common credentials in attached diagnostics.'
    ],
    breaking: ['Bug reports are stored locally; no external issue tracker is contacted.']
  }
]

const controlClass =
  'h-9 w-full rounded-lg border border-input bg-background px-3 text-[13px] outline-none focus:ring-2 focus:ring-ring/20'
const fieldClass = 'text-[13px]'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}

export function DiagnosticsPage() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [reports, setReports] = useState<BugReport[]>([])
  const [filter, setFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState({
    title: '',
    description: '',
    stepsToReproduce: '',
    expectedBehavior: '',
    actualBehavior: '',
    severity: 'medium' as BugReportSeverity,
    category: 'bug' as BugReportCategory,
    includeDiagnostics: true
  })

  const load = useCallback(async () => {
    setLoading(true)
    const [logResult, reportResult] = await Promise.all([
      window.electronAPI.log.getRecent(250),
      window.electronAPI.bugReports.list()
    ])
    if (logResult.success) setLogs(logResult.data ?? [])
    if (reportResult.success) setReports(reportResult.data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const visibleLogs = useMemo(() => {
    const query = filter.trim().toLowerCase()
    if (!query) return logs
    return logs.filter((entry) =>
      `${entry.level} ${entry.context ?? ''} ${entry.message}`.toLowerCase().includes(query)
    )
  }, [filter, logs])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!form.title.trim() || !form.description.trim()) {
      toast.error('Add a title and description')
      return
    }
    setSubmitting(true)
    const result = await window.electronAPI.bugReports.create({
      ...form,
      route: window.location.hash.replace(/^#/, ''),
      renderer: {
        userAgent: navigator.userAgent,
        language: navigator.language,
        platform: navigator.platform
      }
    })
    setSubmitting(false)
    if (!result.success || !result.data) {
      toast.error(result.error ?? 'Could not save report')
      return
    }
    setReports((current) => [result.data!, ...current])
    setForm((current) => ({
      ...current,
      title: '',
      description: '',
      stepsToReproduce: '',
      expectedBehavior: '',
      actualBehavior: ''
    }))
    toast.success(`Report saved (${result.data.id.slice(0, 8)})`)
  }

  async function copyReport(report: BugReport) {
    await writeClipboardText(JSON.stringify(report, null, 2))
    toast.success('Report copied with diagnostics')
  }

  return (
    <ModulePage>
      <PageHeader
        title="Diagnostics & feedback"
        description="Inspect failures, record reproducible bugs, and review product changes."
        actions={
          <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
        }
      />

      <PageContent>
        <div className="grid gap-5 xl:grid-cols-[minmax(360px,0.8fr)_minmax(520px,1.2fr)]">
          <div className="space-y-5">
            <Card className="p-5">
              <div className="mb-4 flex items-center gap-2">
                <Bug className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold">Report a bug</h2>
              </div>
              <form className="space-y-4" onSubmit={submit}>
                <Field label="Summary">
                  <Input
                    className={fieldClass}
                    placeholder="Short summary of the problem"
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    maxLength={160}
                  />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Category">
                    <select
                      className={controlClass}
                      value={form.category}
                      onChange={(e) =>
                        setForm({ ...form, category: e.target.value as BugReportCategory })
                      }
                    >
                      <option value="bug">Functional bug</option>
                      <option value="crash">Crash</option>
                      <option value="performance">Performance</option>
                      <option value="data">Data issue</option>
                      <option value="other">Other</option>
                    </select>
                  </Field>
                  <Field label="Severity">
                    <select
                      className={controlClass}
                      value={form.severity}
                      onChange={(e) =>
                        setForm({ ...form, severity: e.target.value as BugReportSeverity })
                      }
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="critical">Critical</option>
                    </select>
                  </Field>
                </div>
                <Field label="What happened?">
                  <Textarea
                    placeholder="Describe the problem"
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    className={`${fieldClass} min-h-24`}
                  />
                </Field>
                <Field label="Steps to reproduce (optional)">
                  <Textarea
                    placeholder="1. Open…  2. Click…"
                    value={form.stepsToReproduce}
                    onChange={(e) => setForm({ ...form, stepsToReproduce: e.target.value })}
                    className={fieldClass}
                  />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Expected behavior">
                    <Textarea
                      value={form.expectedBehavior}
                      onChange={(e) => setForm({ ...form, expectedBehavior: e.target.value })}
                      className={fieldClass}
                    />
                  </Field>
                  <Field label="Actual behavior">
                    <Textarea
                      value={form.actualBehavior}
                      onChange={(e) => setForm({ ...form, actualBehavior: e.target.value })}
                      className={fieldClass}
                    />
                  </Field>
                </div>
                <label className="flex items-start gap-2 rounded-lg border border-border/70 bg-muted/30 p-3 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={form.includeDiagnostics}
                    onChange={(e) => setForm({ ...form, includeDiagnostics: e.target.checked })}
                  />
                  Attach the latest 50 redacted runtime log entries and environment details.
                </label>
                <Button type="submit" size="sm" disabled={submitting}>
                  {submitting ? 'Saving…' : 'Save bug report'}
                </Button>
              </form>
            </Card>

            <Card className="p-5">
              <div className="mb-4 flex items-center gap-2">
                <Clipboard className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold">Saved reports</h2>
                <Badge variant="secondary">{reports.length}</Badge>
              </div>
              <div className="space-y-2">
                {reports.length === 0 && (
                  <p className="text-sm text-muted-foreground">No reports saved yet.</p>
                )}
                {reports.slice(0, 10).map((report) => (
                  <button
                    key={report.id}
                    onClick={() => void copyReport(report)}
                    className="flex w-full items-center gap-3 rounded-lg border border-border/70 p-3 text-left hover:bg-muted/50"
                  >
                    <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{report.title}</span>
                      <span className="text-[11px] text-muted-foreground">
                        {new Date(report.createdAt).toLocaleString()} · {report.id.slice(0, 8)}
                      </span>
                    </span>
                    <Badge variant={report.severity === 'critical' ? 'destructive' : 'outline'}>
                      {report.severity}
                    </Badge>
                  </button>
                ))}
              </div>
            </Card>
          </div>

          <div className="space-y-5">
            <Card className="overflow-hidden">
              <div className="flex items-center gap-3 border-b border-border/70 p-4">
                <FileClock className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold">Runtime log</h2>
                <Badge variant="secondary">{visibleLogs.length}</Badge>
                <Input
                  className="ml-auto h-8 max-w-xs text-[13px]"
                  placeholder="Filter logs…"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                />
              </div>
              <div className="max-h-[520px] overflow-auto font-mono text-[11px]">
                {visibleLogs.map((entry, index) => (
                  <div
                    key={`${entry.timestamp}-${index}`}
                    className="grid grid-cols-[78px_70px_110px_1fr] gap-2 border-b border-border/40 px-4 py-2 last:border-0"
                  >
                    <span className="text-muted-foreground">
                      {new Date(entry.timestamp).toLocaleTimeString()}
                    </span>
                    <span
                      className={
                        entry.level === 'error'
                          ? 'text-red-500'
                          : entry.level === 'warn'
                            ? 'text-amber-500'
                            : 'text-muted-foreground'
                      }
                    >
                      {entry.level.toUpperCase()}
                    </span>
                    <span className="truncate text-muted-foreground">{entry.context ?? 'App'}</span>
                    <span className="whitespace-pre-wrap break-words">{entry.message}</span>
                  </div>
                ))}
                {!loading && visibleLogs.length === 0 && (
                  <p className="p-6 text-center font-sans text-sm text-muted-foreground">
                    No matching log entries.
                  </p>
                )}
              </div>
            </Card>

            <Card className="p-5">
              <div className="mb-4 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                <h2 className="text-sm font-semibold">Change log</h2>
              </div>
              {RELEASES.map((release) => (
                <section key={release.version} className="border-l-2 border-border pl-4">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">Version {release.version}</span>
                    <span className="text-xs text-muted-foreground">{release.date}</span>
                  </div>
                  <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-muted-foreground">
                    {release.changes.map((change) => (
                      <li key={change}>{change}</li>
                    ))}
                  </ul>
                  <p className="mt-3 text-xs font-medium">Behavior notes</p>
                  <ul className="mt-1 list-disc pl-4 text-xs text-muted-foreground">
                    {release.breaking.map((change) => (
                      <li key={change}>{change}</li>
                    ))}
                  </ul>
                </section>
              ))}
            </Card>
          </div>
        </div>
      </PageContent>
    </ModulePage>
  )
}
