import { useState } from 'react'
import { Sparkles, LayoutTemplate, BookMarked, ArrowRight, Trash2, Plus } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button } from '@/shared/components/ui/button'
import { Badge } from '@/shared/components/ui/badge'
import { FadeIn } from '@/shared/components/motion/PageTransition'
import { DOCUMENT_TEMPLATES } from '@/features/documents/templates/document-templates'
import { loadSavedTemplates, deleteSavedTemplate } from '@/features/documents/templates/saved-templates'
import { CreateDocumentDialog } from '@/features/documents/components/CreateDocumentDialog'
import { useDocumentStore } from '@/features/documents/stores/document.store'
import { useProjectStore } from '@/shared/stores/project.store'
import { PageHeader, PageContent } from '@/shared/components/layout/PageHeader'
import { toast } from 'sonner'
import type { DocumentStyle, DocumentType } from '@shared/types'

export function TemplatesPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const { currentProject } = useProjectStore()
  const { createDocument, generateRequirement } = useDocumentStore()
  const [saved, setSaved] = useState(() => loadSavedTemplates())
  const [createOpen, setCreateOpen] = useState(false)
  const [initialType, setInitialType] = useState<DocumentType | undefined>()
  const [initialSavedTemplateId, setInitialSavedTemplateId] = useState<string | undefined>()
  const [creating, setCreating] = useState(false)

  const refreshSaved = () => setSaved(loadSavedTemplates())

  const handleCreate = async (input: {
    title: string
    type: DocumentType
    style: DocumentStyle
    htmlContent: string
  }): Promise<{ success: boolean; error?: string }> => {
    if (!projectId) return { success: false, error: 'Project not found' }
    setCreating(true)
    try {
      const doc = await createDocument(projectId, input)
      if (doc) {
        setCreateOpen(false)
        toast.success('Document created from template')
        navigate(`/project/${projectId}/editor/${doc.id}`)
        return { success: true }
      }
      const error = 'Could not create document'
      toast.error(error)
      return { success: false, error }
    } catch (e) {
      const error = e instanceof Error ? e.message : 'Could not create document'
      toast.error(error)
      return { success: false, error }
    } finally {
      setCreating(false)
    }
  }

  const handleGenerate = async (input: {
    title: string
    type: DocumentType
    style: DocumentStyle
    prompt: string
  }): Promise<{ success: boolean; error?: string }> => {
    if (!projectId) return { success: false, error: 'Project not found' }
    setCreating(true)
    try {
      const { document: doc, error } = await generateRequirement(
        projectId,
        input.type,
        input.style,
        input.prompt,
        { title: input.title }
      )
      if (doc) {
        setCreateOpen(false)
        toast.success('Document generated')
        navigate(`/project/${projectId}/editor/${doc.id}`, { replace: true })
        return { success: true }
      }
      const message = error ?? 'Generation failed'
      toast.error(message)
      return { success: false, error: message }
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Generation failed'
      toast.error(message)
      return { success: false, error: message }
    } finally {
      setCreating(false)
    }
  }

  const openTemplate = (type: DocumentType) => {
    setInitialSavedTemplateId(undefined)
    setInitialType(type)
    setCreateOpen(true)
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <PageHeader
        title="Templates"
        description="Predefined and saved document templates for requirements, specs, and more"
        actions={
          <Button size="sm" onClick={() => navigate(`/project/${projectId}/generate`)}>
            <Sparkles className="h-4 w-4" /> AI Generate
          </Button>
        }
      />
      <PageContent>
        <FadeIn>
          <section className="mb-10">
            <h2 className="mb-1 text-sm font-semibold">Predefined templates</h2>
            <p className="mb-4 text-sm text-muted-foreground">
              Professional structures for every stage of your requirements workflow
            </p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {DOCUMENT_TEMPLATES.map((t) => (
                <div
                  key={t.type}
                  className="group flex flex-col rounded-xl border border-border bg-card p-5 shadow-sm transition-all hover:border-primary/30 hover:shadow-md"
                >
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                    <LayoutTemplate className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="font-semibold">{t.label}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">{t.description}</p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <Badge variant="secondary" className="text-[10px]">
                      {t.category}
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">
                      ~{t.estimatedPages} pages
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">
                      {t.complexity}
                    </Badge>
                  </div>
                  <ul className="mt-3 flex-1 space-y-0.5">
                    {t.sections.slice(0, 4).map((s) => (
                      <li key={s} className="text-[11px] text-muted-foreground">
                        · {s}
                      </li>
                    ))}
                  </ul>
                  <Button
                    className="mt-4 w-full"
                    size="sm"
                    variant="outline"
                    onClick={() => openTemplate(t.type)}
                  >
                    <Plus className="h-4 w-4" /> Use template
                  </Button>
                </div>
              ))}
            </div>
          </section>

          <section>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold">Saved templates</h2>
                <p className="text-sm text-muted-foreground">Custom templates saved from your documents</p>
              </div>
            </div>
            {saved.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-10 text-center">
                <BookMarked className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
                <p className="text-sm font-medium">No saved templates yet</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Open a document in the editor and use &quot;Save as template&quot; to create one.
                </p>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {saved.map((t) => (
                  <div
                    key={t.id}
                    className="flex flex-col rounded-xl border border-border bg-card p-5 shadow-sm"
                  >
                    <div className="mb-3 flex items-start justify-between">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10">
                        <BookMarked className="h-5 w-5 text-amber-600" />
                      </div>
                      <button
                        type="button"
                        className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
                        onClick={() => {
                          deleteSavedTemplate(t.id)
                          refreshSaved()
                          toast.success('Template deleted')
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <h3 className="font-semibold">{t.name}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">{t.description}</p>
                    <Button
                      className="mt-4 w-full"
                      size="sm"
                      onClick={() => {
                        setInitialType(t.type)
                        setInitialSavedTemplateId(t.id)
                        setCreateOpen(true)
                      }}
                    >
                      Use template <ArrowRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </FadeIn>
      </PageContent>

      <CreateDocumentDialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open)
          if (!open) {
            setInitialType(undefined)
            setInitialSavedTemplateId(undefined)
          }
        }}
        projectName={currentProject?.name ?? 'Project'}
        projectDescription={currentProject?.description}
        projectStyle={currentProject?.style}
        initialType={initialType}
        initialSavedTemplateId={initialSavedTemplateId}
        onCreate={handleCreate}
        onGenerate={handleGenerate}
        creating={creating}
      />
    </div>
  )
}
