import { useEffect, useMemo, useState } from 'react'
import {
  BookOpen,
  Loader2,
  Plus,
  RefreshCw,
  Trash2
} from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Badge } from '@/shared/components/ui/badge'
import { EmptyState } from '@/shared/components/ui/empty-state'
import { ModulePage, ModuleTab, ModuleToolbar, PageContent, PageHeader } from '@/shared/components/layout/ModulePage'
import { cn } from '@/shared/lib/utils'
import { useScopeContext } from '@/core/scope/useScopeContext'
import type { RagTrainingCategory, RagTrainingDocument } from '@shared/types/rag-training'
import { RAG_TRAINING_CATEGORY_LABELS } from '@shared/types/rag-training'
import { useRagTrainingStore } from '../stores/ragTraining.store'

const CATEGORIES = Object.keys(RAG_TRAINING_CATEGORY_LABELS) as RagTrainingCategory[]

function emptyDraft(): {
  title: string
  source: string
  purpose: string
  category: RagTrainingCategory
  tags: string
  content: string
  enabled: boolean
} {
  return {
    title: '',
    source: '',
    purpose: '',
    category: 'domain',
    tags: '',
    content: '',
    enabled: true
  }
}

function docToDraft(doc: RagTrainingDocument) {
  return {
    title: doc.title,
    source: doc.source,
    purpose: doc.purpose,
    category: doc.category,
    tags: doc.tags.join(', '),
    content: doc.content,
    enabled: doc.enabled
  }
}

