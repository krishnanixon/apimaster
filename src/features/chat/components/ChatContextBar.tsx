import { useEffect, useRef, useState } from 'react'
import {
  Paperclip,
  X,
  FileText,
  GitBranch,
  BookOpen,
  ChevronDown,
  FileUp,
  Loader2,
  Check,
  Circle
} from 'lucide-react'
import type { ChatContextAttachment, Document } from '@shared/types'
import { Button } from '@/shared/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/shared/components/ui/dropdown-menu'
import { cn } from '@/shared/lib/utils'
import {
  IMPORT_FILE_ACCEPT,
  readImportedFile,
  type ImportProgress,
  type ImportProgressStep
} from '@/features/documents/lib/read-import-file'
import { useDocumentStore } from '@/features/documents/stores/document.store'
import { toast } from 'sonner'

interface ChatContextBarProps {
  projectId: string
  attachments: ChatContextAttachment[]
  onAdd: (attachment: ChatContextAttachment) => void
  onRemove: (id: string) => void
  onClear: () => void
  disabled?: boolean
  compact?: boolean
  attachOnly?: boolean
  chipsOnly?: boolean
}

const TYPE_ICONS = {
  document: FileText,
  flow: GitBranch,
  knowledge: BookOpen
}

type StepStatus = 'pending' | 'active' | 'done' | 'error'

interface UiStep {
  id: ImportProgressStep | 'saving' | 'attaching'
  label: string
  status: StepStatus
  detail?: string
}

function buildImportSteps(kind: ImportProgress['kind']): UiStep[] {
  const converting =
    kind === 'pdf' ? 'Converting PDF to text' : kind === 'word' ? 'Converting Word to text' : 'Reading file'
  return [
    { id: 'reading', label: 'Reading file', status: 'pending' },
    { id: 'converting', label: converting, status: 'pending' },
    { id: 'preparing', label: 'Preparing document', status: 'pending' },
    { id: 'saving', label: 'Saving to Documents', status: 'pending' },
    { id: 'attaching', label: 'Attaching to chat', status: 'pending' }
  ]
}

function markStep(steps: UiStep[], id: UiStep['id'], status: StepStatus, detail?: string): UiStep[] {
  const idx = steps.findIndex((s) => s.id === id)
  return steps.map((s, i) => {
    if (i < idx) return { ...s, status: 'done' }
    if (i === idx) return { ...s, status, detail }
    return { ...s, status: 'pending', detail: undefined }
  })
}

