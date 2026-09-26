import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Copy,
  MoreHorizontal,
  Pin,
  Plus,
  Presentation,
  Search,
  Sparkles,
  Trash2
} from 'lucide-react'
import { toast } from 'sonner'
import type { Presentation as PresentationRecord } from '@shared/types'
import {
  createStarterCards,
  getPresentationTheme,
  parseCards,
  PRESENTATION_TEMPLATES,
  serializeCards
} from '@shared/lib/presentation-model'
import { usePresentationStore } from '../stores/presentation.store'
import { GenerateWizard } from '../components/GenerateWizard'
import { useProjectStore } from '@/shared/stores/project.store'
import { useDocumentStore } from '@/features/documents/stores/document.store'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Spinner } from '@/shared/components/ui/spinner'
import { EmptyState } from '@/shared/components/ui/empty-state'
import { ConfirmDialog } from '@/shared/components/ui/confirm-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/shared/components/ui/dropdown-menu'
import { ModulePage, ModuleTab, ModuleToolbar, PageContent, PageHeader } from '@/shared/components/layout/ModulePage'
import { cn, formatRelativeTime } from '@/shared/lib/utils'
import { parsePresentationDocument, serializePresentationDocument } from '@shared/lib/presentation-schema'
import { buildDocumentFromSlideTemplate, getTemplatePreviewSlide, PRESENTATION_SLIDE_TEMPLATES } from '@shared/lib/presentation-slide-templates'
import { PRESENTATION_SLIDE_HEIGHT, PRESENTATION_SLIDE_WIDTH } from '@shared/types/presentation-document'
import { SlideRenderer } from '../rendering/SlideRenderer'
import { TemplatePreviewCard } from '../components/TemplatePreviewCard'

