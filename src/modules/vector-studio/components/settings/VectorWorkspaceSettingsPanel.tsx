import { useEffect, useRef, useState } from 'react'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import type { VectorWorkspaceSettings } from '@shared/types/vector-workspace'
import { ASSISTANT_NAME } from '@shared/constants/product'
import { useVectorWorkspaceStore } from '../../stores/vectorWorkspace.store'

interface VectorWorkspaceSettingsPanelProps {
  showSaveButton?: boolean
  onSaved?: () => void
}

export function VectorWorkspaceSettingsPanel({
  showSaveButton = true,
  onSaved
}: VectorWorkspaceSettingsPanelProps) {
  const settings = useVectorWorkspaceStore((s) => s.settings)
  const connections = useVectorWorkspaceStore((s) => s.connections)
  const loadSettings = useVectorWorkspaceStore((s) => s.loadSettings)
  const loadConnections = useVectorWorkspaceStore((s) => s.loadConnections)
  const saveSettings = useVectorWorkspaceStore((s) => s.saveSettings)
  const [local, setLocal] = useState<VectorWorkspaceSettings>(settings)
  const isDirtyRef = useRef(false)

  useEffect(() => {
    void loadSettings()
    void loadConnections()
  }, [loadSettings, loadConnections])

  useEffect(() => {
    if (!isDirtyRef.current) setLocal(settings)
  }, [settings])

  const markDirty = (patch: Partial<VectorWorkspaceSettings>) => {
    isDirtyRef.current = true
    setLocal((s) => ({ ...s, ...patch }))
  }

  const handleSave = async () => {
    await saveSettings(local)
    isDirtyRef.current = false
    onSaved?.()
  }

  return (
    <div className="grid gap-6">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Default top-k</label>
          <Input
            type="number"
            value={local.defaultTopK}
            onChange={(e) => markDirty({ defaultTopK: Number(e.target.value) })}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Default dimension
          </label>
          <Input
            type="number"
            value={local.defaultDimension}
            onChange={(e) => markDirty({ defaultDimension: Number(e.target.value) })}
          />
          <p className="mt-1 text-[10px] text-muted-foreground">
            Must match the embedding model (OpenAI text-embedding-3-* can resize; Ollama all-minilm ≈
            384, nomic-embed-text ≈ 768).
          </p>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Default metric</label>
          <select
            className="w-full rounded-md border border-border bg-background px-2 py-2 text-sm"
            value={local.defaultMetric}
            onChange={(e) =>
              markDirty({ defaultMetric: e.target.value as VectorWorkspaceSettings['defaultMetric'] })
            }
          >
            <option value="cosine">Cosine</option>
            <option value="l2">L2</option>
            <option value="ip">Inner product</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Default index</label>
          <select
            className="w-full rounded-md border border-border bg-background px-2 py-2 text-sm"
            value={local.defaultIndex}
            onChange={(e) =>
              markDirty({ defaultIndex: e.target.value as VectorWorkspaceSettings['defaultIndex'] })
            }
          >
            <option value="flat">Flat</option>
            <option value="hnsw">HNSW</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Connection timeout (ms)
          </label>
          <Input
            type="number"
            value={local.connectionTimeoutMs}
            onChange={(e) => markDirty({ connectionTimeoutMs: Number(e.target.value) })}
          />
        </div>
      </div>

      <div className="divide-y divide-border/60 rounded-xl border border-border/50 p-4">
        {(
          [
            ['includeMetadata', 'Include metadata', 'Return metadata fields in search results.'],
            ['includeDocuments', 'Include documents', 'Return document text in search results.'],
            ['includeDistances', 'Include distances', 'Return similarity distances.'],
            ['includeEmbeddings', 'Include embeddings', 'Return raw embedding vectors (large).'],
            ['confirmDestructive', 'Confirm destructive actions', 'Ask before deleting collections or vectors.']
          ] as const
        ).map(([key, label, description]) => (
          <label key={key} className="flex cursor-pointer items-start gap-3 py-3 first:pt-0 last:pb-0">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={local[key]}
              onChange={(e) => markDirty({ [key]: e.target.checked })}
            />
            <span>
              <span className="block text-sm font-medium">{label}</span>
              <span className="text-[11px] text-muted-foreground">{description}</span>
            </span>
          </label>
        ))}
      </div>

      <section className="space-y-4 rounded-xl border border-border/50 p-4">
        <div>
          <h4 className="text-sm font-semibold">RAG (project knowledge retrieval)</h4>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            When enabled, Project AI embeds the user question, searches LiteChroma for the most
            relevant knowledge chunks, and injects only those into the prompt — instead of dumping
            the full knowledge base. Requires a running LiteChroma server and an indexed project
            (Knowledge → Index for RAG).
          </p>
        </div>

        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={local.ragEnabled}
            onChange={(e) => markDirty({ ragEnabled: e.target.checked })}
          />
          <span>
            <span className="block text-sm font-medium">Enable RAG for project chat</span>
            <span className="text-[11px] text-muted-foreground">
              Uses vector search over indexed knowledge for chat and the {ASSISTANT_NAME} voice assistant. Also
              toggled from Settings → Voice.
            </span>
          </span>
        </label>

        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={local.ragFallbackToFullContext}
            onChange={(e) => markDirty({ ragFallbackToFullContext: e.target.checked })}
          />
          <span>
            <span className="block text-sm font-medium">Fall back to full knowledge dump</span>
            <span className="text-[11px] text-muted-foreground">
              If retrieval fails or the collection is empty, keep using the brief knowledge context.
            </span>
          </span>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              RAG connection
            </label>
            <select
              className="w-full rounded-md border border-border bg-background px-2 py-2 text-sm"
              value={local.ragConnectionId ?? ''}
              onChange={(e) =>
                markDirty({ ragConnectionId: e.target.value ? e.target.value : null })
              }
            >
              <option value="">Auto (first / healthy)</option>
              {connections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.config.host}:{c.config.port})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">RAG top-k</label>
            <Input
              type="number"
              value={local.ragTopK}
              onChange={(e) => markDirty({ ragTopK: Number(e.target.value) })}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Embedding provider
            </label>
            <select
              className="w-full rounded-md border border-border bg-background px-2 py-2 text-sm"
              value={local.ragEmbeddingProvider}
              onChange={(e) =>
                markDirty({
                  ragEmbeddingProvider: e.target
                    .value as VectorWorkspaceSettings['ragEmbeddingProvider']
                })
              }
            >
              <option value="auto">Auto (follow AI mode)</option>
              <option value="openai">OpenAI</option>
              <option value="ollama">Ollama (local)</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              OpenAI embedding model
            </label>
            <Input
              value={local.ragOpenAiEmbeddingModel}
              onChange={(e) => markDirty({ ragOpenAiEmbeddingModel: e.target.value })}
              placeholder="text-embedding-3-small"
            />
          </div>
          <div className="col-span-2">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Ollama embedding model
            </label>
            <Input
              value={local.ragOllamaEmbeddingModel}
              onChange={(e) => markDirty({ ragOllamaEmbeddingModel: e.target.value })}
              placeholder="all-minilm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Max distance (score threshold)
            </label>
            <Input
              type="number"
              step="0.05"
              min={0}
              max={2}
              placeholder="off"
              value={local.ragScoreThreshold ?? ''}
              onChange={(e) => {
                const raw = e.target.value.trim()
                markDirty({
                  ragScoreThreshold: raw === '' ? null : Number(raw)
                })
              }}
            />
            <p className="mt-1 text-[10px] text-muted-foreground">
              Leave empty to disable. LiteChroma keeps hits with distance ≤ this value (cosine
              often 0.55–0.85).
            </p>
          </div>
        </div>
      </section>

      {showSaveButton && (
        <Button className="w-fit" onClick={() => void handleSave()}>
          Save workspace settings
        </Button>
      )}
    </div>
  )
}
