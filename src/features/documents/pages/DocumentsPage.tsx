import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  Plus,
  Pin,
  Copy,
  Trash2,
  FileOutput,
  MoreHorizontal,
  Sparkles,
  Eye,
  Pencil,
  Search,
  RefreshCw,
  AlertTriangle,
  X,
  Files,
  LayoutTemplate,
  FileUp,
  FolderOpen,
  Zap,
  CheckSquare,
  Square,
  GitBranch
} from 'lucide-react'
import { toast } from 'sonner'
import { useDocumentStore } from '@/features/documents/stores/document.store'
import { useProjectStore } from '@/shared/stores/project.store'
import { useKnowledgeStore } from '@/features/knowledge/stores/knowledge.store'
import { useSettingsStore } from '@/shared/stores/settings.store'
import { CreateDocumentDialog } from '@/features/documents/components/CreateDocumentDialog'
import { DocumentViewDialog } from '@/features/documents/components/DocumentViewDialog'
import { DocumentHtmlPreview } from '@/features/documents/components/DocumentHtmlPreview'
import { TemplateLibrary } from '@/features/documents/components/TemplateLibrary'
import { QuickGenerateDialog } from '@/features/documents/components/QuickGenerateDialog'
import { ImportDocumentDialog } from '@/features/documents/components/ImportDocumentDialog'
import { LifecycleWorkspace } from '@/features/documents/components/LifecycleWorkspace'
import { DocumentWorkflowModeSwitch } from '@/features/documents/components/DocumentWorkflowModeSwitch'
import { ExportDialog } from '@/features/export/components/ExportDialog'
import { DocumentDiffDialog } from '@/features/editor/components/DocumentDiffDialog'
import { ConfirmDialog } from '@/shared/components/ui/confirm-dialog'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { SkeletonCard } from '@/shared/components/ui/skeleton'
import { Badge } from '@/shared/components/ui/badge'
import { ViewToggle, type ViewMode } from '@/shared/components/ui/view-toggle'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/components/ui/tabs'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/shared/components/ui/dropdown-menu'
import { ModulePage, PageContent, PageHeader } from '@/shared/components/layout/ModulePage'
import { stripHtmlToText } from '@/shared/lib/html-utils'
import { DOCUMENT_TYPE_LABELS, formatRelativeTime, cn } from '@/shared/lib/utils'
import { resolveDocumentPadding } from '@shared/lib/document-theme'
import {
  DOCUMENT_STATUSES,
  DOCUMENT_STATUS_LABELS,
  DOCUMENT_STATUS_STYLES,
  buildSyncUpdateInstruction
} from '@/features/documents/lib/document-meta'
import { exportClientSide } from '@/features/export/lib/client-export'
import type {
  Document,
  DocumentStatus,
  DocumentStyle,
  DocumentSyncSuggestion,
  DocumentType
} from '@shared/types'