export function PresentationsListPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const currentProject = useProjectStore((s) => s.currentProject)
  const documents = useDocumentStore((s) => s.documents)
  const loadDocuments = useDocumentStore((s) => s.loadDocuments)
  const {
    presentations,
    isLoading,
    loadPresentations,
    createPresentation,
    deletePresentation,
    duplicatePresentation,
    updatePresentation
  } = usePresentationStore()

  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<'decks' | 'templates'>('decks')
  const [pendingDelete, setPendingDelete] = useState<PresentationRecord | null>(null)
  const [generateOpen, setGenerateOpen] = useState(false)

  useEffect(() => {
    if (projectId) {
      void loadPresentations(projectId)
      void loadDocuments(projectId)
    }
  }, [projectId, loadPresentations, loadDocuments])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return presentations
    return presentations.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.themeId.toLowerCase().includes(q)
    )
  }, [presentations, search])

  const openPresentation = useCallback(
    (id: string) => navigate(`/project/${projectId}/presentations/${id}`),
    [navigate, projectId]
  )

  const handleCreateBlank = useCallback(async () => {
    if (!projectId) return
    const created = await createPresentation({
      projectId,
      title: 'Untitled Presentation',
      cards: serializeCards(createStarterCards())
    })
    if (created) openPresentation(created.id)
  }, [projectId, createPresentation, openPresentation])

  const handleUseSlideTemplate = useCallback(
    async (templateId: string) => {
      if (!projectId) return
      const created = await createPresentation({
        projectId,
        title: 'Untitled Presentation',
        cards: serializeCards(createStarterCards())
      })
      if (!created) return
      const doc = buildDocumentFromSlideTemplate(templateId, {
        id: created.id,
        projectId,
        title: PRESENTATION_SLIDE_TEMPLATES.find((t) => t.id === templateId)?.title
      })
      if (!doc) return
      await updatePresentation(created.id, {
        title: doc.title,
        description: doc.description ?? '',
        themeId: doc.themeId,
        templateId: doc.templateId ?? '',
        documentJson: serializePresentationDocument(doc),
        schemaVersion: doc.schemaVersion
      })
      toast.success(`Created from ${doc.title}`)
      openPresentation(created.id)
    },
    [projectId, createPresentation, updatePresentation, openPresentation]
  )

  const handleUseTemplate = useCallback(
    async (templateId: string) => {
      if (!projectId) return
      const template = PRESENTATION_TEMPLATES.find((t) => t.id === templateId)
      if (!template) return
      const created = await createPresentation({
        projectId,
        title: template.title,
        description: template.description,
        themeId: template.themeId,
        cards: serializeCards(template.build())
      })
      if (created) {
        toast.success(`Created from ${template.title}`)
        openPresentation(created.id)
      }
    },
    [projectId, createPresentation, openPresentation]
  )

  const togglePin = useCallback(
    (presentation: PresentationRecord) => {
      void updatePresentation(presentation.id, { isPinned: !presentation.isPinned })
    },
    [updatePresentation]
  )

  if (!projectId) return null

  return (
    <ModulePage>
      <PageHeader
        title="Presentation Studio"
        description={
          currentProject
            ? `${currentProject.name} · decks for this project`
            : 'Create and manage presentation decks'
        }
        fluid
        actions={
          <>
            <Button size="sm" variant="outline" className="h-7" onClick={() => setGenerateOpen(true)}>
              <Sparkles className="h-3.5 w-3.5" />
              AI Generate
            </Button>
            <Button size="sm" className="h-7" onClick={() => void handleCreateBlank()}>
              <Plus className="h-3.5 w-3.5" />
              New Presentation
            </Button>
          </>
        }
      />

      <ModuleToolbar>
        <div className="flex items-center gap-1">
          {(['decks', 'templates'] as const).map((value) => (
            <ModuleTab key={value} active={tab === value} onClick={() => setTab(value)}>
              {value}
            </ModuleTab>
          ))}
        </div>
        {tab === 'decks' && (
          <div className="relative ml-auto w-64">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search presentations"
              className="h-7 pl-8 text-[12px]"
            />
          </div>
        )}
      </ModuleToolbar>

      <PageContent fluid>
        {tab === 'templates' ? (
          <div className="space-y-6">
            <section>
              <h2 className="mb-3 text-sm font-semibold">Canvas templates</h2>
              <p className="mb-3 text-[11px] text-muted-foreground">
                Free-form slide layouts with positioned elements — edit freely in the designer.
              </p>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {PRESENTATION_SLIDE_TEMPLATES.map((template) => {
                  const previewSlide = getTemplatePreviewSlide(template.id)
                  if (!previewSlide) return null
                  return (
                    <div
                      key={template.id}
                      className="rounded-xl border border-border/80 bg-card p-3 transition-colors hover:border-primary/30 hover:bg-muted/20"
                    >
                      <TemplatePreviewCard
                        slide={previewSlide}
                        logicalSize={{ width: PRESENTATION_SLIDE_WIDTH, height: PRESENTATION_SLIDE_HEIGHT }}
                        title={template.title}
                        description={template.description}
                        badge={template.category}
                        style={template.style}
                        slideCount={template.build().length}
                        accentGradient={template.preview.gradient}
                        accentColor={template.preview.accent}
                        onClick={() => void handleUseSlideTemplate(template.id)}
                      />
                    </div>
                  )
                })}
              </div>
            </section>
            <section>
              <h2 className="mb-3 text-sm font-semibold">Classic card templates</h2>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {PRESENTATION_TEMPLATES.map((template) => {
              const theme = getPresentationTheme(template.themeId)
              return (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => void handleUseTemplate(template.id)}
                  className="rounded-xl border border-border/80 bg-card p-4 text-left transition-colors hover:border-foreground/20 hover:bg-muted/20"
                >
                  <div
                    className="mb-3 flex h-20 overflow-hidden rounded-lg border"
                    style={{ borderColor: theme.colors.border, background: theme.colors.background }}
                  >
                    <div className="w-1/3" style={{ background: theme.colors.accent }} />
                    <div className="flex flex-1 flex-col justify-center gap-1.5 px-3">
                      <div
                        className="h-2 w-2/3 rounded"
                        style={{ background: theme.colors.text, opacity: 0.35 }}
                      />
                      <div
                        className="h-2 w-1/2 rounded"
                        style={{ background: theme.colors.muted, opacity: 0.5 }}
                      />
                    </div>
                  </div>
                  <h2 className="text-sm font-semibold">{template.title}</h2>
                  <p className="mt-1 text-[11px] text-muted-foreground">{template.description}</p>
                  <p className="mt-2 text-[10px] text-muted-foreground">{theme.name} theme</p>
                </button>
              )
            })}
              </div>
            </section>
          </div>
        ) : isLoading ? (
          <div className="flex h-40 items-center justify-center">
            <Spinner size="lg" />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Presentation className="h-5 w-5" />}
            title={search ? 'No matching presentations' : 'No presentations yet'}
            description={
              search
                ? 'Try a different search term.'
                : 'Create a blank deck or generate one from a prompt and project documents.'
            }
            action={
              !search ? (
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setGenerateOpen(true)}>
                    <Sparkles className="h-3.5 w-3.5" />
                    Generate with AI
                  </Button>
                  <Button size="sm" onClick={() => void handleCreateBlank()}>
                    <Plus className="h-3.5 w-3.5" />
                    Blank deck
                  </Button>
                </div>
              ) : undefined
            }
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((presentation) => {
              const theme = getPresentationTheme(presentation.themeId)
              const versionedDocument = parsePresentationDocument(presentation.documentJson)
              const cardCount = versionedDocument?.slides.length ?? parseCards(presentation.cards).length
              return (
                <button
                  key={presentation.id}
                  type="button"
                  onClick={() => openPresentation(presentation.id)}
                  className="group relative rounded-xl border border-border/80 bg-card p-4 text-left transition-colors hover:border-foreground/20 hover:bg-muted/20"
                >
                  <DeckThumbnail documentJson={presentation.documentJson} theme={theme} />
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        {presentation.isPinned && (
                          <Pin className="h-3 w-3 shrink-0 text-amber-500" />
                        )}
                        <h2 className="truncate text-sm font-semibold">{presentation.title}</h2>
                      </div>
                      <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">
                        {presentation.description || `${cardCount} slides · ${theme.name}`}
                      </p>
                      <p className="mt-2 text-[10px] text-muted-foreground">
                        Updated {formatRelativeTime(presentation.updatedAt)}
                      </p>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <span
                          role="button"
                          tabIndex={0}
                          className={cn(
                            'inline-flex h-7 w-7 items-center justify-center rounded-md opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100'
                          )}
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => e.stopPropagation()}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </span>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenuItem onSelect={() => togglePin(presentation)}>
                          <Pin className="h-3.5 w-3.5" />
                          {presentation.isPinned ? 'Unpin' : 'Pin'}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() => void duplicatePresentation(presentation.id)}
                        >
                          <Copy className="h-3.5 w-3.5" />
                          Duplicate
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive"
                          onSelect={() => setPendingDelete(presentation)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </PageContent>

      <ConfirmDialog
        open={pendingDelete != null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null)
        }}
        title="Delete presentation?"
        description={`“${pendingDelete?.title ?? ''}” will be moved to trash.`}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => {
          if (pendingDelete) void deletePresentation(pendingDelete.id)
          setPendingDelete(null)
        }}
      />

      <GenerateWizard
        open={generateOpen}
        onOpenChange={setGenerateOpen}
        projectId={projectId}
        documents={documents}
        onCreated={(id) => openPresentation(id)}
      />
    </ModulePage>
  )
}

function DeckThumbnail({ documentJson, theme }: { documentJson: string; theme: ReturnType<typeof getPresentationTheme> }) {
  const document = parsePresentationDocument(documentJson)
  const slide = document?.slides.find((item) => !item.hidden)
  if (document && slide) {
    const scale = 0.15
    return <div className="mb-3 h-24 overflow-hidden rounded-lg border bg-white" style={{ borderColor: theme.colors.border }}><div style={{ width: document.logicalSize.width, height: document.logicalSize.height, transform: `scale(${scale})`, transformOrigin: 'top left' }}><SlideRenderer slide={slide} logicalSize={document.logicalSize} /></div></div>
  }
  return <div className="mb-3 flex h-24 overflow-hidden rounded-lg border" style={{ borderColor: theme.colors.border, background: theme.colors.background }}><div className="w-1/3" style={{ background: theme.colors.accent }} /><div className="flex flex-1 flex-col justify-center gap-1.5 px-3"><div className="h-2 w-3/4 rounded" style={{ background: theme.colors.text, opacity: 0.35 }} /><div className="h-2 w-1/2 rounded" style={{ background: theme.colors.muted, opacity: 0.5 }} /></div></div>
}
