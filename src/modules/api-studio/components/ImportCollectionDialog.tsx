import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, FileJson, FolderOpen, Info, Terminal, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/shared/components/ui/button'
import { Badge } from '@/shared/components/ui/badge'
import { Textarea } from '@/shared/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/components/ui/tabs'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog'
import { cn } from '@/shared/lib/utils'
import { IMPORT_FORMAT_LABELS, detectImportFormat, type BrunoSourceFile, type ImportResult } from '@shared/lib/importers'
import { useApiStudioStore } from '../stores/apiStudioStore'
import { importBrunoFolder, importFromText } from '../services/collectionImport'

type ImportTab = 'file' | 'collection' | 'curl'

interface ImportCollectionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImported?: (collectionId: string) => void
  defaultTab?: ImportTab
}

const TAB_TRIGGER =
  'h-8 rounded-none border-b-2 border-transparent px-3 text-xs data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none'

const MAX_DROPPED_FILES = 5_000

function looksLikeCurl(text: string): boolean {
  return /^\s*curl\s/i.test(text)
}

function errorMessage(e: unknown, fallback: string): string {
  return e instanceof Error && e.message ? e.message : fallback
}

/** Reads `bruno.json` and `.bru` files from a dropped folder (same rules as the folder picker). */
async function readDroppedFolder(root: FileSystemDirectoryEntry): Promise<BrunoSourceFile[]> {
  const files: BrunoSourceFile[] = []
  const readEntries = (dir: FileSystemDirectoryEntry) =>
    new Promise<FileSystemEntry[]>((resolve, reject) => {
      const reader = dir.createReader()
      const all: FileSystemEntry[] = []
      // readEntries returns results in batches until it returns an empty list.
      const next = () =>
        reader.readEntries((batch) => {
          if (batch.length === 0) resolve(all)
          else {
            all.push(...batch)
            next()
          }
        }, reject)
      next()
    })
  const readFile = (entry: FileSystemFileEntry) => new Promise<File>((resolve, reject) => entry.file(resolve, reject))

  async function walk(dir: FileSystemDirectoryEntry, prefix: string): Promise<void> {
    for (const entry of await readEntries(dir)) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.isDirectory) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue
        await walk(entry as FileSystemDirectoryEntry, relative)
      } else if (relative === 'bruno.json' || entry.name.endsWith('.bru')) {
        if (files.length >= MAX_DROPPED_FILES) throw new Error('That folder is too large to be a Bruno collection')
        files.push({ path: relative, content: await (await readFile(entry as FileSystemFileEntry)).text() })
      }
    }
  }

  await walk(root, '')
  return files
}