export function DocumentsPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab =
    searchParams.get('tab') === 'templates'
      ? 'templates'
      : searchParams.get('tab') === 'lifecycle'
        ? 'lifecycle'
        : 'documents'
  const { currentProject } = useProjectStore()
  const { settings, updateSettings } = useSettingsStore()
  const isExpertWorkflow = settings?.documentWorkflowMode === 'expert'
  const pageTab = !isExpertWorkflow && activeTab === 'lifecycle' ? 'documents' : activeTab
  const { bundle, loadKnowledge } = useKnowledgeStore()
  const {
    documents,
    isLoading,
    isGenerating,
    loadDocuments,
    createDocument,
    generateRequirement,
    deleteDocument,
    duplicateDocument,
    updateDocument,
    syncSuggestions,
    isLoadingSyncSuggestions,
    loadSyncSuggestions,
    proposeAIEdit,
    applyDocumentEdit,
    markReviewed
  } = useDocumentStore()
  const [view, setView] = useState<ViewMode>('grid')
  const [createOpen, setCreateOpen] = useState(false)
  const [quickOpen, setQuickOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [exportDoc, setExportDoc] = useState<Document | null>(null)
  const [viewDoc, setViewDoc] = useState<Document | null>(null)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<DocumentType | 'all'>('all')
  const [statusFilter, setStatusFilter] = useState<DocumentStatus | 'all'>('all')
  const [sortBy, setSortBy] = useState<'updated' | 'title' | 'type' | 'status'>('updated')
  const [pinOnly, setPinOnly] = useState(false)
  const [initialTemplate, setInitialTemplate] = useState<DocumentType | undefined>()
  const [initialSavedTemplateId, setInitialSavedTemplateId] = useState<string | undefined>()
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [deleteTarget, setDeleteTarget] = useState<Document | 'bulk' | null>(null)
  const [syncUpdatingId, setSyncUpdatingId] = useState<string | null>(null)
  const [syncDiff, setSyncDiff] = useState<{
    documentId: string
    originalHtml: string
    editedHtml: string
  } | null>(null)
  const [applyingSync, setApplyingSync] = useState(false)
  const [savingWord, setSavingWord] = useState(false)
  const wordFolder = settings?.exportFolderPath?.trim() || ''

  useEffect(() => {
    if (projectId) loadDocuments(projectId)
  }, [projectId, loadDocuments])

  useEffect(() => {
    if (projectId) void loadKnowledge(projectId)
  }, [projectId, loadKnowledge])

  useEffect(() => {
    if (projectId) void loadSyncSuggestions(projectId)
  }, [projectId, loadSyncSuggestions])

  const handleCreate = async (input: {
    title: string
    type: DocumentType
    style: DocumentStyle
    htmlContent: string
    sourceFilePath?: string
  }): Promise<{ success: boolean; error?: string }> => {
    if (!projectId) return { success: false, error: 'Project not found' }
    setCreating(true)
    try {
      const doc = await createDocument(projectId, input)
      if (doc) {
        if (input.sourceFilePath) {
          await updateDocument(doc.id, { exportedFilePath: input.sourceFilePath })
          doc.exportedFilePath = input.sourceFilePath
        }
        setCreateOpen(false)
        toast.success(
          input.sourceFilePath
            ? 'Document imported. Original file preserved for exact layout and charts.'
            : doc.exportedFilePath
              ? `Document created. Word file: ${doc.exportedFilePath}`
              : 'Document created'
        )
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
    documentLength?: 'concise' | 'standard' | 'detailed' | 'comprehensive' | 'custom'
    customWordCount?: number
    wordTarget?: number
    maxTokens?: number
  }): Promise<{ success: boolean; error?: string }> => {
    if (!projectId) return { success: false, error: 'Project not found' }
    setCreating(true)
    try {
      const { document: doc, error } = await generateRequirement(
        projectId,
        input.type,
        input.style,
        input.prompt,
        {
          title: input.title,
          documentLength: input.documentLength,
          customWordCount: input.customWordCount,
          wordTarget: input.wordTarget,
          maxTokens: input.maxTokens
        }
      )
      if (doc) {
        setCreateOpen(false)
        setQuickOpen(false)
        toast.success(
          doc.exportedFilePath ? `Generated. Word file: ${doc.exportedFilePath}` : 'Document generated'
        )
        navigate(`/project/${projectId}/editor/${doc.id}`, { replace: true })
        return { success: true }
      }
      const message = error ?? 'Generation failed. Check your API key in Settings.'
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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = documents.filter((d) => {
      if (pinOnly && !d.isPinned) return false
      if (typeFilter !== 'all' && d.type !== typeFilter) return false
      if (statusFilter !== 'all' && d.status !== statusFilter) return false
      if (!q) return true
      const preview = stripHtmlToText(d.htmlContent || d.content || '', 500).toLowerCase()
      const tags = (d.tags ?? []).join(' ').toLowerCase()
      return d.title.toLowerCase().includes(q) || preview.includes(q) || tags.includes(q)
    })
    return [...list].sort((a, b) => {
      if (sortBy === 'title') return a.title.localeCompare(b.title)
      if (sortBy === 'type') return a.type.localeCompare(b.type)
      if (sortBy === 'status') return (a.status ?? 'draft').localeCompare(b.status ?? 'draft')
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    })
  }, [documents, search, typeFilter, statusFilter, sortBy, pinOnly])

  const pinned = filtered.filter((d) => d.isPinned)
  const rest = filtered.filter((d) => !d.isPinned)
  const hasActiveFilters = Boolean(search.trim()) || typeFilter !== 'all' || statusFilter !== 'all' || pinOnly

  const openCreate = (type?: DocumentType) => {
    setInitialSavedTemplateId(undefined)
    setInitialTemplate(type)
    setCreateOpen(true)
  }

  const openSavedTemplate = (id: string, type: DocumentType) => {
    setInitialTemplate(type)
    setInitialSavedTemplateId(id)
    setCreateOpen(true)
  }

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    if (deleteTarget === 'bulk') {
      await Promise.all([...selectedIds].map((id) => deleteDocument(id)))
      setSelectedIds(new Set())
      toast.success('Documents deleted')
    } else {
      await deleteDocument(deleteTarget.id)
      toast.success('Deleted')
    }
    setDeleteTarget(null)
  }

  const handleBulkStatus = async (status: DocumentStatus) => {
    await Promise.all([...selectedIds].map((id) => updateDocument(id, { status })))
    toast.success(`Marked as ${DOCUMENT_STATUS_LABELS[status].toLowerCase()}`)
    setSelectedIds(new Set())
  }

  const handleBulkDuplicate = async () => {
    await Promise.all([...selectedIds].map((id) => duplicateDocument(id)))
    toast.success(`Duplicated ${selectedIds.size} document${selectedIds.size === 1 ? '' : 's'}`)
    setSelectedIds(new Set())
  }

  const handleBulkExportMarkdown = () => {
    const selected = documents.filter((d) => selectedIds.has(d.id))
    selected.forEach((doc) => {
      exportClientSide('markdown', {
        id: doc.id,
        title: doc.title,
        type: doc.type,
        style: doc.style,
        pageTheme: doc.pageTheme,
        htmlContent: doc.htmlContent || doc.content,
        content: doc.content,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt
      })
    })
    toast.success(`Exported ${selected.length} Markdown file${selected.length === 1 ? '' : 's'}`)
  }

  const chooseWordFolder = async (): Promise<string> => {
    const result = await window.electronAPI.export.selectFolder()
    if (!result.success || !result.data) return ''
    await updateSettings({ exportFolderPath: result.data })
    toast.success('Word documents will be saved in this folder')
    return result.data
  }

  const saveDocsAsWord = async (ids: string[]) => {
    let folder = wordFolder
    if (!folder) folder = await chooseWordFolder()
    if (!folder || ids.length === 0) return
    setSavingWord(true)
    try {
      let saved = 0
      for (const id of ids) {
        const result = await window.electronAPI.documents.saveWord({ documentId: id, folderPath: folder })
        if (result.success) saved += 1
        else toast.error(result.error ?? 'Could not save Word file')
      }
      if (projectId) await loadDocuments(projectId)
      if (saved > 0) toast.success(`Saved ${saved} Word file${saved === 1 ? '' : 's'} to the folder`)
    } finally {
      setSavingWord(false)
    }
  }

  const handleUpdateFromKnowledge = async (suggestion: DocumentSyncSuggestion) => {
    const doc = documents.find((d) => d.id === suggestion.documentId)
    if (!doc) return
    setSyncUpdatingId(doc.id)
    try {
      const html = await proposeAIEdit(buildSyncUpdateInstruction(suggestion), doc.htmlContent || doc.content, {
        title: doc.title,
        style: doc.style,
        type: doc.type
      })
      if (!html) {
        toast.error('Could not update from knowledge. Check your API key.')
        return
      }
      setSyncDiff({ documentId: doc.id, originalHtml: doc.htmlContent || doc.content, editedHtml: html })
    } finally {
      setSyncUpdatingId(null)
    }
  }

  const acceptSyncDiff = async () => {
    if (!syncDiff) return
    setApplyingSync(true)
    try {
      await applyDocumentEdit(syncDiff.documentId, syncDiff.editedHtml)
      await markReviewed(syncDiff.documentId)
      if (projectId) void loadSyncSuggestions(projectId)
      toast.success('Document updated from knowledge')
      setSyncDiff(null)
    } finally {
      setApplyingSync(false)
    }
  }

  return (
    <ModulePage className="documents-compact">
      <PageHeader
        title="Documents"
        description={
          currentProject?.name
            ? `${currentProject.name} · ${documents.length} in this project`
            : 'Create, refine, and deliver project documentation.'
        }
        fluid
        actions={
          <>
            <DocumentWorkflowModeSwitch />
            <Button variant="ghost" size="sm" className="h-7 gap-1.5 rounded-lg px-2.5 text-xs" onClick={() => setImportOpen(true)}>
              <FileUp className="h-3.5 w-3.5" /> Import PDF / Word
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 rounded-lg px-2.5 text-xs"
              onClick={() => navigate(`/project/${projectId}/generate`)}
            >
              <Sparkles className="h-3.5 w-3.5" /> Generate with AI
            </Button>
            <Button size="sm" className="h-7 gap-1.5 rounded-lg px-2.5 text-xs shadow-sm" onClick={() => openCreate()}>
              <Plus className="h-3.5 w-3.5" /> New document
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" aria-label="More document actions">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem onClick={() => setQuickOpen(true)}><Zap className="h-4 w-4" /> Quick generate</DropdownMenuItem>
                <DropdownMenuItem onClick={() => void chooseWordFolder()}><FolderOpen className="h-4 w-4" /> Word export folder</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      <PageContent fluid>
        <Tabs
          value={pageTab}
          onValueChange={(value) => {
            const next = new URLSearchParams(searchParams)
            if (value === 'documents') next.delete('tab')
            else next.set('tab', value)
            setSearchParams(next, { replace: true })
          }}
          className="space-y-2"
        >
          <div className="flex min-w-0 flex-wrap items-center gap-2 lg:flex-nowrap">
            <TabsList className="h-7 shrink-0 rounded-lg border border-border/60 bg-muted/30 p-0.5">
              <TabsTrigger value="documents" className="h-6 rounded-md px-2.5 text-[11px]">
                <Files className="h-3 w-3" /> Documents
                <span className="rounded-full bg-muted px-1.5 text-[9px]">{documents.length}</span>
              </TabsTrigger>
              {isExpertWorkflow ? (
                <TabsTrigger value="lifecycle" className="h-6 rounded-md px-2.5 text-[11px]">
                  <GitBranch className="h-3 w-3" /> Lifecycle
                </TabsTrigger>
              ) : null}
              <TabsTrigger value="templates" className="h-6 rounded-md px-2.5 text-[11px]">
                <LayoutTemplate className="h-3 w-3" /> Templates
              </TabsTrigger>
            </TabsList>

            {pageTab === 'documents' && (
              <div className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded-lg border border-border/60 bg-muted/15 px-2.5 py-0.5">
                <p className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
                  {wordFolder ? `Word folder: ${wordFolder}` : 'Choose a folder to save generated Word documents.'}
                </p>
                <div className="flex shrink-0 items-center gap-1">
                  {wordFolder ? (
                    <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px]" onClick={() => void window.electronAPI.export.revealPath(wordFolder)}>
                      Open
                    </Button>
                  ) : null}
                  <Button variant="outline" size="sm" className="h-6 px-2 text-[10px]" onClick={() => void chooseWordFolder()}>
                    {wordFolder ? 'Change' : 'Choose folder'}
                  </Button>
                  <Button variant="outline" size="sm" className="h-6 px-2 text-[10px]" disabled={savingWord || documents.length === 0} onClick={() => void saveDocsAsWord(documents.map((d) => d.id))}>
                    Save all as Word
                  </Button>
                </div>
              </div>
            )}
          </div>

          <TabsContent value="lifecycle" className="mt-0">
            <LifecycleWorkspace
              projectId={projectId ?? ''}
              projectName={currentProject?.name ?? 'Project'}
              projectStyle={currentProject?.style}
              documents={documents}
              bundle={bundle}
              onOpenDocument={(doc) => setViewDoc(doc)}
            />
          </TabsContent>

          <TabsContent value="documents" className="mt-0 space-y-2">
            {syncSuggestions.length > 0 && (
              <SyncSuggestionsBanner
                suggestions={syncSuggestions}
                loading={isLoadingSyncSuggestions}
                updatingId={syncUpdatingId}
                onReview={(s) => navigate(`/project/${projectId}/editor/${s.documentId}`)}
                onUpdate={(s) => void handleUpdateFromKnowledge(s)}
                onDismiss={(id) => void markReviewed(id)}
              />
            )}

            {isLoading ? (
      <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
                {[1, 2, 3].map((i) => (
                  <SkeletonCard key={i} />
                ))}
              </div>
            ) : documents.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 px-6 py-14 text-center">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Files className="h-5 w-5" />
                </span>
                <h3 className="mt-3 text-sm font-semibold">No documents yet</h3>
                <p className="mt-1 max-w-sm text-xs text-muted-foreground">
                  Create a blank document, import a PDF or Word file, generate from knowledge, or start from a
                  template.
                </p>
                <div className="mt-4 flex flex-wrap items-center justify-center gap-1.5">
                  <Button size="sm" onClick={() => openCreate()}>
                    <Plus className="h-3.5 w-3.5" /> New document
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>
                    <FileUp className="h-3.5 w-3.5" /> Open PDF / Word
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => navigate(`/project/${projectId}/generate`)}
                  >
                    <Sparkles className="h-3.5 w-3.5" /> Generate
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const next = new URLSearchParams(searchParams)
                      next.set('tab', 'templates')
                      setSearchParams(next, { replace: true })
                    }}
                  >
                    <LayoutTemplate className="h-3.5 w-3.5" /> Templates
                  </Button>
                </div>
              </div>
            ) : (
              <>
            {selectedIds.size > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-border bg-muted/30 px-2 py-1.5">
                <span className="text-[11px] font-medium">{selectedIds.size} selected</span>
                {DOCUMENT_STATUSES.map((status) => (
                  <Button
                    key={status}
                    variant="outline"
                    size="sm"
                    className="h-6 px-2 text-[10px]"
                    onClick={() => void handleBulkStatus(status)}
                  >
                    {DOCUMENT_STATUS_LABELS[status]}
                  </Button>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 px-2 text-[10px]"
                  onClick={() => void handleBulkDuplicate()}
                >
                  <Copy className="h-3 w-3" /> Duplicate
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 px-2 text-[10px]"
                  onClick={handleBulkExportMarkdown}
                >
                  <FileOutput className="h-3 w-3" /> Markdown
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 px-2 text-[10px]"
                  disabled={savingWord}
                  onClick={() => void saveDocsAsWord([...selectedIds])}
                >
                  <FileOutput className="h-3 w-3" /> Word
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 px-2 text-[10px] text-destructive"
                  onClick={() => setDeleteTarget('bulk')}
                >
                  <Trash2 className="h-3 w-3" /> Delete
                </Button>
                <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px]" onClick={() => setSelectedIds(new Set())}>
                  Clear
                </Button>
              </div>
            )}

            <div className="flex flex-col gap-2 rounded-xl border border-border/60 bg-card/50 p-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                <div className="relative min-w-[220px] flex-1">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search documents..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="h-8 rounded-lg border-border/70 bg-background pl-8 text-xs shadow-none"
                  />
                </div>
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value as DocumentType | 'all')}
                  aria-label="Filter by document type"
                  className="h-8 rounded-lg border border-input bg-background px-2 text-[11px] outline-none focus:ring-2 focus:ring-ring/30"
                >
                  <option value="all">All types</option>
                  {Object.entries(DOCUMENT_TYPE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as DocumentStatus | 'all')}
                  aria-label="Filter by document status"
                  className="h-8 rounded-lg border border-input bg-background px-2 text-[11px] outline-none focus:ring-2 focus:ring-ring/30"
                >
                  <option value="all">All status</option>
                  {DOCUMENT_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {DOCUMENT_STATUS_LABELS[status]}
                    </option>
                  ))}
                </select>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                  aria-label="Sort documents"
                  className="h-8 rounded-lg border border-input bg-background px-2 text-[11px] outline-none focus:ring-2 focus:ring-ring/30"
                >
                  <option value="updated">Recently updated</option>
                  <option value="title">Title</option>
                  <option value="type">Type</option>
                  <option value="status">Status</option>
                </select>
                <Button
                  variant={pinOnly ? 'secondary' : 'ghost'}
                  size="sm"
                  className="h-8 rounded-lg px-2.5 text-[11px]"
                  onClick={() => setPinOnly((v) => !v)}
                >
                  <Pin className="h-3 w-3" /> Pinned
                </Button>
                {hasActiveFilters && (
                  <Button variant="ghost" size="sm" className="h-8 rounded-lg px-2 text-[11px] text-muted-foreground" onClick={() => { setSearch(''); setTypeFilter('all'); setStatusFilter('all'); setPinOnly(false) }}>
                    <X className="h-3 w-3" /> Clear filters
                  </Button>
                )}
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="hidden items-center gap-1 text-[11px] text-muted-foreground sm:flex">
                  <Files className="h-3 w-3" />
                  {filtered.length}
                </span>
                <ViewToggle value={view} onChange={setView} />
              </div>
            </div>

            {filtered.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">No documents match your search.</div>
            ) : (
              <div className="space-y-3">
                {pinned.length > 0 && (
                  <section>
                    <h2 className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      <Pin className="h-3 w-3" /> Pinned
                    </h2>
                    <DocumentGrid
                      docs={pinned}
                      view={view}
                      projectId={projectId!}
                      selectedIds={selectedIds}
                      onToggleSelect={toggleSelected}
                      onView={setViewDoc}
                      onExport={setExportDoc}
                      onSaveWord={(doc) => void saveDocsAsWord([doc.id])}
                      onRevealWord={(doc) => {
                        if (doc.exportedFilePath) void window.electronAPI.export.revealPath(doc.exportedFilePath)
                      }}
                      onDelete={(doc) => setDeleteTarget(doc)}
                      onTogglePin={updateDocument}
                      onStatusChange={(id, status) => void updateDocument(id, { status })}
                      duplicateDocument={async (id) => {
                        await duplicateDocument(id)
                        toast.success('Duplicated')
                      }}
                      navigate={navigate}
                    />
                  </section>
                )}
                {rest.length > 0 && (
                  <section>
                    {pinned.length > 0 && (
                      <h2 className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                        All documents
                      </h2>
                    )}
                    <DocumentGrid
                      docs={rest}
                      view={view}
                      projectId={projectId!}
                      selectedIds={selectedIds}
                      onToggleSelect={toggleSelected}
                      onView={setViewDoc}
                      onExport={setExportDoc}
                      onSaveWord={(doc) => void saveDocsAsWord([doc.id])}
                      onRevealWord={(doc) => {
                        if (doc.exportedFilePath) void window.electronAPI.export.revealPath(doc.exportedFilePath)
                      }}
                      onDelete={(doc) => setDeleteTarget(doc)}
                      onTogglePin={updateDocument}
                      onStatusChange={(id, status) => void updateDocument(id, { status })}
                      duplicateDocument={async (id) => {
                        await duplicateDocument(id)
                        toast.success('Duplicated')
                      }}
                      navigate={navigate}
                    />
                  </section>
                )}
              </div>
            )}
              </>
            )}
          </TabsContent>

          <TabsContent value="templates" className="mt-0">
            <TemplateLibrary onUseBuiltIn={openCreate} onUseSaved={openSavedTemplate} />
          </TabsContent>
        </Tabs>
      </PageContent>

      <CreateDocumentDialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open)
          if (!open) {
            setInitialTemplate(undefined)
            setInitialSavedTemplateId(undefined)
          }
        }}
        projectName={currentProject?.name ?? 'Project'}
        projectDescription={currentProject?.description}
        projectStyle={currentProject?.style}
        initialType={initialTemplate}
        initialSavedTemplateId={initialSavedTemplateId}
        onCreate={handleCreate}
        onGenerate={handleGenerate}
        creating={creating}
      />

      <QuickGenerateDialog
        open={quickOpen}
        onOpenChange={setQuickOpen}
        projectName={currentProject?.name ?? 'Project'}
        projectDescription={currentProject?.description}
        projectStyle={currentProject?.style}
        generating={creating || isGenerating}
        onGenerate={async (input) => {
          await handleGenerate(input)
        }}
      />

      <ImportDocumentDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        creating={creating}
        onImport={handleCreate}
      />

      <DocumentViewDialog
        open={!!viewDoc}
        onOpenChange={(open) => !open && setViewDoc(null)}
        document={viewDoc}
        projectName={currentProject?.name}
        onEdit={() => {
          if (viewDoc && projectId) {
            setViewDoc(null)
            navigate(`/project/${projectId}/editor/${viewDoc.id}`)
          }
        }}
        onSavedLocal={async () => {
          if (projectId) await loadDocuments(projectId)
        }}
        onOpenLocalFile={async (source) => {
          if (!projectId) return null
          const created = await createDocument(projectId, {
            title: source.title,
            type: 'requirements',
            style: 'professional',
            htmlContent: source.html
          })
          if (created) {
            setViewDoc(created)
            await loadDocuments(projectId)
          }
          return created
        }}
      />

      <ExportDialog
        open={!!exportDoc}
        onOpenChange={(open) => !open && setExportDoc(null)}
        document={
          exportDoc
            ? {
                id: exportDoc.id,
                title: exportDoc.title,
                type: exportDoc.type,
                htmlContent: exportDoc.htmlContent,
                content: exportDoc.content,
                style: exportDoc.style
              }
            : null
        }
        projectName={currentProject?.name ?? 'Project'}
        companyName={currentProject?.companyName}
        companyLogo={currentProject?.companyLogo}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={deleteTarget === 'bulk' ? `Delete ${selectedIds.size} documents?` : 'Delete this document?'}
        description="This cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => void confirmDelete()}
      />

      <DocumentDiffDialog
        open={!!syncDiff}
        onOpenChange={(open) => !open && setSyncDiff(null)}
        originalHtml={syncDiff?.originalHtml ?? ''}
        editedHtml={syncDiff?.editedHtml ?? ''}
        title="Update from knowledge"
        description="Review the AI update before applying it to the document."
        isApplying={applyingSync}
        onAccept={() => void acceptSyncDiff()}
        onDiscard={() => setSyncDiff(null)}
      />
    </ModulePage>
  )
}

