import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, FileUp, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/shared/components/ui/button'
import { Textarea } from '@/shared/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog'
import { cn } from '@/shared/lib/utils'
import { useApiStudioStore } from '../stores/apiStudioStore'
import { importRequestsFromText, type RequestImport } from '../services/collectionImport'
import { flattenFolderTree } from '../services/folderTree'
import { METHOD_COLORS, requestProtocolLabel } from '../types/api.types'

interface ImportRequestDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Collection to add into; the user can change it. */
  collectionId: string | null
}

type Check = { ok: true; value: RequestImport } | { ok: false; error: string } | null

/**
 * Imports a single request (or the few requests in a small export) into a collection.
 * Accepts cURL, a Postman item or collection, HAR, Insomnia and Shurikly request/collection files.
 */
export function ImportRequestDialog({ open, onOpenChange, collectionId }: ImportRequestDialogProps) {
  const collections = useApiStudioStore((s) => s.collections)
  const addRequestsToCollection = useApiStudioStore((s) => s.addRequestsToCollection)
  const openRequestTab = useApiStudioStore((s) => s.openRequestTab)
  const [text, setText] = useState('')
  const [targetId, setTargetId] = useState<string>('')
  const [folderId, setFolderId] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setText('')
    setTargetId(collectionId ?? collections[0]?.id ?? '')
    setFolderId(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, collectionId])

  const check: Check = useMemo(() => {
    if (!text.trim()) return null
    try {
      return { ok: true, value: importRequestsFromText(text) }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'Could not read this request' }
    }
  }, [text])

  const target = collections.find((c) => c.id === targetId)
  const folderOptions = target ? flattenFolderTree(target.folders) : []

  async function readFile(file: File) {
    setText(await file.text())
  }

  function handleImport() {
    if (!check?.ok || !target) return
    const before = new Set(target.requests.map((r) => r.id))
    addRequestsToCollection(target.id, check.value.requests, folderId)
    const added = useApiStudioStore
      .getState()
      .collections.find((c) => c.id === target.id)
      ?.requests.filter((r) => !before.has(r.id))
    if (added?.length === 1) openRequestTab(target.id, added[0].id)
    const count = check.value.requests.length
    toast.success(`Imported ${count} request${count === 1 ? '' : 's'} into ${target.name}`)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Import request</DialogTitle>
          <DialogDescription>
            Paste a cURL command, or drop a Postman, HAR, Insomnia or Shurikly request file.
          </DialogDescription>
        </DialogHeader>

        <div
          className={cn('relative rounded-lg', dragOver && 'ring-2 ring-primary/40')}
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragOver(false)
            const file = e.dataTransfer.files[0]
            if (file) void readFile(file)
          }}
        >
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={`curl 'https://api.example.com/orders?status=open' \\
  -H 'Accept: application/json' \\
  -H 'Authorization: Bearer <token>'`}
            rows={9}
            className="font-mono text-xs"
            autoFocus
          />
        </div>

        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1 text-[11px]">
            {check === null && <p className="text-muted-foreground">The format is detected automatically.</p>}
            {check && !check.ok && (
              <p className="flex items-center gap-1.5 text-destructive">
                <XCircle className="h-3.5 w-3.5 shrink-0" /> {check.error}
              </p>
            )}
            {check?.ok && (
              <div className="space-y-1">
                <p className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> Valid {check.value.formatLabel} —{' '}
                  {check.value.requests.length} request{check.value.requests.length === 1 ? '' : 's'}
                </p>
                <ul className="max-h-24 space-y-0.5 overflow-y-auto pl-5">
                  {check.value.requests.map((r) => (
                    <li key={r.id} className="flex min-w-0 gap-1.5">
                      <span className={cn('w-12 shrink-0 font-semibold', METHOD_COLORS[requestProtocolLabel(r)])}>
                        {requestProtocolLabel(r)}
                      </span>
                      <span className="truncate text-foreground">{r.name}</span>
                    </li>
                  ))}
                </ul>
                {check.value.warnings.slice(0, 3).map((w) => (
                  <p key={w} className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="h-3 w-3 shrink-0" /> {w}
                  </p>
                ))}
              </div>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
            <FileUp className="h-3.5 w-3.5" /> Choose file
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,.har,.yaml,.yml,.txt,.sh,.curl,application/json,text/plain"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void readFile(file)
              e.target.value = ''
            }}
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Collection</span>
            <select
              value={targetId}
              onChange={(e) => {
                setTargetId(e.target.value)
                setFolderId(null)
              }}
              className="h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm"
            >
              {collections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Folder</span>
            <select
              value={folderId ?? ''}
              onChange={(e) => setFolderId(e.target.value || null)}
              disabled={folderOptions.length === 0}
              className="h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm disabled:opacity-50"
            >
              <option value="">Collection root</option>
              {folderOptions.map(({ folder, depth }) => (
                <option key={folder.id} value={folder.id}>
                  {' '.repeat(depth * 2)}
                  {depth > 0 ? '└ ' : ''}
                  {folder.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleImport} disabled={!check?.ok || !target}>
            Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
