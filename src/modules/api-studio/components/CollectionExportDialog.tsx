import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Download, FileText, Sparkles, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/shared/components/ui/button'
import { Switch } from '@/shared/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/components/ui/tabs'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog'
import { cn } from '@/shared/lib/utils'
import { exportToPostmanCollection } from '../services/postman'
import { exportToOpenApi } from '../services/openapi'
import {
  buildCollectionAiSummary,
  buildCollectionHtml,
  buildCollectionMarkdown,
  markdownToSimpleHtml,
  type CollectionDocumentOptions
} from '../services/collectionDocument'
import {
  collectionExportFileName,
  saveCollectionExportFile,
  type CollectionExportFormat
} from '../services/collectionFile'
import { generateSnippet } from '../services/codeGenerator'
import { downloadBlob } from '../services/download'
import { PRODUCT_NAME } from '@shared/constants/product'
import { redactCollection } from '@shared/lib/redact-secrets'
import { stripFileBytes } from '@shared/lib/workspace-document'
import type { ApiCollection } from '../types/api.types'

interface CollectionExportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  collection: ApiCollection | null
}

type ApiFormat = 'postman' | 'openapi' | 'native' | 'curl'
type DocDestination = 'markdown' | 'html'

const API_FORMATS: { id: ApiFormat; label: string; hint: string }[] = [
  { id: 'postman', label: 'Postman v2.1', hint: 'Import into Postman / Insomnia' },
  { id: 'openapi', label: 'OpenAPI 3.1', hint: 'Swagger / codegen / gateways' },
  { id: 'native', label: `${PRODUCT_NAME} JSON`, hint: 'Backup of this collection' },
  { id: 'curl', label: 'cURL scripts', hint: 'Shell script with every request' }
]

function collectionForExport(collection: ApiCollection, redactSecrets: boolean): ApiCollection {
  return redactSecrets ? redactCollection(collection) : stripFileBytes(collection)
}

function buildCurlBundle(collection: ApiCollection): string {
  const parts = [
    `#!/usr/bin/env bash`,
    `# ${collection.name} — exported from ${PRODUCT_NAME}`,
    `# ${new Date().toISOString()}`,
    ''
  ]
  for (const req of collection.requests) {
    if (req.requestType === 'websocket') {
      parts.push(`# SKIP WebSocket: ${req.name}`)
      parts.push('')
      continue
    }
    parts.push(`# --- ${req.method} ${req.name} ---`)
    try {
      parts.push(generateSnippet(req, 'curl', collection))
    } catch {
      parts.push(`# Unable to generate cURL for ${req.name}`)
    }
    parts.push('')
    parts.push('echo')
    parts.push('')
  }
  return parts.join('\n')
}