const SEVERITY_STYLES: Record<DocumentSyncSuggestion['severity'], string> = {
  high: 'border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400',
  medium: 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400',
  low: 'border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400'
}

function SyncSuggestionsBanner({
  suggestions,
  loading,
  updatingId,
  onReview,
  onUpdate,
  onDismiss
}: {
  suggestions: DocumentSyncSuggestion[]
  loading: boolean
  updatingId: string | null
  onReview: (s: DocumentSyncSuggestion) => void
  onUpdate: (s: DocumentSyncSuggestion) => void
  onDismiss: (documentId: string) => void
}) {
  return (
    <section className="rounded-md border border-amber-500/30 bg-amber-500/5 px-2 py-1.5">
      <div className="mb-1 flex items-center gap-1.5">
        <RefreshCw className={cn('h-3 w-3 text-amber-600 dark:text-amber-400', loading && 'animate-spin')} />
        <h2 className="text-[11px] font-medium text-amber-700 dark:text-amber-400">
          Out of sync with knowledge ({suggestions.length})
        </h2>
      </div>
      <div className="space-y-1">
        {suggestions.map((s) => (
          <div
            key={s.documentId}
            className="flex items-start gap-2 rounded-md border border-border/60 bg-card px-2 py-1.5"
          >
            <AlertTriangle className={cn('mt-0.5 h-3.5 w-3.5 shrink-0', SEVERITY_STYLES[s.severity].split(' ')[2])} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <p className="truncate text-xs font-medium">{s.documentTitle}</p>
                <Badge variant="outline" className={cn('text-[9px]', SEVERITY_STYLES[s.severity])}>
                  {s.severity}
                </Badge>
              </div>
              <p className="mt-0.5 text-[11px] text-muted-foreground">{s.reason}</p>
              {s.changedItems.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {s.changedItems.slice(0, 6).map((item, i) => (
                    <span key={i} className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      {item}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button
                size="sm"
                className="h-6 px-2 text-[10px]"
                disabled={updatingId === s.documentId}
                onClick={() => onUpdate(s)}
              >
                {updatingId === s.documentId ? (
                  <RefreshCw className="h-3 w-3 animate-spin" />
                ) : (
                  <Sparkles className="h-3 w-3" />
                )}
                Update
              </Button>
              <Button variant="outline" size="sm" className="h-6 px-2 text-[10px]" onClick={() => onReview(s)}>
                Review
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => onDismiss(s.documentId)}
                title="Dismiss until knowledge changes again"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function DocumentGrid({
  docs,
  view,
  projectId,
  selectedIds,
  onToggleSelect,
  onView,
  onExport,
  onSaveWord,
  onRevealWord,
  onDelete,
  onTogglePin,
  onStatusChange,
  duplicateDocument,
  navigate
}: {
  docs: Document[]
  view: 'grid' | 'list'
  projectId: string
  selectedIds: Set<string>
  onToggleSelect: (id: string) => void
  onView: (doc: Document) => void
  onExport: (doc: Document) => void
  onSaveWord: (doc: Document) => void
  onRevealWord: (doc: Document) => void
  onDelete: (doc: Document) => void
  onTogglePin: (id: string, data: Partial<Document>) => Promise<void>
  onStatusChange: (id: string, status: DocumentStatus) => void
  duplicateDocument: (id: string) => Promise<void>
  navigate: (path: string) => void
}) {
  const actions = (doc: Document) => ({
    selected: selectedIds.has(doc.id),
    onToggleSelect: () => onToggleSelect(doc.id),
    onOpen: () => navigate(`/project/${projectId}/editor/${doc.id}`),
    onView: () => onView(doc),
    onDuplicate: () => void duplicateDocument(doc.id),
    onDelete: () => onDelete(doc),
    onTogglePin: () => void onTogglePin(doc.id, { isPinned: !doc.isPinned }),
    onExport: () => onExport(doc),
    onSaveWord: () => onSaveWord(doc),
    onRevealWord: () => onRevealWord(doc),
    onStatusChange: (status: DocumentStatus) => onStatusChange(doc.id, status)
  })

  if (view === 'list') {
    return (
      <div className="divide-y divide-border/70 overflow-hidden rounded-xl border border-border/70 bg-card/90">
        {docs.map((doc) => (
          <DocumentListRow key={doc.id} doc={doc} {...actions(doc)} />
        ))}
      </div>
    )
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
      {docs.map((doc) => (
        <DocumentCard key={doc.id} doc={doc} {...actions(doc)} />
      ))}
    </div>
  )
}

function DocumentPreviewThumb({ doc, className }: { doc: Document; className?: string }) {
  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-border/60 bg-white',
        className
      )}
    >
      <DocumentHtmlPreview
        htmlContent={doc.htmlContent}
        content={doc.content}
        className="h-full w-full"
        scale={0.1}
        pageTheme={doc.pageTheme}
        pagePadding={resolveDocumentPadding(doc)}
      />
    </span>
  )
}

function DocumentActionsMenu({
  doc,
  onView,
  onOpen,
  onTogglePin,
  onDuplicate,
  onExport,
  onSaveWord,
  onRevealWord,
  onDelete,
  onStatusChange,
  className
}: {
  doc: Document
  onView: () => void
  onOpen: () => void
  onTogglePin: () => void
  onDuplicate: () => void
  onExport: () => void
  onSaveWord: () => void
  onRevealWord: () => void
  onDelete: () => void
  onStatusChange: (status: DocumentStatus) => void
  className?: string
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn('h-7 w-7 shrink-0', className)}
          onClick={(e) => e.stopPropagation()}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem onClick={onView}>
          <Eye className="mr-2 h-4 w-4" />
          View / Office preview
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onOpen}>
          <Pencil className="mr-2 h-4 w-4" />
          Edit
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onTogglePin}>
          <Pin className="mr-2 h-4 w-4" />
          {doc.isPinned ? 'Unpin' : 'Pin'}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {DOCUMENT_STATUSES.map((status) => (
          <DropdownMenuItem key={status} onClick={() => onStatusChange(status)}>
            {doc.status === status ? '● ' : '○ '}
            {DOCUMENT_STATUS_LABELS[status]}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onDuplicate}>
          <Copy className="mr-2 h-4 w-4" />
          Duplicate
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onExport}>
          <FileOutput className="mr-2 h-4 w-4" />
          Export options…
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onSaveWord}>
          <FileOutput className="mr-2 h-4 w-4" />
          Save as Word
        </DropdownMenuItem>
        {doc.exportedFilePath ? (
          <>
            <DropdownMenuItem
              onClick={() => {
                void window.electronAPI.export.openPath(doc.exportedFilePath!).then((r) => {
                  if (!r.success) toast.error(r.error ?? 'Could not open file')
                })
              }}
            >
              <FolderOpen className="mr-2 h-4 w-4" />
              Open original / desktop app
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onRevealWord}>
              <FolderOpen className="mr-2 h-4 w-4" />
              Show in folder
            </DropdownMenuItem>
          </>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
          <Trash2 className="mr-2 h-4 w-4" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function DocumentListRow({
  doc,
  selected,
  onToggleSelect,
  onOpen,
  onView,
  onDuplicate,
  onDelete,
  onTogglePin,
  onExport,
  onSaveWord,
  onRevealWord,
  onStatusChange
}: {
  doc: Document
  selected: boolean
  onToggleSelect: () => void
  onOpen: () => void
  onView: () => void
  onDuplicate: () => void
  onDelete: () => void
  onTogglePin: () => void
  onExport: () => void
  onSaveWord: () => void
  onRevealWord: () => void
  onStatusChange: (status: DocumentStatus) => void
}) {
  const previewText = stripHtmlToText(doc.htmlContent || doc.content || '', 80)

  return (
    <div className="group flex items-center gap-2 px-3 py-2 transition-colors hover:bg-accent/40">
      <button type="button" className="text-muted-foreground" onClick={onToggleSelect}>
        {selected ? <CheckSquare className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
      </button>
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
        <DocumentPreviewThumb doc={doc} className="h-8 w-8 rounded-md shadow-sm" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-sm font-medium">{doc.title}</p>
            {doc.isPinned && <Pin className="h-3 w-3 shrink-0 text-muted-foreground" />}
            <Badge variant="secondary" className="shrink-0 text-[9px]">
              {DOCUMENT_TYPE_LABELS[doc.type]}
            </Badge>
            <Badge variant="outline" className={cn('shrink-0 text-[9px]', DOCUMENT_STATUS_STYLES[doc.status ?? 'draft'])}>
              {DOCUMENT_STATUS_LABELS[doc.status ?? 'draft']}
            </Badge>
            {(doc.tags ?? []).slice(0, 3).map((tag) => (
              <Badge key={tag} variant="outline" className="shrink-0 text-[9px] font-normal">
                {tag}
              </Badge>
            ))}
          </div>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
            {previewText || 'No content yet'} · {formatRelativeTime(doc.updatedAt)}
            {doc.exportedFilePath ? ` · ${doc.exportedFilePath}` : ''}
          </p>
        </div>
      </button>
      <DocumentActionsMenu
        doc={doc}
        onView={onView}
        onOpen={onOpen}
        onTogglePin={onTogglePin}
        onDuplicate={onDuplicate}
        onExport={onExport}
        onSaveWord={onSaveWord}
        onRevealWord={onRevealWord}
        onDelete={onDelete}
        onStatusChange={onStatusChange}
      />
    </div>
  )
}

function DocumentCard({
  doc,
  selected,
  onToggleSelect,
  onOpen,
  onView,
  onDuplicate,
  onDelete,
  onTogglePin,
  onExport,
  onSaveWord,
  onRevealWord,
  onStatusChange
}: {
  doc: Document
  selected: boolean
  onToggleSelect: () => void
  onOpen: () => void
  onView: () => void
  onDuplicate: () => void
  onDelete: () => void
  onTogglePin: () => void
  onExport: () => void
  onSaveWord: () => void
  onRevealWord: () => void
  onStatusChange: (status: DocumentStatus) => void
}) {
  const previewText = stripHtmlToText(doc.htmlContent || doc.content || '', 90)
  const importing = (doc.tags ?? []).includes('importing') || doc.id.startsWith('optimistic-')

  return (
    <article
      className={cn(
        'document-library-card group relative overflow-hidden rounded-xl border border-border/70 bg-card shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-md',
        importing && 'pointer-events-none opacity-80'
      )}
    >
      <button
        type="button"
        className="absolute left-2.5 top-2.5 z-10 rounded-md border border-border/60 bg-background/85 p-1 text-muted-foreground opacity-40 shadow-sm backdrop-blur transition-opacity hover:opacity-100 group-hover:opacity-100 data-[selected=true]:border-primary/30 data-[selected=true]:text-primary data-[selected=true]:opacity-100"
        data-selected={selected}
        onClick={(e) => {
          e.stopPropagation()
          onToggleSelect()
        }}
      >
        {selected ? <CheckSquare className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
      </button>
      <button type="button" onClick={onOpen} className="block w-full text-left">
        <div className="relative h-28 overflow-hidden border-b border-border/60 bg-muted/30 p-2.5">
          <DocumentPreviewThumb
            doc={doc}
            className="h-full w-full rounded-md shadow-sm transition-transform duration-300 group-hover:scale-[1.015]"
          />
          {doc.isPinned && (
            <span className="absolute left-3 top-3 rounded-full border border-white/70 bg-white/90 p-1 text-slate-700 shadow-sm">
              <Pin className="h-3 w-3 fill-current" />
            </span>
          )}
        </div>
        <div className="p-3 pr-10">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-sm font-semibold tracking-tight">{doc.title}</p>
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            <Badge variant="secondary" className="rounded-full px-1.5 text-[9px] font-medium">
              {DOCUMENT_TYPE_LABELS[doc.type]}
            </Badge>
            <Badge variant="outline" className={cn('rounded-full px-1.5 text-[9px]', DOCUMENT_STATUS_STYLES[doc.status ?? 'draft'])}>
              {DOCUMENT_STATUS_LABELS[doc.status ?? 'draft']}
            </Badge>
            {(doc.tags ?? []).slice(0, 3).map((tag) => (
              <Badge key={tag} variant="outline" className="rounded-full px-1.5 text-[9px] font-normal">
                {tag}
              </Badge>
            ))}
          </div>
          <p className="mt-1.5 line-clamp-2 min-h-[32px] text-[11px] leading-relaxed text-muted-foreground">
            {previewText || 'Start writing to add content to this document.'}
          </p>
          <p className="mt-1.5 truncate text-[10px] text-muted-foreground">
            {doc.exportedFilePath ? `File: ${doc.exportedFilePath}` : `Updated ${formatRelativeTime(doc.updatedAt)}`}
          </p>
        </div>
      </button>
      <DocumentActionsMenu
        doc={doc}
        onView={onView}
        onOpen={onOpen}
        onTogglePin={onTogglePin}
        onDuplicate={onDuplicate}
        onExport={onExport}
        onSaveWord={onSaveWord}
        onRevealWord={onRevealWord}
        onDelete={onDelete}
        onStatusChange={onStatusChange}
        className="absolute bottom-2 right-2 bg-background/80 opacity-0 shadow-sm backdrop-blur transition-opacity group-hover:opacity-100 data-[state=open]:opacity-100"
      />
    </article>
  )
}
