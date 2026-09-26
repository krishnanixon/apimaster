import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Copy,
  Eye,
  FileOutput,
  FileText,
  Filter,
  FolderKanban,
  MoreHorizontal,
  Pencil,
  Pin,
  Search,
  Trash2
} from 'lucide-react'
import { toast } from 'sonner'
import { useDocumentStore } from '@/features/documents/stores/document.store'
import { useProjectStore } from '@/shared/stores/project.store'
import { DocumentViewDialog } from '@/features/documents/components/DocumentViewDialog'
import { DocumentHtmlPreview } from '@/features/documents/components/DocumentHtmlPreview'
import { ExportDialog } from '@/features/export/components/ExportDialog'
import { ConfirmDialog } from '@/shared/components/ui/confirm-dialog'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Badge } from '@/shared/components/ui/badge'
import { SkeletonCard } from '@/shared/components/ui/skeleton'
import { ViewToggle, type ViewMode } from '@/shared/components/ui/view-toggle'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/shared/components/ui/dropdown-menu'
import { ModulePage, ModuleToolbar, PageContent, PageHeader } from '@/shared/components/layout/ModulePage'
import { stripHtmlToText } from '@/shared/lib/html-utils'
import { DOCUMENT_TYPE_LABELS, formatRelativeTime, cn } from '@/shared/lib/utils'
import { resolveDocumentPadding } from '@shared/lib/document-theme'
import {
  DOCUMENT_STATUSES,
  DOCUMENT_STATUS_LABELS,
  DOCUMENT_STATUS_STYLES
} from '@/features/documents/lib/document-meta'
import { exportClientSide } from '@/features/export/lib/client-export'
import type { DocumentStatus, DocumentType, DocumentWithProject } from '@shared/types'