function ImportSummaryView({ result }: { result: ImportResult }) {
  const { summary, collections, environments } = result
  const counts = [
    `${summary.requests} request${summary.requests === 1 ? '' : 's'}`,
    `${summary.folders} folder${summary.folders === 1 ? '' : 's'}`,
    `${summary.environments} environment${summary.environments === 1 ? '' : 's'}`
  ].join(' · ')
  return (
    <div className="space-y-3 px-5 py-4 text-xs">
      <div className="flex items-start gap-2">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
        <div className="space-y-1">
          <p className="text-sm font-medium">Imported {IMPORT_FORMAT_LABELS[summary.format]}</p>
          <p className="text-muted-foreground">{counts}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {collections.map((c) => (
          <Badge key={c.id} variant="secondary">
            {c.name}
          </Badge>
        ))}
        {environments.map((e) => (
          <Badge key={e.name} variant="outline">
            {e.name}
          </Badge>
        ))}
      </div>
      {summary.skipped.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50/60 px-3 py-2 dark:border-amber-900/40 dark:bg-amber-950/20">
          <p className="mb-1 flex items-center gap-1.5 font-medium text-amber-700 dark:text-amber-400">
            <AlertTriangle className="h-3.5 w-3.5" />
            Not imported
          </p>
          <ul className="max-h-36 list-disc space-y-0.5 overflow-y-auto pl-5 text-muted-foreground">
            {summary.skipped.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </div>
      )}
      {summary.warnings.length > 0 && (
        <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2">
          <p className="mb-1 flex items-center gap-1.5 font-medium">
            <Info className="h-3.5 w-3.5" />
            Worth a look
          </p>
          <ul className="max-h-36 list-disc space-y-0.5 overflow-y-auto pl-5 text-muted-foreground">
            {summary.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export function ImportCollectionDialog({
  open,
  onOpenChange,
  onImported,
  defaultTab = 'file'
}: ImportCollectionDialogProps) {
  const addImportResult = useApiStudioStore((s) => s.addImportResult)
  const importCurlAsTab = useApiStudioStore((s) => s.importCurlAsTab)
  const [json, setJson] = useState('')
  const [curl, setCurl] = useState('')
  const [tab, setTab] = useState<ImportTab>(defaultTab)
  const [dragOver, setDragOver] = useState(false)
  const [skipStatic, setSkipStatic] = useState(true)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [busy, setBusy] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const submittedRef = useRef(false)

  useEffect(() => {
    if (open) {
      submittedRef.current = false
      setJson('')
      setCurl('')
      setTab(defaultTab)
      setDragOver(false)
      setResult(null)
      setBusy(false)
    }
  }, [open, defaultTab])

  const detected = useMemo(() => (json.trim() ? detectImportFormat(json) : null), [json])

  const finish = useCallback(
    (imported: ImportResult) => {
      const collectionId = addImportResult(imported)
      if (!collectionId && imported.environments.length === 0) {
        toast.error('Nothing to import')
        submittedRef.current = false
        return
      }
      setResult(imported)
      if (collectionId) onImported?.(collectionId)
    },
    [addImportResult, onImported]
  )

  const importCurl = useCallback(
    (text: string) => {
      if (submittedRef.current || !text.trim()) return
      if (!looksLikeCurl(text)) {
        toast.error('Paste a cURL command starting with curl')
        return
      }
      submittedRef.current = true
      const ok = importCurlAsTab(text)
      if (ok) {
        setCurl('')
        onOpenChange(false)
      } else {
        submittedRef.current = false
      }
    },
    [importCurlAsTab, onOpenChange]
  )

  const importText = useCallback(
    (text: string) => {
      if (submittedRef.current || !text.trim()) return
      if (looksLikeCurl(text)) {
        importCurl(text)
        return
      }
      submittedRef.current = true
      try {
        finish(importFromText(text, { skipStaticAssets: skipStatic }))
      } catch (e) {
        submittedRef.current = false
        toast.error(errorMessage(e, 'Could not import that file'))
      }
    },
    [finish, importCurl, skipStatic]
  )

  const importBruno = useCallback(
    (files: BrunoSourceFile[]) => {
      if (submittedRef.current) return
      submittedRef.current = true
      try {
        finish(importBrunoFolder(files))
      } catch (e) {
        submittedRef.current = false
        toast.error(errorMessage(e, 'Could not import that Bruno collection'))
      }
    },
    [finish]
  )

  async function pickBrunoFolder() {
    setBusy(true)
    try {
      const response = await window.electronAPI.apiStudio.pickImportFolder()
      if (!response.success) toast.error(response.error ?? 'Could not read the folder')
      else if (response.data) importBruno(response.data.files)
    } finally {
      setBusy(false)
    }
  }

  async function readFile(file: File) {
    const text = await file.text()
    if (looksLikeCurl(text)) {
      setCurl(text)
      setTab('curl')
      return
    }
    if (!detectImportFormat(text)) {
      toast.error('Unrecognised file. Supported: Postman, Insomnia, Bruno, HAR, OpenAPI and cURL')
      return
    }
    setJson(text)
    setTab('collection')
  }

  async function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const entry = e.dataTransfer.items?.[0]?.webkitGetAsEntry?.()
    if (entry?.isDirectory) {
      setBusy(true)
      try {
        importBruno(await readDroppedFolder(entry as FileSystemDirectoryEntry))
      } catch (err) {
        toast.error(errorMessage(err, 'Could not read the folder'))
      } finally {
        setBusy(false)
      }
      return
    }
    const file = e.dataTransfer.files[0]
    if (file) void readFile(file)
  }

  function handleImport() {
    if (tab === 'curl') importCurl(curl)
    else importText(json)
  }

  const canImport = tab === 'curl' ? Boolean(curl.trim()) : tab === 'collection' && Boolean(json.trim()) && detected !== null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl gap-0 p-0">
        <DialogHeader className="border-b border-border/60 px-5 py-4">
          <DialogTitle>Import</DialogTitle>
          <p className="text-xs text-muted-foreground">
            Bring in collections from Postman, Insomnia, Bruno, HAR or OpenAPI, or a single cURL command.
          </p>
        </DialogHeader>

        {result ? (
          <ImportSummaryView result={result} />
        ) : (
          <Tabs value={tab} onValueChange={(v) => setTab(v as ImportTab)} className="px-5 pt-3">
            <TabsList className="h-8 w-full justify-start rounded-none border-b border-border/60 bg-transparent p-0">
              <TabsTrigger value="file" className={TAB_TRIGGER}>
                File
              </TabsTrigger>
              <TabsTrigger value="collection" className={TAB_TRIGGER}>
                Paste
              </TabsTrigger>
              <TabsTrigger value="curl" className={TAB_TRIGGER}>
                cURL
              </TabsTrigger>
            </TabsList>

            <TabsContent value="file" className="mt-4 space-y-3 pb-2">
              <div
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragOver(true)
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => void handleDrop(e)}
                className={cn(
                  'flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors',
                  dragOver ? 'border-primary bg-primary/5' : 'border-border/80 bg-muted/20'
                )}
              >
                <Upload className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm font-medium">Drop an export file or a Bruno collection folder</p>
                <p className="text-xs text-muted-foreground">or</p>
                <div className="flex flex-wrap justify-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                    <FileJson className="h-3.5 w-3.5" />
                    Choose file
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => void pickBrunoFolder()} disabled={busy}>
                    <FolderOpen className="h-3.5 w-3.5" />
                    Choose Bruno folder
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Postman · Insomnia (.json, .yaml) · HAR (.har) · OpenAPI · cURL (.txt, .sh)
                </p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,.yaml,.yml,.har,.txt,.sh,.curl,application/json,text/plain,application/yaml"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) void readFile(file)
                  e.target.value = ''
                }}
              />
            </TabsContent>

            <TabsContent value="collection" className="mt-4 space-y-2 pb-2">
              <Textarea
                value={json}
                onChange={(e) => setJson(e.target.value)}
                placeholder="Paste a Postman or Insomnia export, a HAR file or an OpenAPI document"
                rows={12}
                className="font-mono text-xs"
              />
              <div className="flex min-h-6 flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
                <span>
                  {json.trim()
                    ? detected
                      ? `Detected: ${IMPORT_FORMAT_LABELS[detected]}`
                      : 'Format not recognised'
                    : 'The format is detected automatically'}
                </span>
                {detected === 'har' && (
                  <label className="flex cursor-pointer items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={skipStatic}
                      onChange={(e) => setSkipStatic(e.target.checked)}
                      className="h-3.5 w-3.5 accent-primary"
                    />
                    Skip static assets (images, CSS, JS, fonts)
                  </label>
                )}
              </div>
            </TabsContent>

            <TabsContent value="curl" className="mt-4 space-y-2 pb-2">
              <div className="flex items-start gap-2 rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground">
                <Terminal className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Opens as a new request tab. You can save it into a collection afterward.
              </div>
              <Textarea
                value={curl}
                onChange={(e) => setCurl(e.target.value)}
                placeholder={`curl -X POST https://api.example.com/login \\
  -H 'Content-Type: application/json' \\
  -H 'Authorization: Bearer token' \\
  -d '{"email":"you@example.com","password":"secret"}'`}
                rows={10}
                className="font-mono text-xs"
              />
            </TabsContent>
          </Tabs>
        )}

        <DialogFooter className="border-t border-border/60 px-5 py-3">
          {result ? (
            <Button onClick={() => onOpenChange(false)}>Done</Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={handleImport} disabled={!canImport}>
                {tab === 'curl' ? 'Import request' : 'Import'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
