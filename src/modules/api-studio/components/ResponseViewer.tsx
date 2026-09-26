import { useState } from 'react'
import { Clock, HardDrive, Download, ChevronDown, Send, Copy, CheckCircle2, XCircle, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import ReactMarkdown from 'react-markdown'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { Spinner } from '@/shared/components/ui/spinner'
import { ScrollArea } from '@/shared/components/ui/scroll-area'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/shared/components/ui/dropdown-menu'
import { cn } from '@/shared/lib/utils'
import { useApiStudioStore } from '../stores/apiStudioStore'
import { ResponseBodyView } from './response/ResponseBodyView'
import { GraphQLErrorsView } from './response/GraphQLErrorsView'
import { useApiStudioAi } from '../hooks/useApiStudioAi'
import type { ResponseTab } from '../types/api.types'

function statusVariant(status: number): 'success' | 'warning' | 'destructive' | 'secondary' {
  if (status === 0) return 'destructive'
  if (status < 300) return 'success'
  if (status < 400) return 'warning'
  return 'destructive'
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function splitCookies(setCookieHeader: string | undefined): { name: string; value: string; attrs: string }[] {
  if (!setCookieHeader) return []
  return setCookieHeader.split(/,(?=[^;]+?=)/g).map((raw) => {
    const cookie = raw.trim()
    const [nv, ...rest] = cookie.split(';')
    const eq = nv.indexOf('=')
    return {
      name: eq === -1 ? nv.trim() : nv.slice(0, eq).trim(),
      value: eq === -1 ? '' : nv.slice(eq + 1).trim(),
      attrs: rest.map((p) => p.trim()).join('; ')
    }
  })
}

export function ResponseViewer({ tabId }: { tabId: string }) {
  const tab = useApiStudioStore((s) => s.tabs.find((t) => t.id === tabId))
  const setResponseView = useApiStudioStore((s) => s.setResponseView)
  const saveResponseToFile = useApiStudioStore((s) => s.saveResponseToFile)
  const ai = useApiStudioAi(tabId)
  const [explainOpen, setExplainOpen] = useState(false)
  const [explanation, setExplanation] = useState('')

  if (!tab) return null

  const { response } = tab
  const headerEntries = response ? Object.entries(response.headers) : []
  const cookies = response ? splitCookies(response.headers['set-cookie'] ?? response.headers['Set-Cookie']) : []
  const passedTests = tab.testResults.filter((t) => t.passed).length
  const failedTests = tab.testResults.length - passedTests
  const showTestsTab = tab.testResults.length > 0 || Boolean(tab.request.tests?.trim())
  const isGraphQL = Boolean(response?.graphql) || tab.request.requestType === 'graphql'
  const activeView: ResponseTab =
    tab.responseView === 'tests' && !showTestsTab
      ? 'body'
      : tab.responseView === 'errors' && !isGraphQL
        ? 'body'
        : tab.responseView

  function copyText(label: string, value: string) {
    void navigator.clipboard.writeText(value)
    toast.success(`${label} copied`)
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex h-8 shrink-0 items-center gap-2 border-b border-border/60 px-2">
        <span className="text-xs font-medium text-foreground">Response</span>

        {response && (
          <div className="ml-auto flex items-center gap-2">
            {response.status > 0 ? (
              <Badge
                variant={response.graphql?.hasErrors ? 'warning' : statusVariant(response.status)}
                className="h-5 px-1.5 font-mono text-[10px]"
              >
                {response.status} {response.statusText}
              </Badge>
            ) : (
              <Badge variant="destructive" className="h-5 text-[10px]">
                {response.error ?? 'Failed'}
              </Badge>
            )}
            {response.graphql && (
              <Badge variant={response.graphql.hasErrors ? 'destructive' : 'success'} className="h-5 px-1.5 text-[10px]">
                {response.graphql.hasErrors ? 'GraphQL errors' : 'GraphQL OK'}
              </Badge>
            )}
            {response.graphql?.hint && (
              <span className="max-w-[220px] truncate text-[10px] text-amber-600 dark:text-amber-400" title={response.graphql.hint}>
                {response.graphql.hint}
              </span>
            )}
            <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground" title="Round-trip time">
              <Clock className="h-3 w-3" /> {response.timeMs}ms
            </span>
            <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground" title="Response size">
              <HardDrive className="h-3 w-3" /> {formatBytes(response.sizeBytes)}
            </span>
            {tab.testResults.length > 0 && (
              <span
                className={cn(
                  'text-[10px] tabular-nums',
                  failedTests > 0 ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400'
                )}
              >
                {passedTests}/{tab.testResults.length} tests
              </span>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-6 gap-1 px-1.5 text-[10px]"
              disabled={ai.busy}
              title="Explain this response"
              onClick={() => {
                setExplainOpen(true)
                setExplanation('')
                void ai.explainResponse().then((text) => {
                  if (text) setExplanation(text)
                  else setExplainOpen(false)
                })
              }}
            >
              {ai.busy ? <Spinner size="sm" /> : <Sparkles className="h-3 w-3" />}
              Explain
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-6 px-1.5 text-[10px]" title="Save response">
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => void saveResponseToFile(tabId)}>
                  <Download className="h-3.5 w-3.5" /> Save to file
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      {tab.loading ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-xs text-muted-foreground">
          <Spinner size="lg" />
          Sending request…
        </div>
      ) : !response ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted/50">
            <Send className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">Send a request to see the response</p>
            <p className="text-xs text-muted-foreground">
              Status, timing, headers, cookies, and body will appear here.
            </p>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Press <kbd className="rounded border border-border bg-muted px-1 py-px font-mono">Ctrl+Enter</kbd> to send
          </p>
        </div>
      ) : (
        <>
          <div className="flex shrink-0 items-center gap-0 border-b border-border/40 px-1">
            {(['body', 'errors', 'headers', 'cookies', 'tests'] as ResponseTab[]).map((view) => {
              if (view === 'tests' && !showTestsTab) return null
              if (view === 'errors' && !response?.graphql) return null
              const label = view === 'body' && response?.graphql ? 'Data' : view === 'errors' ? 'Errors' : view
              return (
                <button
                  key={view}
                  type="button"
                  onClick={() => setResponseView(tabId, view)}
                  className={cn(
                    'border-b-2 px-2.5 py-1.5 text-xs capitalize transition-colors',
                    activeView === view
                      ? 'border-foreground text-foreground'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  )}
                >
                  {label}
                  {view === 'errors' && response?.graphql?.errors.length ? (
                    <span className="ml-1 text-[10px] text-destructive">{response.graphql.errors.length}</span>
                  ) : null}
                  {view === 'headers' && headerEntries.length > 0 && (
                    <span className="ml-1 text-[10px] text-muted-foreground">{headerEntries.length}</span>
                  )}
                  {view === 'cookies' && cookies.length > 0 && (
                    <span className="ml-1 text-[10px] text-muted-foreground">{cookies.length}</span>
                  )}
                  {view === 'tests' && tab.testResults.length > 0 && (
                    <span className={cn('ml-1 text-[10px]', failedTests > 0 ? 'text-destructive' : 'text-muted-foreground')}>
                      {passedTests}/{tab.testResults.length}
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          <div className="min-h-0 flex-1 overflow-hidden">
            {activeView === 'body' && (
              <ResponseBodyView
                response={
                  response.graphql && !response.graphql.parseError
                    ? {
                        ...response,
                        data: JSON.stringify(response.graphql.data, null, 2),
                        contentType: 'application/json',
                        isBinary: false
                      }
                    : response
                }
              />
            )}
            {activeView === 'errors' && response.graphql && <GraphQLErrorsView info={response.graphql} />}
            {activeView === 'headers' && (
              <ScrollArea className="h-full">
                <div className="divide-y divide-border/40 p-2">
                  {headerEntries.length === 0 && <p className="p-2 text-xs text-muted-foreground">No headers</p>}
                  {headerEntries.map(([key, value]) => (
                    <div key={key} className="group grid grid-cols-[minmax(0,140px)_1fr_24px] items-start gap-2 py-1 text-[11px]">
                      <span className="truncate font-medium">{key}</span>
                      <span className="break-all text-muted-foreground">{value}</span>
                      <button
                        type="button"
                        className="hidden h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-accent group-hover:flex"
                        title="Copy value"
                        onClick={() => copyText(key, value)}
                      >
                        <Copy className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
            {activeView === 'cookies' && (
              <ScrollArea className="h-full">
                {cookies.length === 0 ? (
                  <p className="p-3 text-xs text-muted-foreground">No cookies in this response.</p>
                ) : (
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="border-b border-border/60 text-left text-muted-foreground">
                        <th className="px-3 py-1.5 font-medium">Name</th>
                        <th className="px-3 py-1.5 font-medium">Value</th>
                        <th className="px-3 py-1.5 font-medium">Attributes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cookies.map((cookie, i) => (
                        <tr key={`${cookie.name}-${i}`} className="border-b border-border/40">
                          <td className="px-3 py-1.5 font-medium">{cookie.name}</td>
                          <td className="max-w-[240px] truncate px-3 py-1.5 font-mono text-muted-foreground" title={cookie.value}>
                            {cookie.value}
                          </td>
                          <td className="px-3 py-1.5 text-muted-foreground">{cookie.attrs || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </ScrollArea>
            )}
            {activeView === 'tests' && (
              <ScrollArea className="h-full">
                {tab.testResults.length === 0 ? (
                  <p className="p-3 text-xs text-muted-foreground">No tests ran for this response.</p>
                ) : (
                  <div className="space-y-1 p-2">
                    {tab.testResults.map((result, i) => (
                      <div key={i} className="flex items-start gap-2 rounded-md px-2 py-1.5 text-xs">
                        {result.passed ? (
                          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                        ) : (
                          <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500" />
                        )}
                        <div className="min-w-0">
                          <span className={result.passed ? 'text-foreground' : 'text-red-500'}>{result.name}</span>
                          {result.error && <p className="text-muted-foreground">{result.error}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            )}
          </div>
        </>
      )}

      <Dialog open={explainOpen} onOpenChange={setExplainOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Response explanation</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            {ai.busy && !explanation ? (
              <div className="flex items-center justify-center py-8">
                <Spinner size="lg" />
              </div>
            ) : (
              <div className="markdown-body max-w-none text-sm">
                <ReactMarkdown>{explanation}</ReactMarkdown>
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  )
}