export function DocumentLibraryPage() {
  const navigate = useNavigate()
  const { projects, loadProjects } = useProjectStore()
  const {
    libraryDocuments,
    isLoadingLibrary,
    loadAllDocuments,
    deleteDocument,
    duplicateDocument,
    updateDocument
  } = useDocumentStore()
  const [view, setView] = useState<ViewMode>('grid')
  const [search, setSearch] = useState('')
  const [projectFilter, setProjectFilter] = useState<string>('all')
  const [typeFilter, setTypeFilter] = useState<DocumentType | 'all'>('all')
  const [statusFilter, setStatusFilter] = useState<DocumentStatus | 'all'>('all')
  const [viewDoc, setViewDoc] = useState<DocumentWithProject | null>(null)
  const [exportDoc, setExportDoc] = useState<DocumentWithProject | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<DocumentWithProject | null>(null)

  useEffect(() => {
    void loadProjects('active')
    void loadAllDocuments()
  }, [loadProjects, loadAllDocuments])

  const projectNameById = useMemo(() => {
    const map = new Map(projects.map((p) => [p.id, p.name]))
    for (const doc of libraryDocuments) {
      if (!map.has(doc.projectId)) map.set(doc.projectId, doc.projectName)
    }
    return map
  }, [projects, libraryDocuments])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return libraryDocuments.filter((doc) => {
      if (projectFilter !== 'all' && doc.projectId !== projectFilter) return false
      if (typeFilter !== 'all' && doc.type !== typeFilter) return false
      if (statusFilter !== 'all' && doc.status !== statusFilter) return false
      if (!q) return true
      const preview = stripHtmlToText(doc.htmlContent || doc.content || '', 400).toLowerCase()
      const tags = (doc.tags ?? []).join(' ').toLowerCase()
      return (
        doc.title.toLowerCase().includes(q) ||
        (doc.projectName ?? '').toLowerCase().includes(q) ||
        preview.includes(q) ||
        tags.includes(q)
      )
    })
  }, [libraryDocuments, search, projectFilter, typeFilter, statusFilter])

  const openEditor = (doc: DocumentWithProject) => {
    navigate(`/project/${doc.projectId}/editor/${doc.id}`)
  }

  const handleDuplicate = async (doc: DocumentWithProject) => {
    const copy = await duplicateDocument(doc.id)
    if (copy) {
      toast.success('Document duplicated')
      await loadAllDocuments()
    } else {
      toast.error('Could not duplicate document')
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    await deleteDocument(deleteTarget.id)
    toast.success('Deleted')
    setDeleteTarget(null)
  }

  const exportProject = exportDoc
    ? projects.find((p) => p.id === exportDoc.projectId)
    : undefined

  return (
    <ModulePage>
      <PageHeader
        title="Document Library"
        description="All documents across projects · view, edit, and export"
        fluid
        actions={
          <span className="shrink-0 text-[11px] text-muted-foreground">
            {filtered.length} of {libraryDocuments.length}
          </span>
        }
      />

      <ModuleToolbar className="h-auto min-h-10 flex-wrap py-1.5">
        <div className="relative min-w-[180px] flex-1">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search titles, projects, content…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-7 pl-7 text-xs"
          />
        </div>
        <Filter className="h-3 w-3 text-muted-foreground" />
        <select
          value={projectFilter}
          onChange={(e) => setProjectFilter(e.target.value)}
          className="h-7 max-w-[180px] rounded-md border border-input bg-background px-1.5 text-[11px] outline-none"
        >
          <option value="all">All projects</option>
          {[...projectNameById.entries()].map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as DocumentType | 'all')}
          className="h-7 rounded-md border border-input bg-background px-1.5 text-[11px] outline-none"
        >
          <option value="all">All types</option>
          {Object.entries(DOCUMENT_TYPE_LABELS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as DocumentStatus | 'all')}
          className="h-7 rounded-md border border-input bg-background px-1.5 text-[11px] outline-none"
        >
          <option value="all">All status</option>
          {DOCUMENT_STATUSES.map((status) => (
            <option key={status} value={status}>
              {DOCUMENT_STATUS_LABELS[status]}
            </option>
          ))}
        </select>
        <ViewToggle value={view} onChange={setView} />
      </ModuleToolbar>

      <PageContent fluid>
        {isLoadingLibrary ? (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {[1, 2, 3, 4].map((item) => (
              <SkeletonCard key={item} />
            ))}
          </div>
        ) : libraryDocuments.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <FileText className="h-5 w-5" />
            </span>
            <h3 className="mt-3 text-sm font-semibold">No documents yet</h3>
            <p className="mt-1 max-w-sm text-xs text-muted-foreground">
              Create documents inside a project. They will appear here so you can browse, edit, and export them from one place.
            </p>
            <Button className="mt-4" size="sm" onClick={() => navigate('/projects')}>
              <FolderKanban className="h-3.5 w-3.5" />
              Open projects
            </Button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">No documents match your filters.</div>
        ) : view === 'list' ? (
          <div className="overflow-hidden rounded-lg border border-border/70">
            {filtered.map((doc) => (
              <LibraryRow
                key={doc.id}
                doc={doc}
                onView={() => setViewDoc(doc)}
                onEdit={() => openEditor(doc)}
                onExport={() => setExportDoc(doc)}
                onDuplicate={() => void handleDuplicate(doc)}
                onDelete={() => setDeleteTarget(doc)}
                onTogglePin={() => void updateDocument(doc.id, { isPinned: !doc.isPinned })}
                onStatusChange={(status) => void updateDocument(doc.id, { status })}
                onMarkdown={() =>
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
                }
              />
            ))}
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {filtered.map((doc) => (
              <LibraryCard
                key={doc.id}
                doc={doc}
                onView={() => setViewDoc(doc)}
                onEdit={() => openEditor(doc)}
                onExport={() => setExportDoc(doc)}
                onDuplicate={() => void handleDuplicate(doc)}
                onDelete={() => setDeleteTarget(doc)}
                onTogglePin={() => void updateDocument(doc.id, { isPinned: !doc.isPinned })}
                onStatusChange={(status) => void updateDocument(doc.id, { status })}
              />
            ))}
          </div>
        )}
      </PageContent>

      <DocumentViewDialog
        open={!!viewDoc}
        onOpenChange={(open) => {
          if (!open) setViewDoc(null)
        }}
        document={viewDoc}
        projectName={viewDoc?.projectName}
        onEdit={viewDoc ? () => openEditor(viewDoc) : undefined}
        onSavedLocal={async () => {
          await loadAllDocuments()
        }}
      />
      <ExportDialog
        open={!!exportDoc}
        onOpenChange={(open) => {
          if (!open) setExportDoc(null)
        }}
        document={exportDoc}
        projectName={exportDoc?.projectName ?? exportProject?.name}
        companyName={exportProject?.companyName}
        companyLogo={exportProject?.companyLogo}
      />
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
        title="Delete document?"
        description={deleteTarget ? `“${deleteTarget.title}” will be removed from ${deleteTarget.projectName}.` : ''}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => void handleDelete()}
      />
    </ModulePage>
  )
}