export function ChatContextBar({
  projectId,
  attachments,
  onAdd,
  onRemove,
  onClear,
  disabled,
  compact = false,
  attachOnly = false,
  chipsOnly = false
}: ChatContextBarProps) {
  const [documents, setDocuments] = useState<Array<{ id: string; title: string }>>([])
  const [flows, setFlows] = useState<Array<{ id: string; title: string }>>([])
  const [importing, setImporting] = useState(false)
  const [importSteps, setImportSteps] = useState<UiStep[] | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const createDocument = useDocumentStore((s) => s.createDocument)
  const loadDocuments = useDocumentStore((s) => s.loadDocuments)

  const refreshLists = async () => {
    const [docRes, flowRes] = await Promise.all([
      window.electronAPI.documents.list(projectId),
      window.electronAPI.flows.list(projectId)
    ])
    if (docRes.success && docRes.data) {
      setDocuments(docRes.data.map((d) => ({ id: d.id, title: d.title })))
    } else {
      setDocuments([])
    }
    if (flowRes.success && flowRes.data) {
      setFlows(flowRes.data.map((f) => ({ id: f.id, title: f.title })))
    } else {
      setFlows([])
    }
  }

  useEffect(() => {
    if (!projectId) return
    let cancelled = false
    void Promise.all([
      window.electronAPI.documents.list(projectId),
      window.electronAPI.flows.list(projectId)
    ]).then(([docRes, flowRes]) => {
      if (cancelled) return
      if (docRes.success && docRes.data) {
        setDocuments(docRes.data.map((d) => ({ id: d.id, title: d.title })))
      } else {
        setDocuments([])
      }
      if (flowRes.success && flowRes.data) {
        setFlows(flowRes.data.map((f) => ({ id: f.id, title: f.title })))
      } else {
        setFlows([])
      }
    })
    return () => {
      cancelled = true
    }
  }, [projectId])

  const attach = (type: ChatContextAttachment['type'], id: string, title: string) => {
    if (attachments.some((a) => a.type === type && a.id === id)) return
    onAdd({ type, id, title })
  }

  const handleImportFile = async (file: File) => {
    if (!projectId || importing) return
    setImporting(true)
    const kind = file.name.toLowerCase().endsWith('.pdf')
      ? 'pdf'
      : file.name.toLowerCase().endsWith('.docx') || file.name.toLowerCase().endsWith('.docm')
        ? 'word'
        : 'text'
    let steps = buildImportSteps(kind)
    setImportSteps(steps)

    const optimisticId = `optimistic-chat-${Date.now()}`
    const now = new Date().toISOString()
    const optimisticTitle = `Importing ${file.name}…`
    const optimisticDoc: Document = {
      id: optimisticId,
      projectId,
      title: optimisticTitle,
      type: 'requirements',
      style: 'professional',
      pageTheme: 'professional',
      layoutPreset: 'normal',
      paddingTop: 56,
      paddingRight: 56,
      paddingBottom: 56,
      paddingLeft: 56,
      pageSettings: {
        pageSize: 'a4',
        orientation: 'portrait',
        headerText: '',
        footerText: '',
        showPageNumbers: true,
        differentFirstPage: false
      },
      comments: [],
      content: '',
      htmlContent: '<p>Importing…</p>',
      isPinned: false,
      status: 'draft',
      tags: ['importing'],
      lastReviewedAt: null,
      createdAt: now,
      updatedAt: now
    }
    useDocumentStore.setState((state) => ({
      documents: [optimisticDoc, ...state.documents]
    }))
    setDocuments((prev) => [{ id: optimisticId, title: optimisticTitle }, ...prev])

    try {
      const source = await readImportedFile(file, (progress) => {
        steps = markStep(steps, progress.step === 'done' ? 'preparing' : progress.step, 'active', progress.detail)
        if (progress.step === 'done') {
          steps = markStep(steps, 'preparing', 'done', progress.detail)
        }
        setImportSteps([...steps])
      })

      steps = markStep(steps, 'saving', 'active', 'Creating document + Word copy')
      setImportSteps([...steps])

      const doc = await createDocument(projectId, {
        title: source.title,
        type: 'requirements',
        style: 'professional',
        htmlContent: source.html
      })

      useDocumentStore.setState((state) => ({
        documents: state.documents.filter((d) => d.id !== optimisticId)
      }))

      if (!doc) {
        throw new Error('Could not save imported document')
      }

      steps = markStep(steps, 'attaching', 'active')
      setImportSteps([...steps])
      attach('document', doc.id, doc.title)
      setDocuments((prev) => [
        { id: doc.id, title: doc.title },
        ...prev.filter((d) => d.id !== optimisticId)
      ])
      await loadDocuments(projectId)
      void refreshLists()

      steps = steps.map((s) => ({ ...s, status: 'done' as const }))
      setImportSteps([...steps])

      const pages =
        source.kind === 'pdf' && source.pageCount
          ? ` (${source.pageCount} page${source.pageCount === 1 ? '' : 's'})`
          : ''
      const wordPath = doc.exportedFilePath
      toast.success(
        wordPath
          ? `Imported ${source.fileName}${pages}. Attached for chat. Word: ${wordPath}`
          : `Imported ${source.fileName}${pages} and attached for chat`
      )
    } catch (e) {
      useDocumentStore.setState((state) => ({
        documents: state.documents.filter((d) => d.id !== optimisticId)
      }))
      setDocuments((prev) => prev.filter((d) => d.id !== optimisticId))
      const message = e instanceof Error ? e.message : 'Could not import file'
      setImportSteps((prev) =>
        (prev ?? steps).map((s) =>
          s.status === 'active' ? { ...s, status: 'error' as const, detail: message } : s
        )
      )
      toast.error(message)
    } finally {
      setImporting(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
      window.setTimeout(() => setImportSteps(null), 1800)
    }
  }

  const hasKnowledge = attachments.some((a) => a.type === 'knowledge')

  const showAttach = !chipsOnly
  const showChips = !attachOnly

  return (
    <div className={cn('flex flex-wrap items-center gap-1', compact && !chipsOnly && 'shrink-0 self-end')}>
      <input
        ref={fileInputRef}
        type="file"
        accept={IMPORT_FILE_ACCEPT}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void handleImportFile(file)
        }}
      />

      {showAttach && (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
            disabled={disabled || importing}
            title="Attach project context"
          >
            {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
            {!compact && !attachOnly && (
              <>
                Attach context
                <ChevronDown className="h-3 w-3 opacity-60" />
              </>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-72 w-64 overflow-y-auto">
          <DropdownMenuItem
            disabled={importing || disabled}
            onClick={() => fileInputRef.current?.click()}
          >
            <FileUp className="mr-2 h-3.5 w-3.5" />
            Import PDF or Word…
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Documents</DropdownMenuLabel>
          {documents.length === 0 ? (
            <DropdownMenuItem disabled>No documents</DropdownMenuItem>
          ) : (
            documents.slice(0, 12).map((doc) => (
              <DropdownMenuItem key={doc.id} onClick={() => attach('document', doc.id, doc.title)}>
                <FileText className="mr-2 h-3.5 w-3.5" />
                <span className="truncate">{doc.title}</span>
              </DropdownMenuItem>
            ))
          )}
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Flow diagrams</DropdownMenuLabel>
          {flows.length === 0 ? (
            <DropdownMenuItem disabled>No flows</DropdownMenuItem>
          ) : (
            flows.slice(0, 12).map((flow) => (
              <DropdownMenuItem key={flow.id} onClick={() => attach('flow', flow.id, flow.title)}>
                <GitBranch className="mr-2 h-3.5 w-3.5" />
                <span className="truncate">{flow.title}</span>
              </DropdownMenuItem>
            ))
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={hasKnowledge}
            onClick={() => attach('knowledge', projectId, 'Knowledge base')}
          >
            <BookOpen className="mr-2 h-3.5 w-3.5" />
            Full knowledge base snapshot
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      )}

      {showAttach && importSteps && (
        <div className="w-full max-w-sm rounded-md border border-border bg-muted/40 px-2 py-1.5">
          <ul className="space-y-1">
            {importSteps.map((step) => (
              <li key={step.id} className="flex items-start gap-1.5 text-[10px]">
                <span className="mt-0.5 shrink-0">
                  {step.status === 'done' ? (
                    <Check className="h-3 w-3 text-emerald-600" />
                  ) : step.status === 'error' ? (
                    <X className="h-3 w-3 text-destructive" />
                  ) : step.status === 'active' ? (
                    <Loader2 className="h-3 w-3 animate-spin text-primary" />
                  ) : (
                    <Circle className="h-3 w-3 text-muted-foreground/40" />
                  )}
                </span>
                <span className="min-w-0">
                  <span className="font-medium">{step.label}</span>
                  {step.detail ? (
                    <span className="ml-1 text-muted-foreground">{step.detail}</span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {showChips && attachments.map((att) => {
        const Icon = TYPE_ICONS[att.type]
        return (
          <span
            key={`${att.type}-${att.id}`}
            className="inline-flex max-w-[160px] items-center gap-1 rounded-full border border-border bg-muted/70 py-1 pl-2 pr-1 text-xs font-medium"
          >
            <Icon className="h-3 w-3 shrink-0 text-muted-foreground" />
            <span className="truncate">{att.title}</span>
            <button
              type="button"
              onClick={() => onRemove(att.id)}
              className="rounded-full p-0.5 hover:bg-background"
              disabled={disabled || importing}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        )
      })}

      {showChips && attachments.length > 0 && (
        <button
          type="button"
          onClick={onClear}
          className="text-[11px] text-muted-foreground hover:text-foreground"
          disabled={disabled || importing}
        >
          Clear
        </button>
      )}
    </div>
  )
}