export function RagStudioPage() {
  const { scope, projectId } = useScopeContext()
  const setScope = useRagTrainingStore((s) => s.setScope)
  const load = useRagTrainingStore((s) => s.load)
  const loadSettings = useRagTrainingStore((s) => s.loadSettings)
  const documents = useRagTrainingStore((s) => s.documents)
  const selectedId = useRagTrainingStore((s) => s.selectedId)
  const select = useRagTrainingStore((s) => s.select)
  const create = useRagTrainingStore((s) => s.create)
  const update = useRagTrainingStore((s) => s.update)
  const remove = useRagTrainingStore((s) => s.remove)
  const index = useRagTrainingStore((s) => s.index)
  const indexing = useRagTrainingStore((s) => s.indexing)
  const loading = useRagTrainingStore((s) => s.loading)
  const indexStatus = useRagTrainingStore((s) => s.indexStatus)
  const settings = useRagTrainingStore((s) => s.settings)
  const saveSettings = useRagTrainingStore((s) => s.saveSettings)
  const saveModelProfile = useRagTrainingStore((s) => s.saveModelProfile)

  const [draft, setDraft] = useState(emptyDraft())
  const [profile, setProfile] = useState(settings.modelProfile)
  const [tab, setTab] = useState<'corpus' | 'model'>('corpus')
  const [filter, setFilter] = useState('')

  useEffect(() => {
    setScope(scope, projectId)
  }, [scope, projectId, setScope])

  useEffect(() => {
    void load()
    void loadSettings()
  }, [scope, projectId, load, loadSettings])

  useEffect(() => {
    setProfile(settings.modelProfile)
  }, [settings.modelProfile])

  const selected = useMemo(
    () => documents.find((d) => d.id === selectedId) ?? null,
    [documents, selectedId]
  )

  useEffect(() => {
    if (selected) setDraft(docToDraft(selected))
    else setDraft(emptyDraft())
  }, [selected])

  const filtered = documents.filter((d) => {
    const q = filter.trim().toLowerCase()
    if (!q) return true
    return (
      d.title.toLowerCase().includes(q) ||
      d.content.toLowerCase().includes(q) ||
      d.tags.some((t) => t.toLowerCase().includes(q))
    )
  })

  const handleNew = () => {
    select(null)
    setDraft(emptyDraft())
  }

  const handleSave = async () => {
    const tags = draft.tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
    if (!draft.title.trim() || !draft.content.trim()) return

    if (selected) {
      await update(selected.id, {
        title: draft.title,
        source: draft.source,
        purpose: draft.purpose,
        category: draft.category,
        tags,
        content: draft.content,
        enabled: draft.enabled
      })
    } else {
      await create({
        title: draft.title,
        source: draft.source,
        purpose: draft.purpose,
        category: draft.category,
        tags,
        content: draft.content,
        enabled: draft.enabled
      })
    }
  }

  const statusBadge = (() => {
    if (!indexStatus) return null
    if (indexStatus.lastError) {
      return <Badge variant="outline" className="text-[10px] text-amber-700">Index error</Badge>
    }
    if (!indexStatus.indexed && indexStatus.documentCount === 0) {
      return <Badge variant="outline" className="text-[10px] text-muted-foreground">Empty</Badge>
    }
    if (indexStatus.stale || !indexStatus.indexed) {
      return (
        <Badge variant="outline" className="border-amber-500/40 text-[10px] text-amber-700">
          Needs index · {indexStatus.documentCount} docs
        </Badge>
      )
    }
    return (
      <Badge variant="outline" className="border-emerald-500/30 text-[10px] text-emerald-700">
        Indexed · {indexStatus.vectorCount} vectors
      </Badge>
    )
  })()

  return (
    <ModulePage>
      <PageHeader
        title="RAG Studio"
        description={
          scope === 'PROJECT' && projectId
            ? 'Training corpus and model profile for OpenAI / local RAG · project scope'
            : 'Training corpus and model profile for OpenAI / local RAG · global scope'
        }
        fluid
        actions={
          <>
            {statusBadge}
            <Button
              size="sm"
              variant="outline"
              className="h-7"
              disabled={indexing}
              onClick={() => void index()}
              title="Embed training docs into LiteChroma"
            >
              {indexing ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              )}
              Index corpus
            </Button>
          </>
        }
      />

      <ModuleToolbar>
        <ModuleTab active={tab === 'corpus'} onClick={() => setTab('corpus')}>
          Training data
        </ModuleTab>
        <ModuleTab active={tab === 'model'} onClick={() => setTab('model')}>
          Model profile
        </ModuleTab>
      </ModuleToolbar>

      {tab === 'model' ? (
        <PageContent>
          <div className="mx-auto w-full max-w-2xl space-y-4">
          <p className="text-sm text-muted-foreground">
            These details are injected into every chatbot (global + project) when RAG is enabled,
            so the assistant follows your domain, tone, and standing instructions.
          </p>
          <div className="grid gap-3">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Display name / persona</label>
              <Input
                value={profile.displayName}
                onChange={(e) => setProfile((p) => ({ ...p, displayName: e.target.value }))}
                placeholder="e.g. Requirements architect"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Domain</label>
                <Input
                  value={profile.domain}
                  onChange={(e) => setProfile((p) => ({ ...p, domain: e.target.value }))}
                  placeholder="Fintech, healthcare, SaaS…"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Tone</label>
                <Input
                  value={profile.tone}
                  onChange={(e) => setProfile((p) => ({ ...p, tone: e.target.value }))}
                  placeholder="Precise, concise, formal…"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">
                Preferred topics (comma-separated)
              </label>
              <Input
                value={profile.preferredTopics.join(', ')}
                onChange={(e) =>
                  setProfile((p) => ({
                    ...p,
                    preferredTopics: e.target.value
                      .split(',')
                      .map((t) => t.trim())
                      .filter(Boolean)
                  }))
                }
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Standing instructions</label>
              <textarea
                className="min-h-[160px] w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                value={profile.systemInstructions}
                onChange={(e) => setProfile((p) => ({ ...p, systemInstructions: e.target.value }))}
                placeholder="Always cite requirements by code. Prefer modular architecture. Never invent APIs…"
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={settings.includeInRag}
                onChange={(e) => void saveSettings({ includeInRag: e.target.checked })}
              />
              Include training corpus in RAG retrieval
            </label>
            <div className="w-40">
              <label className="mb-1 block text-xs text-muted-foreground">Training top-k</label>
              <Input
                type="number"
                value={settings.trainingTopK}
                onChange={(e) => void saveSettings({ trainingTopK: Number(e.target.value) || 4 })}
              />
            </div>
            <Button className="w-fit" onClick={() => void saveModelProfile(profile)}>
              Save model profile
            </Button>
          </div>
          </div>
        </PageContent>
      ) : (
        <PageContent fullBleed>
        <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[280px_1fr]">
          <aside className="flex min-h-0 flex-col border-r border-border/60">
            <div className="flex items-center gap-2 border-b border-border/50 p-3">
              <Input
                placeholder="Filter…"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="h-8"
              />
              <Button size="icon" variant="outline" className="h-8 w-8 shrink-0" onClick={handleNew}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto">
              {loading ? (
                <div className="flex justify-center p-6">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : filtered.length === 0 ? (
                <div className="p-4">
                  <EmptyState
                    icon={<BookOpen className="h-5 w-5" />}
                    title="No training docs"
                    description="Add guidelines, examples, or domain notes for your model."
                  />
                </div>
              ) : (
                <ul className="p-2">
                  {filtered.map((d) => (
                    <li key={d.id}>
                      <button
                        type="button"
                        onClick={() => select(d.id)}
                        className={cn(
                          'mb-1 w-full rounded-md px-3 py-2 text-left text-sm transition-colors',
                          selectedId === d.id ? 'bg-primary/10 text-primary' : 'hover:bg-muted/60'
                        )}
                      >
                        <span className="block truncate font-medium">{d.title}</span>
                        <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
                          {RAG_TRAINING_CATEGORY_LABELS[d.category]}
                          {!d.enabled ? ' · disabled' : ''}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </aside>

          <section className="min-h-0 overflow-auto p-4 md:p-6">
            <div className="mx-auto max-w-3xl space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">
                  {selected ? 'Edit training document' : 'New training document'}
                </h2>
                {selected && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    onClick={() => void remove(selected.id)}
                  >
                    <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                    Delete
                  </Button>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs text-muted-foreground">Title</label>
                  <Input
                    value={draft.title}
                    onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                    placeholder="Auth error handling patterns"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">Category</label>
                  <select
                    className="w-full rounded-md border border-border bg-background px-2 py-2 text-sm"
                    value={draft.category}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        category: e.target.value as RagTrainingCategory
                      }))
                    }
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {RAG_TRAINING_CATEGORY_LABELS[c]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">Source</label>
                  <Input
                    value={draft.source}
                    onChange={(e) => setDraft((d) => ({ ...d, source: e.target.value }))}
                    placeholder="Confluence, handbook, past project…"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs text-muted-foreground">
                    Purpose (what this teaches the model)
                  </label>
                  <Input
                    value={draft.purpose}
                    onChange={(e) => setDraft((d) => ({ ...d, purpose: e.target.value }))}
                    placeholder="Teach consistent NFR wording for latency SLAs"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs text-muted-foreground">Tags (comma-separated)</label>
                  <Input
                    value={draft.tags}
                    onChange={(e) => setDraft((d) => ({ ...d, tags: e.target.value }))}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs text-muted-foreground">Content</label>
                  <textarea
                    className="min-h-[240px] w-full rounded-md border border-border bg-background px-3 py-2 text-sm leading-relaxed"
                    value={draft.content}
                    onChange={(e) => setDraft((d) => ({ ...d, content: e.target.value }))}
                    placeholder="Paste guidelines, examples, FAQs, or domain notes…"
                  />
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={draft.enabled}
                    onChange={(e) => setDraft((d) => ({ ...d, enabled: e.target.checked }))}
                  />
                  Enabled for indexing
                </label>
              </div>

              <Button onClick={() => void handleSave()} disabled={!draft.title.trim() || !draft.content.trim()}>
                {selected ? 'Save changes' : 'Add to corpus'}
              </Button>
            </div>
          </section>
        </div>
        </PageContent>
      )}
    </ModulePage>
  )
}
