import { useState } from 'react'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { useVectorWorkspaceStore } from '../../stores/vectorWorkspace.store'
import type { VectorSearchInput } from '@shared/types/vector-workspace'
import { toast } from 'sonner'
import { cn } from '@/shared/lib/utils'

interface SearchTabViewProps {
  tabId: string
  connectionId: string
}

export function SearchTabView({ tabId, connectionId }: SearchTabViewProps) {
  const tab = useVectorWorkspaceStore((s) => s.tabs.find((t) => t.id === tabId))
  const updateTab = useVectorWorkspaceStore((s) => s.updateTab)
  const search = useVectorWorkspaceStore((s) => s.search)
  const searchWithText = useVectorWorkspaceStore((s) => s.searchWithText)
  const openCollectionTab = useVectorWorkspaceStore((s) => s.openCollectionTab)
  const settings = useVectorWorkspaceStore((s) => s.settings)
  const getVector = useVectorWorkspaceStore((s) => s.getVector)

  const [running, setRunning] = useState(false)
  const [topK, setTopK] = useState(String(settings.defaultTopK))
  const [whereJson, setWhereJson] = useState('')
  const [preview, setPreview] = useState<string | null>(null)

  const draft = tab?.draft ?? ''
  const mode = tab?.editorMode ?? 'form'
  const queryText = tab?.queryText ?? ''
  const collection = tab?.collection ?? ''
  const searchResult = tab?.searchResult ?? null
  const searchError = tab?.searchError ?? null

  const handleRunForm = async () => {
    const col = collection.trim()
    if (!col) {
      toast.error('Collection is required')
      return
    }
    const q = queryText.trim()
    if (!q) {
      toast.error('Enter a text query to embed and search')
      return
    }
    let where: Record<string, unknown> | undefined
    if (whereJson.trim()) {
      try {
        where = JSON.parse(whereJson) as Record<string, unknown>
      } catch {
        toast.error('Invalid where JSON')
        return
      }
    }
    setRunning(true)
    await searchWithText(
      connectionId,
      {
        collection: col,
        query: q,
        top_k: Number(topK) || settings.defaultTopK,
        where,
        include_metadata: settings.includeMetadata,
        include_documents: settings.includeDocuments,
        include_distances: settings.includeDistances,
        include_embeddings: settings.includeEmbeddings,
        score_threshold: settings.ragScoreThreshold
      },
      tabId
    )
    setRunning(false)
  }

  const handleRunJson = async () => {
    let parsed: VectorSearchInput
    try {
      parsed = JSON.parse(draft) as VectorSearchInput
    } catch {
      toast.error('Invalid JSON in search body')
      return
    }
    if (!parsed.collection?.trim()) {
      toast.error('collection is required')
      return
    }
    if (!parsed.query_embeddings?.length) {
      toast.error('query_embeddings is required')
      return
    }
    setRunning(true)
    await search(connectionId, parsed, tabId)
    setRunning(false)
  }

  const handleRun = () => {
    if (mode === 'form') void handleRunForm()
    else void handleRunJson()
  }

  const rows =
    searchResult?.ids?.[0]?.map((id, i) => ({
      id,
      distance: searchResult.distances?.[0]?.[i],
      document: searchResult.documents?.[0]?.[i],
      metadata: searchResult.metadatas?.[0]?.[i]
    })) ?? []

  const openHit = async (id: string) => {
    const col = (mode === 'json'
      ? (() => {
          try {
            return (JSON.parse(draft) as VectorSearchInput).collection
          } catch {
            return collection
          }
        })()
      : collection) || collection
    if (!col) return
    openCollectionTab(connectionId, col)
    const data = await getVector(connectionId, col, id)
    if (data) setPreview(JSON.stringify(data, null, 2))
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2">
        <div>
          <p className="text-sm font-medium">Similarity search</p>
          <p className="text-[11px] text-muted-foreground">
            {mode === 'form'
              ? 'Type a query — embeddings use Settings → Vector DB / RAG models.'
              : 'Pass precomputed query embeddings as JSON.'}
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
              Text
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
            {running ? 'Searching…' : 'Run search'}
          </Button>
        </div>
      </div>

      {mode === 'form' ? (
        <div className="space-y-3 overflow-y-auto border-b border-border p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs">
              <span className="mb-1 block text-muted-foreground">Collection</span>
              <Input
                value={collection}
                onChange={(e) => updateTab(tabId, { collection: e.target.value })}
                placeholder="collection name"
              />
            </label>
            <label className="block text-xs">
              <span className="mb-1 block text-muted-foreground">Top K</span>
              <Input type="number" min={1} value={topK} onChange={(e) => setTopK(e.target.value)} />
            </label>
          </div>
          <label className="block text-xs">
            <span className="mb-1 block text-muted-foreground">Query text</span>
            <textarea
              className="min-h-[88px] w-full resize-y rounded-md border border-border bg-transparent p-3 text-sm outline-none focus:ring-1 focus:ring-ring"
              value={queryText}
              onChange={(e) => updateTab(tabId, { queryText: e.target.value })}
              placeholder="What are you looking for?"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleRun()
              }}
            />
          </label>
          <label className="block text-xs">
            <span className="mb-1 block text-muted-foreground">Where filter (optional JSON)</span>
            <Input
              className="font-mono text-xs"
              value={whereJson}
              onChange={(e) => setWhereJson(e.target.value)}
              placeholder='{"source":"docs"}'
            />
          </label>
        </div>
      ) : (
        <textarea
          className="min-h-[200px] flex-1 resize-none border-0 bg-transparent p-4 font-mono text-xs leading-relaxed outline-none"
          value={draft}
          onChange={(e) => updateTab(tabId, { draft: e.target.value })}
          spellCheck={false}
        />
      )}

      {(searchError || rows.length > 0 || preview) && (
        <div className="max-h-[45%] min-h-0 flex-1 overflow-auto border-t border-border bg-muted/10 p-3">
          {searchError && <p className="mb-2 text-xs text-destructive">{searchError}</p>}
          {rows.length > 0 && (
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-muted-foreground">
                  <th className="px-2 py-1 font-medium">Id</th>
                  <th className="px-2 py-1 font-medium">Distance</th>
                  <th className="px-2 py-1 font-medium">Document</th>
                  <th className="px-2 py-1 font-medium">Metadata</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t border-border/40 align-top hover:bg-muted/30">
                    <td className="px-2 py-1.5 font-mono">
                      <button
                        type="button"
                        className="text-left hover:underline"
                        onClick={() => void openHit(row.id)}
                      >
                        {row.id}
                      </button>
                    </td>
                    <td className="px-2 py-1.5">
                      {row.distance != null ? row.distance.toFixed(6) : '—'}
                    </td>
                    <td className="max-w-[240px] truncate px-2 py-1.5">{row.document ?? '—'}</td>
                    <td className="max-w-[200px] truncate px-2 py-1.5 font-mono text-[10px]">
                      {row.metadata ? JSON.stringify(row.metadata) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {preview && (
            <pre className="mt-3 max-h-48 overflow-auto rounded-lg bg-muted/40 p-3 text-[11px]">
              {preview}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}
