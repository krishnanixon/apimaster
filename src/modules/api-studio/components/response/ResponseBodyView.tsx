import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Binary, ChevronDown, Code2, Copy, Download, Eye, FileText, Search, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/shared/components/ui/dropdown-menu'
import { cn } from '@/shared/lib/utils'
import { tryQueryJsonPath } from '@shared/lib/json-path'
import {
  HUGE_PARSE_BYTES,
  LARGE_TEXT_BYTES,
  LARGE_TREE_BYTES,
  base64ToBytes,
  classifyResponse,
  countMatches,
  extensionForContentType,
  formatBytes,
  hexDump,
  type ResponseKind
} from '@shared/lib/response-content'
import { JsonTreeView } from './JsonTreeView'
import { RequestCodeEditor } from '../RequestCodeEditor'
import { downloadBlob } from '../../services/download'
import type { ApiExecutionResult } from '../../types/api.types'

type ViewMode = 'tree' | 'raw' | 'preview' | 'hex'

const PREVIEWABLE: ResponseKind[] = ['html', 'svg', 'image', 'pdf', 'audio', 'video']
const HEX_PREVIEW_BYTES = 4096

function defaultMode(kind: ResponseKind): ViewMode {
  if (kind === 'json') return 'tree'
  if (PREVIEWABLE.includes(kind)) return 'preview'
  if (kind === 'binary') return 'hex'
  return 'raw'
}

async function copyText(label: string, text: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(`${label} copied`)
  } catch {
    toast.error('Copy failed')
  }
}

/** Object URL for binary previews (PDF/media); revoked when the payload changes. */
function useObjectUrl(base64: string | undefined, contentType: string, enabled: boolean): string | null {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!enabled || !base64) {
      setUrl(null)
      return
    }
    const bytes = base64ToBytes(base64)
    const objectUrl = URL.createObjectURL(new Blob([bytes as BlobPart], { type: contentType.split(';')[0] || 'application/octet-stream' }))
    setUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [base64, contentType, enabled])
  return url
}

