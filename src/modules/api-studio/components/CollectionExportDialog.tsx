import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Download, FileText, Sparkles, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/shared/components/ui/button'
import { Switch } from '@/shared/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/components/ui/tabs'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog'
import { cn } from '@/shared/lib/utils'
import { useProjectStore } from '@/shared/stores/project.store'
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
import type { ApiCollection } from '../types/api.types'

interface CollectionExportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  collection: ApiCollection | null
}

type ApiFormat = 'postman' | 'openapi' | 'native' | 'curl'
type DocDestination = 'project' | 'markdown' | 'html'

const API_FORMATS: { id: ApiFormat; label: string; hint: string }[] = [
  { id: 'postman', label: 'Postman v2.1', hint: 'Import into Postman / Insomnia' },
  { id: 'openapi', label: 'OpenAPI 3.1', hint: 'Swagger / codegen / gateways' },
  { id: 'native', label: 'API Studio JSON', hint: 'Lossless backup of this collection' },
  { id: 'curl', label: 'cURL scripts', hint: 'Shell script with every request' }
]

function buildCurlBundle(collection: ApiCollection): string {
  const parts = [
    `#!/usr/bin/env bash`,
    `# ${collection.name} — exported from API Studio`,
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
  const { projects, currentProject, loadProjects } = useProjectStore()
  const [tab, setTab] = useState<'document' | 'apis'>('document')
  const [apiFormat, setApiFormat] = useState<ApiFormat>('postman')
  const [docDestination, setDocDestination] = useState<DocDestination>('project')
  const [projectId, setProjectId] = useState('')
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
    setDocDestination('project')
    setUseAi(true)
    setRedactSecrets(true)
    setIncludeScripts(true)
    setIncludeCodeExamples(false)
    setBusy(false)
    void loadProjects()
  }, [open, loadProjects])

  useEffect(() => {
    if (!open) return
    const list = projects.length > 0 ? projects : currentProject ? [currentProject] : []
    if (!projectId && list.length > 0) setProjectId(list[0].id)
  }, [open, projects, currentProject, projectId])

  useEffect(() => {
    if (!open || !collection) {
      setPreview('')
      return
    }
    if (tab === 'document') {
      setPreview(buildCollectionMarkdown(collection, docOptions).slice(0, 4000))
    } else if (apiFormat === 'postman') {
      setPreview(exportToPostmanCollection(collection).slice(0, 4000))
    } else if (apiFormat === 'openapi') {
      setPreview(exportToOpenApi(collection).slice(0, 4000))
    } else if (apiFormat === 'native') {
      setPreview(JSON.stringify(collection, null, 2).slice(0, 4000))
    } else {
      setPreview(buildCurlBundle(collection).slice(0, 4000))
    }
  }, [open, collection, tab, apiFormat, docOptions])

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
      projectId: projectId || null
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
        return
      }

      // Project document (ChatGPT style api_spec)
      if (!projectId) {
        toast.error('Select a project to create the document')
        return
      }
      const htmlContent = useAi
        ? markdownToSimpleHtml(markdown)
        : buildCollectionHtml(collection, docOptions)

      const res = await window.electronAPI.documents.create({
        projectId,
        title: `${collection.name} — API Spec`,
        type: 'api_spec',
        style: 'chatgpt',
        content: markdown,
        htmlContent
      })
      if (res.success && res.data) {
        toast.success(`Document created in project`)
        onOpenChange(false)
      } else {
        toast.error(res.error ?? 'Failed to create document')
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
      if (apiFormat === 'postman') {
        await saveFile('postman', exportToPostmanCollection(collection), 'Postman collection')
      } else if (apiFormat === 'openapi') {
        await saveFile('openapi', exportToOpenApi(collection), 'OpenAPI spec')
      } else if (apiFormat === 'native') {
        await saveFile('native', JSON.stringify(collection, null, 2), 'API Studio collection')
      } else {
        await saveFile('curl', buildCurlBundle(collection), 'cURL scripts')
      }
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Export failed')
    } finally {
      setBusy(false)
    }
  }

  const projectOptions = projects.length > 0 ? projects : currentProject ? [currentProject] : []

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
                      { id: 'project' as const, label: 'Project document', hint: 'ChatGPT-style api_spec' },
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

                {docDestination === 'project' && (
                  <label className="block space-y-1.5">
                    <span className="text-xs font-medium">Project</span>
                    <select
                      className="flex h-9 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm"
                      value={projectId}
                      onChange={(e) => setProjectId(e.target.value)}
                    >
                      {projectOptions.length === 0 ? (
                        <option value="">No projects available</option>
                      ) : (
                        projectOptions.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))
                      )}
                    </select>
                  </label>
                )}

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
                <p className="text-[11px] text-muted-foreground">
                  Postman export now includes auth (incl. OAuth2), pre-request scripts, and tests.
                  OpenAPI skips WebSocket requests.
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
              disabled={busy || !collection || (tab === 'document' && docDestination === 'project' && !projectId)}
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
                  {docDestination === 'project' ? 'Create document' : 'Download'}
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