export function CollectionExportDialog({ open, onOpenChange, collection }: CollectionExportDialogProps) {
  const [tab, setTab] = useState<'document' | 'apis'>('document')
  const [apiFormat, setApiFormat] = useState<ApiFormat>('postman')
  const [docDestination, setDocDestination] = useState<DocDestination>('markdown')
  const [useAi, setUseAi] = useState(true)
  const [redactSecrets, setRedactSecrets] = useState(true)
  const [includeScripts, setIncludeScripts] = useState(true)
  const [includeCodeExamples, setIncludeCodeExamples] = useState(false)
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState('')

  const docOptions: CollectionDocumentOptions = useMemo(
    () => ({ redactSecrets, includeScripts, includeCodeExamples }),
    [redactSecrets, includeScripts, includeCodeExamples]
  )

  useEffect(() => {
    if (!open) return
    setTab('document')
    setApiFormat('postman')
    setDocDestination('markdown')
    setUseAi(true)
    setRedactSecrets(true)
    setIncludeScripts(true)
    setIncludeCodeExamples(false)
    setBusy(false)
  }, [open])

  useEffect(() => {
    if (!open || !collection) {
      setPreview('')
      return
    }
    const exported = collectionForExport(collection, redactSecrets)
    if (tab === 'document') {
      setPreview(buildCollectionMarkdown(collection, docOptions).slice(0, 4000))
    } else if (apiFormat === 'postman') {
      setPreview(exportToPostmanCollection(exported).slice(0, 4000))
    } else if (apiFormat === 'openapi') {
      setPreview(exportToOpenApi(exported).slice(0, 4000))
    } else if (apiFormat === 'native') {
      setPreview(JSON.stringify(exported, null, 2).slice(0, 4000))
    } else {
      setPreview(buildCurlBundle(exported).slice(0, 4000))
    }
  }, [open, collection, tab, apiFormat, docOptions, redactSecrets])

  async function saveFile(format: CollectionExportFormat, content: string, label: string) {
    if (!collection) return
    const fileName = collectionExportFileName(collection.name, format)
    try {
      const saved = await saveCollectionExportFile(fileName, content, format)
      if (saved) toast.success(`${label} exported`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Export failed')
      downloadBlob(content, fileName, 'text/plain')
      toast.success(`${label} downloaded`)
    }
  }

  async function resolveDocumentMarkdown(): Promise<string> {
    if (!collection) return ''
    const base = buildCollectionMarkdown(collection, docOptions)
    if (!useAi) return base

    const ai = window.electronAPI?.apiStudio?.ai?.documentCollection
    if (!ai) {
      toast.message('AI unavailable — using full structured document')
      return base
    }

    const res = await ai({
      collectionName: collection.name,
      collectionSummary: buildCollectionAiSummary(collection),
      baseMarkdown: base,
      projectId: null
    })
    if (!res.success || !res.data?.trim()) {
      toast.message(res.error ? `AI skipped: ${res.error}` : 'AI returned empty — using structured document')
      return base
    }
    return res.data
  }

  async function handleExportDocument() {
    if (!collection) return
    setBusy(true)
    try {
      const markdown = await resolveDocumentMarkdown()

      if (docDestination === 'markdown') {
        await saveFile('markdown', markdown, 'Markdown document')
        onOpenChange(false)
        return
      }

      if (docDestination === 'html') {
        const html = useAi
          ? `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${collection.name}</title></head><body>${markdownToSimpleHtml(markdown)}</body></html>`
          : `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${collection.name}</title></head><body>${buildCollectionHtml(collection, docOptions)}</body></html>`
        await saveFile('html', html, 'HTML document')
        onOpenChange(false)
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Export failed')
    } finally {
      setBusy(false)
    }
  }

  async function handleExportApis() {
    if (!collection) return
    setBusy(true)
    try {
      const exported = collectionForExport(collection, redactSecrets)
      if (apiFormat === 'postman') {
        await saveFile('postman', exportToPostmanCollection(exported), 'Postman collection')
      } else if (apiFormat === 'openapi') {
        await saveFile('openapi', exportToOpenApi(exported), 'OpenAPI spec')
      } else if (apiFormat === 'native') {
        await saveFile('native', JSON.stringify(exported, null, 2), `${PRODUCT_NAME} collection`)
      } else {
        await saveFile('curl', buildCurlBundle(exported), 'cURL scripts')
      }
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Export failed')
    } finally {
      setBusy(false)
    }
  }


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(90vh,720px)] w-[min(94vw,42rem)] max-w-2xl flex-col gap-0 overflow-hidden p-0">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <DialogHeader className="shrink-0 space-y-1 border-b border-border/60 px-5 py-4 pr-12 text-left">
            <DialogTitle className="pr-2">
              Export {collection ? `"${collection.name}"` : 'collection'}
            </DialogTitle>
            <p className="text-xs text-muted-foreground">
              Create a full API document, or export the collection as portable APIs.
            </p>
          </DialogHeader>

          <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
            <Tabs
              value={tab}
              onValueChange={(v) => setTab(v as 'document' | 'apis')}
              className="px-5 pt-3"
            >
              <TabsList className="h-8 w-full justify-start rounded-none border-b border-border/60 bg-transparent p-0">
                <TabsTrigger
                  value="document"
                  className="h-8 rounded-none border-b-2 border-transparent px-3 text-xs data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none"
                >
                  <FileText className="mr-1.5 h-3.5 w-3.5" />
                  API Document
                </TabsTrigger>
                <TabsTrigger
                  value="apis"
                  className="h-8 rounded-none border-b-2 border-transparent px-3 text-xs data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none"
                >
                  <Download className="mr-1.5 h-3.5 w-3.5" />
                  Export APIs
                </TabsTrigger>
              </TabsList>

              <TabsContent value="document" className="mt-4 space-y-4 pb-2">
                <div className="grid gap-2 sm:grid-cols-3">
                  {(
                    [
                      { id: 'markdown' as const, label: 'Markdown file', hint: '.md download' },
                      { id: 'html' as const, label: 'HTML file', hint: '.html download' }
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setDocDestination(opt.id)}
                      className={cn(
                        'min-w-0 rounded-md border px-3 py-2 text-left transition-colors',
                        docDestination === opt.id
                          ? 'border-foreground bg-muted/50'
                          : 'border-border/60 hover:bg-muted/30'
                      )}
                    >
                      <div className="text-xs font-medium">{opt.label}</div>
                      <div className="text-[10px] text-muted-foreground">{opt.hint}</div>
                    </button>
                  ))}
                </div>


                <div className="space-y-3 rounded-md border border-border/60 p-3">
                  <OptionRow
                    label="Enhance with AI"
                    hint="Polished ChatGPT-style prose over full endpoint details"
                    checked={useAi}
                    onCheckedChange={setUseAi}
                    icon={<Sparkles className="h-3.5 w-3.5 text-amber-500" />}
                  />
                  <OptionRow
                    label="Redact secrets"
                    hint="Mask tokens, passwords, and API keys"
                    checked={redactSecrets}
                    onCheckedChange={setRedactSecrets}
                  />
                  <OptionRow
                    label="Include scripts"
                    hint="Pre-request scripts and tests"
                    checked={includeScripts}
                    onCheckedChange={setIncludeScripts}
                  />
                  <OptionRow
                    label="Include cURL examples"
                    hint="Add a code sample per endpoint"
                    checked={includeCodeExamples}
                    onCheckedChange={setIncludeCodeExamples}
                  />
                </div>
              </TabsContent>

              <TabsContent value="apis" className="mt-4 space-y-3 pb-2">
                <div className="grid gap-2 sm:grid-cols-2">
                  {API_FORMATS.map((fmt) => (
                    <button
                      key={fmt.id}
                      type="button"
                      onClick={() => setApiFormat(fmt.id)}
                      className={cn(
                        'min-w-0 rounded-md border px-3 py-2 text-left transition-colors',
                        apiFormat === fmt.id
                          ? 'border-foreground bg-muted/50'
                          : 'border-border/60 hover:bg-muted/30'
                      )}
                    >
                      <div className="text-xs font-medium">{fmt.label}</div>
                      <div className="text-[10px] text-muted-foreground">{fmt.hint}</div>
                    </button>
                  ))}
                </div>
                <div className="rounded-md border border-border/60 p-3">
                  <OptionRow
                    label="Redact secrets"
                    hint={
                      apiFormat === 'native'
                        ? 'Turn off to keep credentials in this backup. File contents are never included.'
                        : 'Mask tokens, passwords, and API keys. File contents are never included.'
                    }
                    checked={redactSecrets}
                    onCheckedChange={setRedactSecrets}
                  />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Postman export includes auth, pre-request scripts, and tests. OpenAPI skips WebSocket requests.
                </p>
              </TabsContent>
            </Tabs>

            {preview && (
              <div className="border-t border-border/60 px-5 py-3">
                <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Preview
                </div>
                <pre className="max-h-40 overflow-auto rounded-md border border-border/60 bg-muted/30 p-2 font-mono text-[10px] leading-relaxed text-muted-foreground">
                  {preview}
                  {preview.length >= 4000 ? '\n…' : ''}
                </pre>
              </div>
            )}
          </div>

          <DialogFooter className="shrink-0 border-t border-border/60 px-5 py-3">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={busy}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={busy || !collection}
              onClick={() => void (tab === 'document' ? handleExportDocument() : handleExportApis())}
            >
              {busy ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {tab === 'document' && useAi ? 'Writing document…' : 'Exporting…'}
                </>
              ) : tab === 'document' ? (
                <>
                  {useAi ? <Sparkles className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />}
                  Download
                </>
              ) : (
                <>
                  <Download className="h-3.5 w-3.5" />
                  Export APIs
                </>
              )}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function OptionRow({
  label,
  hint,
  checked,
  onCheckedChange,
  icon
}: {
  label: string
  hint: string
  checked: boolean
  onCheckedChange: (v: boolean) => void
  icon?: ReactNode
}) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-xs font-medium">
          {icon}
          {label}
        </div>
        <div className="text-[10px] text-muted-foreground">{hint}</div>
      </div>
      <Switch className="shrink-0" checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  )
}