function LibraryActions({
  doc,
  onView,
  onEdit,
  onExport,
  onDuplicate,
  onDelete,
  onTogglePin,
  onStatusChange,
  onMarkdown
}: {
  doc: DocumentWithProject
  onView: () => void
  onEdit: () => void
  onExport: () => void
  onDuplicate: () => void
  onDelete: () => void
  onTogglePin: () => void
  onStatusChange: (status: DocumentStatus) => void
  onMarkdown?: () => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={(e) => e.stopPropagation()}>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem onClick={onView}>
          <Eye className="mr-2 h-4 w-4" /> View
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onEdit}>
          <Pencil className="mr-2 h-4 w-4" /> Edit
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onTogglePin}>
          <Pin className="mr-2 h-4 w-4" /> {doc.isPinned ? 'Unpin' : 'Pin'}
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
          <Copy className="mr-2 h-4 w-4" /> Duplicate
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onExport}>
          <FileOutput className="mr-2 h-4 w-4" /> Export
        </DropdownMenuItem>
        {onMarkdown && (
          <DropdownMenuItem onClick={onMarkdown}>
            <FileOutput className="mr-2 h-4 w-4" /> Markdown
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
          <Trash2 className="mr-2 h-4 w-4" /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function LibraryCard({
  doc,
  onView,
  onEdit,
  onExport,
  onDuplicate,
  onDelete,
  onTogglePin,
  onStatusChange
}: {
  doc: DocumentWithProject
  onView: () => void
  onEdit: () => void
  onExport: () => void
  onDuplicate: () => void
  onDelete: () => void
  onTogglePin: () => void
  onStatusChange: (status: DocumentStatus) => void
}) {
  return (
    <article className="group relative overflow-hidden rounded-xl border border-border/70 bg-card shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-md">
      <button type="button" onClick={onEdit} className="block w-full text-left">
        <div className="h-28 overflow-hidden border-b border-border/50 bg-white">
          <DocumentHtmlPreview
            htmlContent={doc.htmlContent}
            content={doc.content}
            className="h-full w-full"
            scale={0.18}
            pageTheme={doc.pageTheme}
            pagePadding={resolveDocumentPadding(doc)}
          />
        </div>
        <div className="space-y-1 p-2.5">
          <div className="flex items-start justify-between gap-1">
            <p className="line-clamp-2 text-xs font-semibold leading-snug">{doc.title}</p>
            {doc.isPinned && <Pin className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />}
          </div>
          <p className="truncate text-[10px] text-muted-foreground">{doc.projectName}</p>
          <div className="flex flex-wrap items-center gap-1">
            <Badge variant="secondary" className="text-[9px]">
              {DOCUMENT_TYPE_LABELS[doc.type] ?? doc.type}
            </Badge>
            <Badge variant="outline" className={cn('text-[9px]', DOCUMENT_STATUS_STYLES[doc.status ?? 'draft'])}>
              {DOCUMENT_STATUS_LABELS[doc.status ?? 'draft']}
            </Badge>
            <span className="text-[10px] text-muted-foreground">{formatRelativeTime(doc.updatedAt)}</span>
          </div>
        </div>
      </button>
      <div className="absolute right-1.5 top-1.5 opacity-0 transition-opacity group-hover:opacity-100">
        <LibraryActions
          doc={doc}
          onView={onView}
          onEdit={onEdit}
          onExport={onExport}
          onDuplicate={onDuplicate}
          onDelete={onDelete}
          onTogglePin={onTogglePin}
          onStatusChange={onStatusChange}
        />
      </div>
    </article>
  )
}

function LibraryRow({
  doc,
  onView,
  onEdit,
  onExport,
  onDuplicate,
  onDelete,
  onTogglePin,
  onStatusChange,
  onMarkdown
}: {
  doc: DocumentWithProject
  onView: () => void
  onEdit: () => void
  onExport: () => void
  onDuplicate: () => void
  onDelete: () => void
  onTogglePin: () => void
  onStatusChange: (status: DocumentStatus) => void
  onMarkdown: () => void
}) {
  const preview = stripHtmlToText(doc.htmlContent || doc.content || '', 80)
  return (
    <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2 last:border-b-0 hover:bg-accent/40">
      <button type="button" onClick={onEdit} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border/60 bg-white">
          <DocumentHtmlPreview
            htmlContent={doc.htmlContent}
            content={doc.content}
            className="h-full w-full"
            scale={0.1}
            pageTheme={doc.pageTheme}
            pagePadding={resolveDocumentPadding(doc)}
          />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-sm font-medium">{doc.title}</p>
            {doc.isPinned && <Pin className="h-3 w-3 shrink-0 text-muted-foreground" />}
            <Badge variant="secondary" className="shrink-0 text-[9px]">
              {DOCUMENT_TYPE_LABELS[doc.type] ?? doc.type}
            </Badge>
            <Badge variant="outline" className={cn('shrink-0 text-[9px]', DOCUMENT_STATUS_STYLES[doc.status ?? 'draft'])}>
              {DOCUMENT_STATUS_LABELS[doc.status ?? 'draft']}
            </Badge>
          </div>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
            {doc.projectName} · {preview || 'No content yet'} · {formatRelativeTime(doc.updatedAt)}
          </p>
        </div>
      </button>
      <LibraryActions
        doc={doc}
        onView={onView}
        onEdit={onEdit}
        onExport={onExport}
        onDuplicate={onDuplicate}
        onDelete={onDelete}
        onTogglePin={onTogglePin}
        onStatusChange={onStatusChange}
        onMarkdown={onMarkdown}
      />
    </div>
  )
}
