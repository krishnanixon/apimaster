import { useState } from 'react'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { useVectorWorkspaceStore } from '../../stores/vectorWorkspace.store'
import type { VectorUpsertInput } from '@shared/types/vector-workspace'
import { toast } from 'sonner'
import { cn } from '@/shared/lib/utils'
import { Plus, Trash2 } from 'lucide-react'

interface UpsertTabViewProps {
  tabId: string
  connectionId: string
}

interface FormRow {
  id: string
  document: string
  metadata: string
}

function defaultRows(collection?: string): FormRow[] {
  return [
    {
      id: 'doc-1',
      document: 'Sample document text',
      metadata: JSON.stringify({ source: 'studio', collection: collection ?? '' })
    }
  ]
}

export function UpsertTabView({ tabId, connectionId }: UpsertTabViewProps) {
  const tab = useVectorWorkspaceStore((s) => s.tabs.find((t) => t.id === tabId))
  const updateTab = useVectorWorkspaceStore((s) => s.updateTab)
  const upsertVectors = useVectorWorkspaceStore((s) => s.upsertVectors)
  const upsertWithText = useVectorWorkspaceStore((s) => s.upsertWithText)

  const draft = tab?.draft ?? ''
  const mode = tab?.editorMode ?? 'form'
  const collection = tab?.collection ?? ''

  const [rows, setRows] = useState<FormRow[]>(() => defaultRows(tab?.collection))
  const [running, setRunning] = useState(false)

  const handleRunJson = async () => {
    let parsed: VectorUpsertInput
    try {
      parsed = JSON.parse(draft) as VectorUpsertInput
    } catch {
      toast.error('Invalid JSON in upsert body')
      return
    }
    if (!parsed.collection?.trim()) {
      toast.error('collection is required')
      return
    }
    if (!parsed.ids?.length || !parsed.embeddings?.length) {
      toast.error('ids and embeddings are required')
      return
    }
    if (parsed.ids.length !== parsed.embeddings.length) {
      toast.error('ids and embeddings must have the same length')
      return
    }
    setRunning(true)
    await upsertVectors(connectionId, parsed)
    setRunning(false)
  }

  const handleRunForm = async () => {
    const col = collection.trim()
    if (!col) {
      toast.error('Collection is required')
      return
    }
    if (!rows.length) {
      toast.error('Add at least one document')
      return
    }
    const ids: string[] = []
    const documents: string[] = []
    const metadatas: Array<Record<string, unknown> | null> = []

    for (const row of rows) {
      const id = row.id.trim()
      const doc = row.document.trim()
      if (!id || !doc) {
        toast.error('Each row needs an id and document text')
        return
      }
      ids.push(id)
      documents.push(doc)
      if (row.metadata.trim()) {
        try {
          metadatas.push(JSON.parse(row.metadata) as Record<string, unknown>)
        } catch {
          toast.error(`Invalid metadata JSON for “${id}”`)
          return
        }
      } else {
        metadatas.push(null)
      }
    }

    setRunning(true)
    await upsertWithText(connectionId, { collection: col, ids, documents, metadatas })
    setRunning(false)
  }

  const handleRun = () => {
    if (mode === 'form') void handleRunForm()
    else void handleRunJson()
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2">
        <div>
          <p className="text-sm font-medium">Upsert vectors</p>
          <p className="text-[11px] text-muted-foreground">
            {mode === 'form'
              ? 'Paste documents — embeddings are generated from Settings → Vector DB / RAG models.'
              : 'Provide precomputed embeddings that match the collection dimension.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border border-border p-0.5 text-[11px]">
            <button
              type="button"
              className={cn(
                'rounded px-2 py-1',
                mode === 'form' ? 'bg-primary/15 text-primary' : 'text-muted-foreground'
              )}
              onClick={() => updateTab(tabId, { editorMode: 'form' })}
            >
              Documents
            </button>
            <button
              type="button"
              className={cn(
                'rounded px-2 py-1',
                mode === 'json' ? 'bg-primary/15 text-primary' : 'text-muted-foreground'
              )}
              onClick={() => updateTab(tabId, { editorMode: 'json' })}
            >
              JSON
            </button>
          </div>
          <Button size="sm" disabled={running} onClick={handleRun}>
            {running ? (mode === 'form' ? 'Embedding…' : 'Upserting…') : 'Upsert'}
          </Button>
        </div>
      </div>

      {mode === 'form' ? (
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
          <label className="block text-xs">
            <span className="mb-1 block text-muted-foreground">Collection</span>
            <Input
              value={collection}
              onChange={(e) => updateTab(tabId, { collection: e.target.value })}
              placeholder="collection name"
              className="max-w-md"
            />
          </label>

          {rows.map((row, index) => (
            <div key={index} className="rounded-xl border border-border/50 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-[11px] font-medium text-muted-foreground">
                  Document {index + 1}
                </span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-destructive"
                  disabled={rows.length <= 1}
                  onClick={() => setRows((r) => r.filter((_, i) => i !== index))}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <Input
                  className="font-mono text-xs"
                  placeholder="id"
                  value={row.id}
                  onChange={(e) =>
                    setRows((r) => r.map((x, i) => (i === index ? { ...x, id: e.target.value } : x)))
                  }
                />
                <Input
                  className="font-mono text-xs"
                  placeholder='metadata JSON e.g. {"source":"docs"}'
                  value={row.metadata}
                  onChange={(e) =>
                    setRows((r) =>
                      r.map((x, i) => (i === index ? { ...x, metadata: e.target.value } : x))
                    )
                  }
                />
              </div>
              <textarea
                className="mt-2 min-h-[72px] w-full resize-y rounded-md border border-border bg-transparent p-2 text-sm outline-none focus:ring-1 focus:ring-ring"
                placeholder="Document text to embed"
                value={row.document}
                onChange={(e) =>
                  setRows((r) =>
                    r.map((x, i) => (i === index ? { ...x, document: e.target.value } : x))
                  )
                }
              />
            </div>
          ))}

          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              setRows((r) => [
                ...r,
                {
                  id: `doc-${r.length + 1}`,
                  document: '',
                  metadata: '{}'
                }
              ])
            }
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add document
          </Button>
        </div>
      ) : (
        <textarea
          className="min-h-0 flex-1 resize-none border-0 bg-transparent p-4 font-mono text-xs leading-relaxed outline-none"
          value={draft}
          onChange={(e) => updateTab(tabId, { draft: e.target.value })}
          spellCheck={false}
        />
      )}
    </div>
  )
}