export function ResponseBodyView({
  response,
  fileName = 'response',
  onSave
}: {
  response: ApiExecutionResult
  /** Base name for downloads (extension is derived from the content type). */
  fileName?: string
  /** Native "Save as…" handler; falls back to a browser download. */
  onSave?: () => void
}) {
  const kind = useMemo(
    () => classifyResponse(response.contentType, response.isBinary, response.isBinary ? '' : response.data),
    [response.contentType, response.data, response.isBinary]
  )
  const isJson = kind === 'json'
  const bodyBytes = response.isBinary ? response.sizeBytes : response.data.length
  const [mode, setMode] = useState<ViewMode>(() => defaultMode(kind))
  const [search, setSearch] = useState('')
  const [jsonPath, setJsonPath] = useState('')
  const [allowHugeParse, setAllowHugeParse] = useState(false)
  const [allowLargeTree, setAllowLargeTree] = useState(false)
  const [showFullText, setShowFullText] = useState(false)
  const [imageSize, setImageSize] = useState<{ w: number; h: number } | null>(null)

  // Reset per-response opt-ins when a new response arrives; keep the query so reruns re-apply it.
  useEffect(() => {
    setMode(defaultMode(kind))
    setAllowHugeParse(false)
    setAllowLargeTree(false)
    setShowFullText(false)
    setImageSize(null)
  }, [response.data, response.dataBase64, kind])

  const parseBlocked = isJson && bodyBytes > HUGE_PARSE_BYTES && !allowHugeParse
  const parsed = useMemo<{ ok: true; value: unknown } | { ok: false; error: string } | null>(() => {
    if (!isJson || parseBlocked) return null
    try {
      return { ok: true, value: JSON.parse(response.data) }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'Invalid JSON' }
    }
  }, [isJson, parseBlocked, response.data])
  const parsedValue = parsed?.ok ? parsed.value : undefined

  const prettyText = useMemo(() => {
    if (response.isBinary) return ''
    if (parsed?.ok) return JSON.stringify(parsed.value, null, 2)
    return response.data
  }, [parsed, response.data, response.isBinary])

  const queryResult = useMemo(() => {
    if (!parsed?.ok || !jsonPath.trim()) return null
    return tryQueryJsonPath(parsed.value, jsonPath)
  }, [jsonPath, parsed])
  const queryValues = queryResult?.ok ? queryResult.matches.map((m) => m.value) : undefined

  const textTruncated = !showFullText && prettyText.length > LARGE_TEXT_BYTES
  const displayText = textTruncated ? prettyText.slice(0, LARGE_TEXT_BYTES) : prettyText
  const matchCount = useMemo(
    () => (mode === 'raw' && search.trim() ? countMatches(displayText, search.trim()) : 0),
    [displayText, mode, search]
  )

  const extension = extensionForContentType(response.contentType, response.isBinary)
  const handleDownload = useCallback(() => {
    if (onSave) {
      onSave()
      return
    }
    const name = `${fileName}.${extension}`
    if (response.isBinary && response.dataBase64) {
      downloadBlob(base64ToBytes(response.dataBase64) as BlobPart, name, response.contentType || 'application/octet-stream')
    } else {
      downloadBlob(prettyText, name, response.contentType || 'text/plain')
    }
  }, [extension, fileName, onSave, prettyText, response.contentType, response.dataBase64, response.isBinary])

  const needsObjectUrl = mode === 'preview' && (kind === 'pdf' || kind === 'audio' || kind === 'video')
  const objectUrl = useObjectUrl(response.dataBase64, response.contentType, needsObjectUrl)
  const hexText = useMemo(
    () => (mode === 'hex' && response.dataBase64 ? hexDump(base64ToBytes(response.dataBase64), HEX_PREVIEW_BYTES) : ''),
    [mode, response.dataBase64]
  )

  const onQueryPath = useCallback((path: string) => {
    setJsonPath(path)
    setMode('tree')
  }, [])

  const treeTooLarge = bodyBytes > LARGE_TREE_BYTES && !allowLargeTree && !queryValues
  const modes: { id: ViewMode; label: string; icon: React.ReactNode }[] = []
  if (isJson) modes.push({ id: 'tree', label: 'Tree', icon: <Code2 className="h-3 w-3" /> })
  if (!response.isBinary) modes.push({ id: 'raw', label: isJson ? 'JSON' : 'Raw', icon: <FileText className="h-3 w-3" /> })
  if (PREVIEWABLE.includes(kind)) modes.push({ id: 'preview', label: 'Preview', icon: <Eye className="h-3 w-3" /> })
  if (response.isBinary) modes.push({ id: 'hex', label: 'Hex', icon: <Binary className="h-3 w-3" /> })

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-border/60 px-3 py-1.5">
        {modes.map((m) => (
          <ModeButton key={m.id} icon={m.icon} active={mode === m.id} onClick={() => setMode(m.id)} label={m.label} />
        ))}

        <div className="ml-auto flex items-center gap-1.5">
          {(mode === 'tree' || mode === 'raw') && !response.isBinary && (
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={mode === 'tree' ? 'Filter keys & values' : 'Find in body'}
                aria-label={mode === 'tree' ? 'Filter keys and values' : 'Find in body'}
                className="h-7 w-40 pl-6 pr-12 text-xs"
              />
              {mode === 'raw' && search.trim() && (
                <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] tabular-nums text-muted-foreground">
                  {matchCount.toLocaleString()}
                </span>
              )}
            </div>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" title="Copy">
                <Copy className="h-3.5 w-3.5" />
                Copy
                <ChevronDown className="h-3 w-3 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {!response.isBinary && (
                <DropdownMenuItem onSelect={() => void copyText('Body', response.data)}>Copy body</DropdownMenuItem>
              )}
              {parsed?.ok && (
                <>
                  <DropdownMenuItem onSelect={() => void copyText('Pretty JSON', prettyText)}>Copy as JSON (pretty)</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => void copyText('Minified JSON', JSON.stringify(parsed.value))}>
                    Copy as JSON (minified)
                  </DropdownMenuItem>
                </>
              )}
              {queryValues && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={() =>
                      void copyText('Query result', JSON.stringify(queryValues.length === 1 ? queryValues[0] : queryValues, null, 2))
                    }
                  >
                    Copy query result ({queryValues.length})
                  </DropdownMenuItem>
                </>
              )}
              {response.isBinary && response.dataBase64 && (
                <DropdownMenuItem onSelect={() => void copyText('Base64', response.dataBase64 ?? '')}>Copy as Base64</DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => void copyText('Headers', JSON.stringify(response.headers, null, 2))}
              >
                Copy headers as JSON
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleDownload} title={`Save response (.${extension})`}>
            <Download className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {isJson && mode === 'tree' && parsed?.ok && (
        <div className="flex shrink-0 items-center gap-2 border-b border-border/40 px-3 py-1.5">
          <span className="font-mono text-[11px] font-semibold text-muted-foreground">JSONPath</span>
          <div className="relative min-w-0 flex-1">
            <Input
              value={jsonPath}
              onChange={(e) => setJsonPath(e.target.value)}
              placeholder="$.data[*].id   ·   $..items[?(@.price < 10)]"
              aria-label="JSONPath query"
              spellCheck={false}
              className={cn('h-7 pr-7 font-mono text-xs', queryResult && !queryResult.ok && 'border-destructive/60')}
            />
            {jsonPath && (
              <button
                type="button"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
                onClick={() => setJsonPath('')}
                aria-label="Clear JSONPath"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
          {queryResult && (
            <span
              className={cn('shrink-0 text-[11px] tabular-nums', queryResult.ok ? 'text-muted-foreground' : 'text-destructive')}
              title={queryResult.ok ? undefined : queryResult.error}
            >
              {queryResult.ok
                ? `${queryResult.matches.length} match${queryResult.matches.length === 1 ? '' : 'es'}`
                : 'Invalid'}
            </span>
          )}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-hidden p-3">
        {parseBlocked && mode === 'tree' ? (
          <LargeNotice
            message={`This JSON response is ${formatBytes(bodyBytes)}. Parsing it may freeze the app for a while.`}
            actionLabel="Parse anyway"
            onAction={() => setAllowHugeParse(true)}
            secondaryLabel="Save to file"
            onSecondary={handleDownload}
          />
        ) : (
          <>
            {mode === 'tree' && parsed && !parsed.ok && (
              <div className="space-y-1 text-xs text-muted-foreground">
                <p>Response is labelled JSON but could not be parsed — showing raw text is more useful here.</p>
                <p className="font-mono text-destructive">{parsed.error}</p>
                <Button size="sm" variant="outline" className="mt-1 h-7 text-xs" onClick={() => setMode('raw')}>
                  View raw
                </Button>
              </div>
            )}
            {mode === 'tree' && parsed?.ok && queryResult && !queryResult.ok && (
              <p className="font-mono text-xs text-destructive">{queryResult.error}</p>
            )}
            {mode === 'tree' && parsed?.ok && (!queryResult || queryResult.ok) && (
              treeTooLarge ? (
                <LargeNotice
                  message={`Large response (${formatBytes(bodyBytes)}). The tree view renders lazily but can still be slow — use JSONPath to narrow it down, or view the raw JSON.`}
                  actionLabel="Render tree anyway"
                  onAction={() => setAllowLargeTree(true)}
                  secondaryLabel="View raw"
                  onSecondary={() => setMode('raw')}
                />
              ) : (
                <div className="h-full overflow-auto rounded-lg border border-border/60 bg-muted/20 p-3">
                  {queryResult?.ok && queryResult.matches.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No values match this JSONPath.</p>
                  ) : queryResult?.ok && queryResult.matches.length === 1 ? (
                    <JsonTreeView
                      data={queryResult.matches[0].value}
                      rootSegments={queryResult.matches[0].segments}
                      search={search}
                      onQueryPath={onQueryPath}
                    />
                  ) : queryResult?.ok ? (
                    <div className="space-y-1">
                      {queryResult.matches.slice(0, 500).map((match) => (
                        <div key={match.path} className="border-b border-border/30 pb-1 last:border-b-0">
                          <div className="font-mono text-[10px] text-muted-foreground">{match.path}</div>
                          <JsonTreeView data={match.value} rootSegments={match.segments} search={search} onQueryPath={onQueryPath} />
                        </div>
                      ))}
                      {queryResult.matches.length > 500 && (
                        <p className="text-[11px] text-muted-foreground">
                          Showing 500 of {queryResult.matches.length.toLocaleString()} matches — copy the query result to get all of them.
                        </p>
                      )}
                    </div>
                  ) : (
                    <JsonTreeView data={parsedValue} search={search} onQueryPath={onQueryPath} />
                  )}
                </div>
              )
            )}
            {mode === 'raw' && (
              <div className="flex h-full min-h-0 flex-col gap-2">
                {textTruncated && (
                  <div className="flex shrink-0 items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-700 dark:text-amber-300">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    Showing the first {formatBytes(LARGE_TEXT_BYTES)} of {formatBytes(prettyText.length)}.
                    <button type="button" className="ml-auto underline" onClick={() => setShowFullText(true)}>
                      Show full body
                    </button>
                  </div>
                )}
                <RequestCodeEditor
                  value={displayText}
                  languageFile={isJson ? 'response.json' : kind === 'html' ? 'response.html' : kind === 'xml' || kind === 'svg' ? 'response.xml' : 'response.txt'}
                  label={isJson ? 'JSON' : kind === 'text' ? 'Text' : kind.toUpperCase()}
                  readOnly
                  showCopy
                  highlightQuery={search}
                  className="h-full min-h-0"
                />
              </div>
            )}
          </>
        )}

        {mode === 'preview' && kind === 'html' && (
          <iframe
            title="Response preview"
            sandbox=""
            srcDoc={response.data}
            className="h-full w-full rounded-lg border border-border bg-white"
          />
        )}
        {mode === 'preview' && (kind === 'image' || kind === 'svg') && (
          <div className="flex h-full flex-col items-center justify-center gap-2 overflow-auto rounded-lg border border-border bg-[length:16px_16px] bg-[linear-gradient(45deg,hsl(var(--muted))_25%,transparent_25%,transparent_75%,hsl(var(--muted))_75%),linear-gradient(45deg,hsl(var(--muted))_25%,transparent_25%,transparent_75%,hsl(var(--muted))_75%)] bg-[position:0_0,8px_8px] p-4">
            <img
              alt="Response preview"
              className="max-h-full max-w-full object-contain"
              src={
                kind === 'svg'
                  ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(response.data)}`
                  : `data:${response.contentType.split(';')[0]};base64,${response.dataBase64 ?? ''}`
              }
              onLoad={(e) => setImageSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
              onError={() => setImageSize(null)}
            />
            {imageSize && (
              <span className="rounded bg-background/80 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                {imageSize.w} × {imageSize.h} · {formatBytes(response.sizeBytes)}
              </span>
            )}
          </div>
        )}
        {mode === 'preview' && kind === 'pdf' && objectUrl && (
          <iframe title="PDF preview" src={objectUrl} className="h-full w-full rounded-lg border border-border bg-background" />
        )}
        {mode === 'preview' && kind === 'audio' && objectUrl && (
          <div className="flex h-full items-center justify-center">
            <audio controls src={objectUrl} className="w-full max-w-md" />
          </div>
        )}
        {mode === 'preview' && kind === 'video' && objectUrl && (
          <video controls src={objectUrl} className="h-full w-full rounded-lg border border-border bg-black" />
        )}
        {mode === 'hex' && (
          <div className="flex h-full min-h-0 flex-col gap-2">
            <p className="shrink-0 text-[11px] text-muted-foreground">
              Binary response · {response.contentType || 'unknown type'} · {formatBytes(response.sizeBytes)}
              {response.sizeBytes > HEX_PREVIEW_BYTES && ` · showing first ${formatBytes(HEX_PREVIEW_BYTES)}`}
            </p>
            <pre className="min-h-0 flex-1 overflow-auto rounded-lg border border-border/60 bg-muted/20 p-3 font-mono text-[11px] leading-relaxed">
              {hexText || 'Empty body'}
            </pre>
          </div>
        )}
      </div>
    </div>
  )
}

function LargeNotice({
  message,
  actionLabel,
  onAction,
  secondaryLabel,
  onSecondary
}: {
  message: string
  actionLabel: string
  onAction: () => void
  secondaryLabel: string
  onSecondary: () => void
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
      <AlertTriangle className="h-5 w-5 text-amber-500" />
      <p className="max-w-sm text-xs text-muted-foreground">{message}</p>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onSecondary}>
          {secondaryLabel}
        </Button>
        <Button size="sm" className="h-7 text-xs" onClick={onAction}>
          {actionLabel}
        </Button>
      </div>
    </div>
  )
}

function ModeButton({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors',
        active ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/60'
      )}
    >
      {icon}
      {label}
    </button>
  )
}
