import { useEffect, useState, useRef, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  Save,
  History,
  FileOutput,
  Check,
  ChevronDown,
  Eye,
  Pencil,
  Sparkles,
  Maximize2,
  Minimize2,
  PanelRight,
  Star,
  FileText,
  FileType,
  FileCode,
  FileJson,
  Hash,
  ZoomIn,
  ZoomOut,
  WifiOff,
  Loader2,
  GitCompareArrows,
  Copy,
  Printer,
  Keyboard,
  Files,
  MoreHorizontal,
  LayoutGrid
} from 'lucide-react'
import type {
  DocumentComment,
  DocumentPageSettings,
  DocumentType,
  DocumentVersion
} from '@shared/types'
import { useDocumentStore } from '@/features/documents/stores/document.store'
import { useProjectStore } from '@/shared/stores/project.store'
import { useKnowledgeStore } from '@/features/knowledge/stores/knowledge.store'
import {
  RichTextEditor,
  type DocumentEditorCommand,
  type RichTextEditorHandle
} from '@/features/editor/components/RichTextEditor'
import { EditorSidebar, type SidebarTab } from '@/features/editor/components/EditorSidebar'
import { DocumentDiffDialog } from '@/features/editor/components/DocumentDiffDialog'
import { ExportDialog } from '@/features/export/components/ExportDialog'
import { SaveTemplateDialog } from '@/features/documents/components/SaveTemplateDialog'
import { DocumentViewDialog } from '@/features/documents/components/DocumentViewDialog'
import { EditorShortcutsDialog } from '@/features/editor/components/EditorShortcutsDialog'
import { InsertFromDocumentDialog } from '@/features/editor/components/InsertFromDocumentDialog'
import { printDocumentHtml } from '@/features/editor/lib/print-document'
import { htmlToMarkdown } from '@/features/export/lib/client-export'
import { getTemplateMeta } from '@/features/documents/templates/document-templates'
import { useAutoSave } from '@/shared/hooks/useAutoSave'
import { getDocumentDisplayHtml, isTipTapJson, stripInnerHtml } from '@/shared/lib/html-utils'
import {
  getDocumentTheme,
  resolveDocumentTheme,
  resolveDocumentPadding,
  themeToCssVars,
  paddingToCssVars,
  type DocumentThemeId,
  type LayoutPresetId,
  type DocumentPadding
} from '@/features/editor/lib/editor-colors'
import { WordScreenTip } from '@/features/editor/components/WordScreenTip'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { ScrollArea } from '@/shared/components/ui/scroll-area'
import { Badge } from '@/shared/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/shared/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/shared/components/ui/dropdown-menu'
import { Spinner } from '@/shared/components/ui/spinner'
import { analyzeDocument, scoreTone } from '@/features/editor/lib/document-analytics'
import { exportClientSide, type ClientExportFormat } from '@/features/export/lib/client-export'
import { formatRelativeTime, DOCUMENT_TYPE_LABELS, cn } from '@/shared/lib/utils'
import { toast } from 'sonner'
import { DEFAULT_PAGE_SETTINGS } from '@shared/lib/document-page'
import { createComment } from '@shared/lib/document-comments'
import { DocumentCardReader } from '@/features/editor/components/DocumentCardReader'
import { AddCommentDialog } from '@/features/editor/components/AddCommentDialog'

export function EditorPage() {
  const { projectId, documentId } = useParams<{ projectId: string; documentId: string }>()
  const navigate = useNavigate()
  const { currentProject } = useProjectStore()
  const {
    currentDocument,
    versions,
    isLoadingDocument,
    isSaving,
    saveError,
    hasUnsavedChanges,
    lastSaved,
    loadDocument,
    updateDocument,
    proposeAIEdit,
    proposeSectionAIEdit,
    applyDocumentEdit,
    editSelectionWithAI,
    loadVersions,
    restoreVersion,
    saveVersion,
    duplicateDocument,
    documents,
    loadDocuments,
    markReviewed
  } = useDocumentStore()
  const { extractKnowledge, isExtracting } = useKnowledgeStore()

  const [content, setContent] = useState('')
  const [htmlContent, setHtmlContent] = useState('')
  const [title, setTitle] = useState('')
  const [focusMode, setFocusMode] = useState(false)
  const [viewMode, setViewMode] = useState<'edit' | 'view' | 'cards'>('edit')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('details')
  const [aiProcessing, setAiProcessing] = useState(false)
  const [aiDraft, setAiDraft] = useState('')
  const [isDirty, setIsDirty] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [exportFormat, setExportFormat] = useState<'pdf' | 'docx'>('pdf')
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false)
  const [fullPreviewOpen, setFullPreviewOpen] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [isOffline, setIsOffline] = useState(
    () => typeof navigator !== 'undefined' && !navigator.onLine
  )
  const [isHydrated, setIsHydrated] = useState(false)
  const hydratedDocumentIdRef = useRef<string | null>(null)
  const [diffOpen, setDiffOpen] = useState(false)
  const [diffOriginalHtml, setDiffOriginalHtml] = useState('')
  const [diffEditedHtml, setDiffEditedHtml] = useState('')
  const [isApplyingDiff, setIsApplyingDiff] = useState(false)
  const [versionHistoryOpen, setVersionHistoryOpen] = useState(false)
  const [versionCompareOpen, setVersionCompareOpen] = useState(false)
  const [compareVersion, setCompareVersion] = useState<DocumentVersion | null>(null)
  const [snapshotLabel, setSnapshotLabel] = useState('')
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [insertFromOpen, setInsertFromOpen] = useState(false)
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null)
  const [commentDialogOpen, setCommentDialogOpen] = useState(false)
  const [pendingCommentQuote, setPendingCommentQuote] = useState('')
  const [pendingCommentRange, setPendingCommentRange] = useState<{ from: number; to: number } | null>(
    null
  )
  const editorRef = useRef<RichTextEditorHandle>(null)
  const prevViewModeRef = useRef(viewMode)

  useEffect(() => {
    if (!documentId) return
    hydratedDocumentIdRef.current = null
    setIsHydrated(false)
    setContent('')
    setHtmlContent('')
    setTitle('')
    setIsDirty(false)
    loadDocument(documentId)
    loadVersions(documentId)
  }, [documentId, loadDocument, loadVersions])

  useEffect(() => {
    if (!currentDocument || currentDocument.id !== documentId) return
    if (isLoadingDocument) return
    if (hydratedDocumentIdRef.current === currentDocument.id) return

    hydratedDocumentIdRef.current = currentDocument.id
    const displayHtml = getDocumentDisplayHtml(currentDocument)
    const storedContent = currentDocument.content?.trim() ?? ''
    setContent(isTipTapJson(storedContent) ? storedContent : '')
    setHtmlContent(displayHtml)
    setTitle(currentDocument.title)
    setIsDirty(false)
    setIsHydrated(true)
    useDocumentStore.getState().markSaved()
  }, [currentDocument, documentId, isLoadingDocument])

  useAutoSave(documentId, content, htmlContent, isDirty, true, { title })

  useEffect(() => {
    if (projectId) void loadDocuments(projectId)
  }, [projectId, loadDocuments])

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!isDirty && !hasUnsavedChanges) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [isDirty, hasUnsavedChanges])

  useEffect(() => {
    if (!hasUnsavedChanges) setIsDirty(false)
  }, [hasUnsavedChanges])

  // Collapse the sidebar only when switching into edit mode, not on every render.
  useEffect(() => {
    if (prevViewModeRef.current !== 'edit' && viewMode === 'edit' && !focusMode) {
      setSidebarOpen(false)
    }
    prevViewModeRef.current = viewMode
  }, [viewMode, focusMode])

  const analytics = useMemo(() => analyzeDocument(htmlContent), [htmlContent])
  const stats = useMemo(
    () => ({
      wordCount: analytics.wordCount,
      sectionCount: analytics.sectionCount,
      readingTime: analytics.readingTimeMin
    }),
    [analytics]
  )

  const isFavorite = currentDocument?.isPinned ?? false
  const versionLabel = versions[0] ? `v${versions[0].version}` : 'v1'

  useEffect(() => {
    const onOnline = (): void => setIsOffline(false)
    const onOffline = (): void => setIsOffline(true)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  const templateMeta = currentDocument ? getTemplateMeta(currentDocument.type) : null
  const comments = Array.isArray(currentDocument?.comments) ? currentDocument.comments : []
  const openCommentCount = comments.filter((comment) => !comment.resolved).length

  useEffect(() => {
    if (!isHydrated || comments.length === 0) return
    const timer = window.setTimeout(() => {
      editorRef.current?.restoreCommentMarks(comments)
    }, 0)
    return () => window.clearTimeout(timer)
  }, [isHydrated, documentId, comments])

  const pageTheme = (currentDocument?.pageTheme ?? 'compact') as DocumentThemeId
  const layoutPreset = (currentDocument?.layoutPreset ?? 'normal') as LayoutPresetId
  const pagePadding = currentDocument ? resolveDocumentPadding(currentDocument) : undefined
  const pageSettings = currentDocument?.pageSettings ?? DEFAULT_PAGE_SETTINGS
  const appearanceStyle = useMemo(() => {
    const theme = resolveDocumentTheme(pageTheme, pageSettings)
    const pad = pagePadding ?? { top: 36, right: 40, bottom: 40, left: 40 }
    return {
      backgroundColor: theme.bg,
      color: theme.text,
      ...themeToCssVars(theme),
      ...paddingToCssVars(pad)
    }
  }, [pageTheme, pagePadding, pageSettings])

  const saveAppearance = async (data: {
    pageTheme?: DocumentThemeId
    layoutPreset?: LayoutPresetId
    paddingTop?: number
    paddingRight?: number
    paddingBottom?: number
    paddingLeft?: number
  }) => {
    if (!documentId) return
    await updateDocument(documentId, data)
  }

  const handlePageThemeChange = (theme: DocumentThemeId, resetDesign = false) => {
    if (!documentId) return
    if (!resetDesign) {
      void saveAppearance({ pageTheme: theme })
      return
    }
    void updateDocument(documentId, {
      pageTheme: theme,
      pageSettings: {
        ...pageSettings,
        accentColor: undefined,
        pageColor: undefined,
        textColor: undefined,
        fontFamily: undefined,
        bodyFontSize: undefined,
        lineHeight: undefined,
        headingStyle: undefined
      }
    })
  }

  const handleLayoutPresetChange = (preset: LayoutPresetId, padding: DocumentPadding) => {
    void saveAppearance({
      layoutPreset: preset,
      paddingTop: padding.top,
      paddingRight: padding.right,
      paddingBottom: padding.bottom,
      paddingLeft: padding.left
    })
  }

  const handlePaddingChange = (padding: DocumentPadding, preset: LayoutPresetId) => {
    void saveAppearance({
      layoutPreset: preset,
      paddingTop: padding.top,
      paddingRight: padding.right,
      paddingBottom: padding.bottom,
      paddingLeft: padding.left
    })
  }

  const handlePageSettingsChange = (settings: DocumentPageSettings) => {
    if (!documentId) return
    void updateDocument(documentId, { pageSettings: settings })
  }

  const persistComments = (next: DocumentComment[]) => {
    if (!documentId) return
    useDocumentStore.setState((state) => ({
      currentDocument:
        state.currentDocument?.id === documentId
          ? { ...state.currentDocument, comments: next }
          : state.currentDocument,
      documents: state.documents.map((document) =>
        document.id === documentId ? { ...document, comments: next } : document
      )
    }))
    void updateDocument(documentId, { comments: next })
  }

  const openCommentsPanel = () => {
    setSidebarOpen(true)
    setSidebarTab('comments')
  }

  const handleStartAddComment = () => {
    if (viewMode !== 'edit') setViewMode('edit')
    const quote = editorRef.current?.getSelectedText() ?? ''
    if (!quote) {
      toast.info('Select text in the document to comment on')
      openCommentsPanel()
      return
    }
    setPendingCommentQuote(quote)
    setPendingCommentRange(editorRef.current?.getSelectionRange() ?? null)
    setCommentDialogOpen(true)
  }

  const handleSubmitComment = (body: string) => {
    const quote = pendingCommentQuote.trim()
    if (!quote) return
    const comment = createComment({ body, quote })
    const marked = editorRef.current?.addCommentMark(
      comment.id,
      pendingCommentRange ?? undefined
    )
    if (!marked) {
      toast.error('Could not attach comment to the selected text')
      return
    }
    persistComments([...comments, comment])
    setActiveCommentId(comment.id)
    openCommentsPanel()
    setPendingCommentQuote('')
    setPendingCommentRange(null)
    toast.success('Comment added')
  }

  const handleSelectComment = (id: string) => {
    setActiveCommentId(id)
    if (viewMode !== 'edit') setViewMode('edit')
    openCommentsPanel()
    window.requestAnimationFrame(() => {
      const found = editorRef.current?.selectComment(id)
      if (!found) {
        const comment = comments.find((item) => item.id === id)
        if (comment?.quote) {
          toast.info('Comment location is not highlighted yet. The quoted text is shown in the panel.')
        }
      }
    })
  }

  const handleReplyComment = (id: string, body: string) => {
    persistComments(
      comments.map((comment) =>
        comment.id === id
          ? {
              ...comment,
              replies: [
                ...comment.replies,
                {
                  id: crypto.randomUUID(),
                  body,
                  author: 'You',
                  createdAt: new Date().toISOString()
                }
              ]
            }
          : comment
      )
    )
  }

  const handleResolveComment = (id: string) => {
    persistComments(
      comments.map((comment) => (comment.id === id ? { ...comment, resolved: true } : comment))
    )
  }

  const handleReopenComment = (id: string) => {
    persistComments(
      comments.map((comment) => (comment.id === id ? { ...comment, resolved: false } : comment))
    )
  }

  const handleDeleteComment = (id: string) => {
    editorRef.current?.unsetComment(id)
    persistComments(comments.filter((comment) => comment.id !== id))
    if (activeCommentId === id) setActiveCommentId(null)
  }

  const handleSave = async () => {
    if (!documentId) return
    const saved = await updateDocument(documentId, { content, htmlContent, title })
    if (saved) {
      setIsDirty(false)
      useDocumentStore.getState().markSaved()
      toast.success('Document saved')
    } else {
      toast.error('Could not save document. Your changes are still in the editor.')
    }
  }

  const leaveEditor = () => {
    if (isDirty || hasUnsavedChanges) {
      const ok = window.confirm('You have unsaved changes. Leave without saving?')
      if (!ok) return
    }
    navigate(`/project/${projectId}/documents`)
  }

  const handleDuplicate = async () => {
    if (!documentId) return
    const saved = await updateDocument(documentId, { content, htmlContent, title })
    if (!saved) {
      toast.error('Save failed, so duplication was cancelled to protect your latest changes.')
      return
    }
    useDocumentStore.getState().markSaved()
    const copy = await duplicateDocument(documentId)
    if (copy) {
      toast.success('Document duplicated')
      navigate(`/project/${projectId}/editor/${copy.id}`)
    } else {
      toast.error('Could not duplicate')
    }
  }

  const handlePrint = () => {
    printDocumentHtml(title || 'Document', htmlContent, {
      pageSettings,
      headerText: pageSettings.headerText || title,
      footerText: pageSettings.footerText
    })
  }

  const handleCopyMarkdown = async () => {
    try {
      await navigator.clipboard.writeText(htmlToMarkdown(htmlContent))
      toast.success('Copied as Markdown')
    } catch {
      toast.error('Could not copy')
    }
  }

  const handleCopyHtml = async () => {
    try {
      await navigator.clipboard.writeText(htmlContent)
      toast.success('Copied HTML')
    } catch {
      toast.error('Could not copy')
    }
  }

  const handleSaveNamedVersion = async () => {
    if (!documentId) return
    const saved = await updateDocument(documentId, { content, htmlContent, title })
    if (!saved) {
      toast.error('Could not save the document, so the version was not created.')
      return
    }
    useDocumentStore.getState().markSaved()
    const ok = await saveVersion(
      documentId,
      snapshotLabel.trim() || `Snapshot ${new Date().toLocaleString()}`
    )
    if (ok) {
      setSnapshotLabel('')
      toast.success('Version saved')
    } else {
      toast.error('Could not save version')
    }
  }

  const handleExtractKnowledge = async () => {
    if (!projectId) return
    const text = stripInnerHtml(htmlContent || content)
    if (!text.trim()) {
      toast.error('Document is empty')
      return
    }
    const ok = await extractKnowledge(projectId, text)
    toast[ok ? 'success' : 'error'](
      ok ? 'Knowledge extracted from this document' : 'Extraction failed'
    )
  }

  const handleToggleFavorite = async () => {
    if (!documentId || !currentDocument) return
    await updateDocument(documentId, { isPinned: !currentDocument.isPinned })
    toast.success(currentDocument.isPinned ? 'Removed from favorites' : 'Added to favorites')
  }

  const openExportDialog = (format: 'pdf' | 'docx') => {
    setExportFormat(format)
    setExportOpen(true)
  }

  const handleClientExport = (format: ClientExportFormat) => {
    if (!currentDocument) return
    try {
      exportClientSide(
        format,
        {
          id: currentDocument.id,
          title,
          type: currentDocument.type,
          style: currentDocument.style,
          pageTheme: currentDocument.pageTheme,
          pageSettings,
          htmlContent,
          content,
          createdAt: currentDocument.createdAt,
          updatedAt: currentDocument.updatedAt
        },
        {
          projectName: currentProject?.name,
          companyName: currentProject?.companyName,
          companyLogo: currentProject?.companyLogo
        }
      )
      toast.success(`Exported ${format === 'markdown' ? 'Markdown' : format.toUpperCase()}`)
    } catch (e) {
      console.error(e)
      toast.error('Export failed')
    }
  }

  const zoomIn = () => setZoom((z) => Math.min(2, Math.round((z + 0.1) * 10) / 10))
  const zoomOut = () => setZoom((z) => Math.max(0.5, Math.round((z - 0.1) * 10) / 10))
  const resetZoom = () => setZoom(1)

  const handleAIEditSelection = async (instruction: string, selectedText: string) => {
    if (!currentDocument) return null
    setAiProcessing(true)
    try {
      return await editSelectionWithAI(instruction, selectedText, {
        style: currentDocument.style,
        type: currentDocument.type
      })
    } finally {
      setAiProcessing(false)
    }
  }

  const handleAIEdit = async (instruction: string, sectionTitle?: string) => {
    if (!documentId || !currentDocument) return
    setAiProcessing(true)
    try {
      if (sectionTitle) {
        const result = await proposeSectionAIEdit(sectionTitle, instruction, htmlContent, {
          title,
          style: currentDocument.style,
          type: currentDocument.type
        })
        if (result) {
          setDiffOriginalHtml(htmlContent)
          setDiffEditedHtml(result.fullHtml)
          setDiffOpen(true)
        } else {
          toast.error('AI edit failed. Check your API key in Settings.')
        }
        return
      }

      const edited = await proposeAIEdit(instruction, htmlContent, {
        title,
        style: currentDocument.style,
        type: currentDocument.type
      })
      if (edited) {
        setDiffOriginalHtml(htmlContent)
        setDiffEditedHtml(edited)
        setDiffOpen(true)
      } else {
        toast.error('AI edit failed. Check your API key in Settings.')
      }
    } finally {
      setAiProcessing(false)
    }
  }

  const handleAcceptDiff = async () => {
    if (!documentId) return
    setIsApplyingDiff(true)
    try {
      const originalSaved = await updateDocument(documentId, { content, htmlContent, title })
      if (!originalSaved) {
        toast.error('Could not create a recovery point. AI edits were not applied.')
        return
      }
      const recoverySaved = await saveVersion(
        documentId,
        `Before AI edit · ${new Date().toLocaleString()}`
      )
      if (!recoverySaved) {
        toast.error('Could not create a recovery version. AI edits were not applied.')
        return
      }
      const applied = await applyDocumentEdit(documentId, diffEditedHtml)
      if (!applied) {
        toast.error('AI edits could not be saved. The original version is unchanged.')
        return
      }
      setHtmlContent(diffEditedHtml)
      editorRef.current?.replaceDocumentHtml(diffEditedHtml)
      setIsDirty(false)
      useDocumentStore.getState().markSaved()
      setDiffOpen(false)
      toast.success('AI edits applied')
    } catch (e) {
      console.error(e)
      toast.error('Failed to apply AI edits')
    } finally {
      setIsApplyingDiff(false)
    }
  }

  const handleDiscardDiff = () => {
    setDiffOpen(false)
    setDiffOriginalHtml('')
    setDiffEditedHtml('')
  }

  const handleCompareVersion = (version: DocumentVersion) => {
    setCompareVersion(version)
    setVersionHistoryOpen(false)
    setVersionCompareOpen(true)
  }

  const handleCloseVersionCompare = () => {
    setVersionCompareOpen(false)
    setCompareVersion(null)
  }

  const openAIPanel = () => {
    setSidebarOpen(true)
    setSidebarTab('ai')
  }

  const openAIPanelWithDraft = (draft: string) => {
    setAiDraft(draft)
    openAIPanel()
  }

  const runEditorCommand = (command: DocumentEditorCommand) => {
    if (viewMode !== 'edit') setViewMode('edit')
    window.requestAnimationFrame(() => editorRef.current?.runCommand(command))
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      if (!mod) return
      if (e.key.toLowerCase() === 's') {
        e.preventDefault()
        void handleSave()
      }
      if (e.key.toLowerCase() === 'p' && !e.shiftKey) {
        e.preventDefault()
        handlePrint()
      }
      if (e.key === '/') {
        e.preventDefault()
        setShortcutsOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (isLoadingDocument || !currentDocument || !isHydrated) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner size="lg" />
      </div>
    )
  }

  return (
    <div className="document-editor-compact modern-document-editor flex h-full flex-col bg-background">
      <header className="immersive-editor-header docs-editor-header drag-region relative z-40 flex h-[68px] shrink-0 items-center gap-3 border-b border-border/50 bg-white px-3 dark:bg-background">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {!focusMode && (
            <>
              <WordScreenTip label="Back" description="Return to the document library.">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  onClick={leaveEditor}
                  aria-label="Back"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              </WordScreenTip>
              <div className="docs-file-icon flex h-8 w-7 shrink-0 items-center justify-center rounded-sm bg-blue-600 text-white shadow-sm">
                <FileText className="h-4 w-4" />
              </div>
            </>
          )}
          <div className="flex min-w-0 flex-1 flex-col justify-center">
            <div className="flex min-w-0 items-center gap-1">
              <Input
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value)
                  setIsDirty(true)
                  useDocumentStore.getState().markUnsaved()
                }}
                disabled={viewMode === 'view'}
                className="h-7 min-w-[180px] max-w-[440px] flex-1 border-none bg-transparent px-1 text-[15px] font-medium tracking-tight shadow-none placeholder:text-muted-foreground/60 focus-visible:ring-0"
                placeholder="Untitled document"
              />
              {!focusMode && (
                <button
                  type="button"
                  className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  onClick={() => void handleToggleFavorite()}
                  aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                >
                  <Star
                    className={cn('h-3.5 w-3.5', isFavorite && 'fill-amber-400 text-amber-400')}
                  />
                </button>
              )}
            </div>
            {!focusMode && (
              <nav
                className="docs-menu-bar -ml-1 hidden h-6 items-center gap-0.5 text-[11px] text-foreground md:flex"
                aria-label="Document menus"
              >
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button type="button" className="docs-menu-trigger">
                      File
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-52">
                    <DropdownMenuItem onSelect={() => void handleSave()}>
                      <Save className="h-4 w-4" /> Save
                      <span className="ml-auto text-[10px] text-muted-foreground">Ctrl+S</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => void handleDuplicate()}>
                      <Copy className="h-4 w-4" /> Make a copy
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => openExportDialog('pdf')}>
                      <FileText className="h-4 w-4" /> Download PDF
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => openExportDialog('docx')}>
                      <FileType className="h-4 w-4" /> Download Word
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={handlePrint}>
                      <Printer className="h-4 w-4" /> Print
                      <span className="ml-auto text-[10px] text-muted-foreground">Ctrl+P</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button type="button" className="docs-menu-trigger">
                      Edit
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-44">
                    <DropdownMenuItem onSelect={() => runEditorCommand('undo')}>
                      Undo
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => runEditorCommand('redo')}>
                      Redo
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => runEditorCommand('selectAll')}>
                      Select all
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button type="button" className="docs-menu-trigger">
                      View
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-48">
                    <DropdownMenuItem onSelect={() => setViewMode('edit')}>
                      <Pencil className="h-4 w-4" /> Editing
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setViewMode('view')}>
                      <Eye className="h-4 w-4" /> Reading
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setViewMode('cards')}>
                      <LayoutGrid className="h-4 w-4" /> Cards
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => setSidebarOpen((open) => !open)}>
                      <PanelRight className="h-4 w-4" /> {sidebarOpen ? 'Hide' : 'Show'} side panel
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setFocusMode(true)}>
                      <Maximize2 className="h-4 w-4" /> Focus mode
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button type="button" className="docs-menu-trigger">
                      Insert
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-48">
                    <DropdownMenuItem onSelect={() => runEditorCommand('image')}>
                      Image
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => runEditorCommand('link')}>
                      Link
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => runEditorCommand('table')}>
                      Table
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => runEditorCommand('horizontalRule')}>
                      Horizontal line
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => runEditorCommand('hardBreak')}>
                      Line break
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button type="button" className="docs-menu-trigger">
                      Format
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-48">
                    <DropdownMenuLabel>Text</DropdownMenuLabel>
                    <DropdownMenuItem onSelect={() => runEditorCommand('bold')}>
                      Bold
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => runEditorCommand('italic')}>
                      Italic
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => runEditorCommand('underline')}>
                      Underline
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => runEditorCommand('paragraph')}>
                      Normal text
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => runEditorCommand('heading1')}>
                      Heading 1
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => runEditorCommand('heading2')}>
                      Heading 2
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => runEditorCommand('heading3')}>
                      Heading 3
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => runEditorCommand('bulletList')}>
                      Bulleted list
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => runEditorCommand('orderedList')}>
                      Numbered list
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => runEditorCommand('clearFormatting')}>
                      Clear formatting
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button type="button" className="docs-menu-trigger">
                      Tools
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-52">
                    <DropdownMenuItem onSelect={openAIPanel}>
                      <Sparkles className="h-4 w-4" /> Ask AI
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => void handleExtractKnowledge()}
                      disabled={isExtracting}
                    >
                      Extract knowledge
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setShortcutsOpen(true)}>
                      <Keyboard className="h-4 w-4" /> Keyboard shortcuts
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <button type="button" className="docs-menu-trigger" onClick={openAIPanel}>
                  Extensions
                </button>
                <button
                  type="button"
                  className="docs-menu-trigger"
                  onClick={() => setShortcutsOpen(true)}
                >
                  Help
                </button>
              </nav>
            )}
          </div>
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-1.5 self-center">
          {!focusMode && (
            <div className="flex shrink-0 items-center gap-1">
              <Badge
                variant="outline"
                className="hidden h-6 items-center text-[10px] font-medium md:inline-flex"
              >
                {versionLabel}
              </Badge>
            </div>
          )}
          <div className="flex rounded-md border border-border/70 bg-muted/35 p-0.5">
            <WordScreenTip label="Read Mode" description="Preview the document without editing.">
              <button
                type="button"
                onClick={() => setViewMode('view')}
                className={cn(
                  'flex items-center gap-1 rounded px-2 py-1 text-[11px] transition-all',
                  viewMode === 'view' && 'bg-background text-foreground shadow-sm'
                )}
              >
                <Eye className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">View</span>
              </button>
            </WordScreenTip>
            <WordScreenTip
              label="Edit Mode"
              description="Edit the document content and formatting."
            >
              <button
                type="button"
                onClick={() => setViewMode('edit')}
                className={cn(
                  'flex items-center gap-1 rounded px-2 py-1 text-[11px] transition-all',
                  viewMode === 'edit' && 'bg-background text-foreground shadow-sm'
                )}
              >
                <Pencil className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Edit</span>
              </button>
            </WordScreenTip>
            <WordScreenTip
              label="Card Mode"
              description="Read the document as Gamma-style heading cards."
            >
              <button
                type="button"
                onClick={() => setViewMode('cards')}
                className={cn(
                  'flex items-center gap-1 rounded px-2 py-1 text-[11px] transition-all',
                  viewMode === 'cards' && 'bg-background text-foreground shadow-sm'
                )}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Cards</span>
              </button>
            </WordScreenTip>
          </div>

          {/* Save status */}
          <div className="hidden items-center px-1 text-[11px] text-muted-foreground md:flex">
            {isOffline ? (
              <span className="flex items-center gap-1 text-amber-600">
                <WifiOff className="h-3 w-3" /> Offline
              </span>
            ) : isSaving || aiProcessing ? (
              <span className="flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" /> {aiProcessing ? 'AI…' : 'Saving…'}
              </span>
            ) : saveError ? (
              <span className="text-destructive" title={saveError}>
                Save failed · retrying
              </span>
            ) : hasUnsavedChanges ? (
              <span className="text-amber-600">Unsaved</span>
            ) : lastSaved ? (
              <span className="flex items-center gap-1">
                <Check className="h-3 w-3 text-green-600" /> Saved{' '}
                {formatRelativeTime(lastSaved.toISOString())}
              </span>
            ) : null}
          </div>

          <div className="mx-0.5 hidden h-5 w-px bg-border/80 sm:block" />

          <div className="flex items-center rounded-md bg-muted/30 p-0.5">
            <WordScreenTip
              label="Ask AI"
              description="Open the AI pane to rewrite, summarize, or generate document content."
            >
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={openAIPanel}
                aria-label="AI edit"
              >
                <Sparkles className="h-4 w-4" />
              </Button>
            </WordScreenTip>

            <WordScreenTip
              label={sidebarOpen ? 'Hide Sidebar' : 'Show Sidebar'}
              description="Show or hide document details, comments, and layout."
            >
              <Button
                variant="ghost"
                size="icon"
                className="relative h-7 w-7"
                onClick={() => setSidebarOpen(!sidebarOpen)}
                aria-label="Toggle sidebar"
              >
                <PanelRight className="h-4 w-4" />
                {openCommentCount > 0 && !sidebarOpen && (
                  <span className="absolute -right-0.5 -top-0.5 min-w-[14px] rounded-full bg-primary px-1 text-[9px] leading-4 text-primary-foreground">
                    {openCommentCount}
                  </span>
                )}
              </Button>
            </WordScreenTip>

            <WordScreenTip
              label={focusMode ? 'Exit Focus' : 'Focus'}
              description={
                focusMode
                  ? 'Show the toolbar and sidebar again.'
                  : 'Hide extra panels so you can write without distraction.'
              }
            >
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setFocusMode(!focusMode)}
                aria-label="Focus mode"
              >
                {focusMode ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </Button>
            </WordScreenTip>

            <Dialog open={versionHistoryOpen} onOpenChange={setVersionHistoryOpen}>
              <WordScreenTip
                label="Version History"
                description="View, compare, and restore previous versions of this document."
              >
                <span className="inline-flex">
                  <DialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      aria-label="Version history"
                    >
                      <History className="h-4 w-4" />
                    </Button>
                  </DialogTrigger>
                </span>
              </WordScreenTip>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Version History</DialogTitle>
                </DialogHeader>
                <div className="flex gap-2">
                  <Input
                    value={snapshotLabel}
                    onChange={(e) => setSnapshotLabel(e.target.value)}
                    placeholder="Label this snapshot (e.g. Client v2)"
                    className="h-8 text-xs"
                  />
                  <Button
                    size="sm"
                    className="h-8 shrink-0"
                    onClick={() => void handleSaveNamedVersion()}
                  >
                    Save version
                  </Button>
                </div>
                <ScrollArea className="max-h-80">
                  <div className="space-y-2">
                    {versions.map((v) => (
                      <div
                        key={v.id}
                        className="flex items-center justify-between gap-3 rounded-lg border border-border p-3"
                      >
                        <div>
                          <p className="text-sm font-medium">v{v.version}</p>
                          <p className="text-xs text-muted-foreground">
                            {v.label || new Date(v.createdAt).toLocaleString()}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <Button variant="ghost" size="sm" onClick={() => handleCompareVersion(v)}>
                            <GitCompareArrows className="h-3.5 w-3.5" />
                            Compare
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              if (!documentId) return
                              setVersionHistoryOpen(false)
                              hydratedDocumentIdRef.current = null
                              setIsHydrated(false)
                              void restoreVersion(documentId, v.id)
                            }}
                          >
                            Restore
                          </Button>
                        </div>
                      </div>
                    ))}
                    {versions.length === 0 && (
                      <p className="py-4 text-center text-xs text-muted-foreground">
                        Versions created on each save
                      </p>
                    )}
                  </div>
                </ScrollArea>
              </DialogContent>
            </Dialog>
          </div>

          <WordScreenTip label="Save" shortcut="Ctrl+S" description="Save the current document.">
            <span className={cn('inline-flex', viewMode === 'view' && 'cursor-not-allowed')}>
              <Button
                variant="outline"
                size="sm"
                className="h-7 rounded-md bg-background/70"
                onClick={handleSave}
                disabled={viewMode === 'view'}
              >
                <Save className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Save</span>
              </Button>
            </span>
          </WordScreenTip>

          <DropdownMenu>
            <WordScreenTip
              label="Export"
              description="Save a copy of this document as PDF, Word, Markdown, or HTML."
            >
              <span className="inline-flex">
                <DropdownMenuTrigger asChild>
                  <Button size="sm" className="h-7 rounded-md shadow-sm">
                    <FileOutput className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Export</span>
                    <ChevronDown className="h-3 w-3 opacity-70" />
                  </Button>
                </DropdownMenuTrigger>
              </span>
            </WordScreenTip>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel>Export document</DropdownMenuLabel>
              <DropdownMenuItem onSelect={() => openExportDialog('pdf')}>
                <FileText className="h-4 w-4 text-rose-500" />
                PDF
                <span className="ml-auto text-[10px] text-muted-foreground">Print-ready</span>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => openExportDialog('docx')}>
                <FileType className="h-4 w-4 text-blue-500" />
                Word
                <span className="ml-auto text-[10px] text-muted-foreground">.docx</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => handleClientExport('markdown')}>
                <FileCode className="h-4 w-4 text-violet-500" />
                Markdown
                <span className="ml-auto text-[10px] text-muted-foreground">.md</span>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => handleClientExport('html')}>
                <FileCode className="h-4 w-4 text-orange-500" />
                HTML
                <span className="ml-auto text-[10px] text-muted-foreground">.html</span>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => handleClientExport('json')}>
                <FileJson className="h-4 w-4 text-emerald-500" />
                JSON
                <span className="ml-auto text-[10px] text-muted-foreground">.json</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={handlePrint}>
                <Printer className="h-4 w-4" />
                Print
                <span className="ml-auto text-[10px] text-muted-foreground">Ctrl+P</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <WordScreenTip
              label="More"
              description="Duplicate, copy, insert from another document, and keyboard shortcuts."
            >
              <span className="inline-flex">
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="More">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
              </span>
            </WordScreenTip>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onSelect={() => void handleDuplicate()}>
                <Copy className="h-4 w-4" /> Duplicate
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setInsertFromOpen(true)}>
                <Files className="h-4 w-4" /> Insert from document
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void handleCopyMarkdown()}>
                <FileCode className="h-4 w-4" /> Copy as Markdown
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void handleCopyHtml()}>
                <FileCode className="h-4 w-4" /> Copy HTML
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => {
                  if (documentId) void markReviewed(documentId)
                  toast.success('Marked as reviewed')
                }}
              >
                <Check className="h-4 w-4" /> Mark reviewed
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setShortcutsOpen(true)}>
                <Keyboard className="h-4 w-4" /> Shortcuts
                <span className="ml-auto text-[10px] text-muted-foreground">Ctrl+/</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Editor body */}
      <div className="editor-workspace relative flex min-h-0 flex-1 overflow-hidden">
        <div
          className="document-editor-shell min-w-0 flex-1"
          style={{ zoom } as React.CSSProperties}
        >
          {viewMode === 'cards' ? (
            <DocumentCardReader html={htmlContent} />
          ) : viewMode === 'view' ? (
            <div className="document-editor-scroll h-full overflow-y-auto">
              <div className="document-editor-frame py-5">
                <div
                  className="document-page mx-auto transition-colors"
                  style={appearanceStyle}
                  data-doc-theme={pageTheme}
                  data-heading-style={pageSettings.headingStyle}
                  data-page-border={pageSettings.pageBorder}
                  data-paragraph-spacing={pageSettings.paragraphSpacing}
                >
                  <div
                    className="document-page-content tiptap min-h-[900px]"
                    data-doc-theme={pageTheme}
                    dangerouslySetInnerHTML={{ __html: htmlContent }}
                  />
                </div>
              </div>
            </div>
          ) : (
            <RichTextEditor
              ref={editorRef}
              key={documentId}
              content={htmlContent}
              onChange={(json, html) => {
                setContent(json)
                setHtmlContent(html)
                setIsDirty(true)
                useDocumentStore.getState().markUnsaved()
              }}
              documentMode
              documentTheme={pageTheme}
              pagePadding={pagePadding}
              documentStyle={currentDocument?.style}
              onAskAI={(draft) => openAIPanelWithDraft(draft)}
              onAIEditSelection={handleAIEditSelection}
              aiProcessing={aiProcessing}
              pageSettings={pageSettings}
              onAddComment={handleStartAddComment}
              onOpenCommentsPanel={openCommentsPanel}
              openCommentCount={openCommentCount}
              onCommentSelect={setActiveCommentId}
              snippetContext={{
                title,
                projectName: currentProject?.name,
                typeLabel: DOCUMENT_TYPE_LABELS[currentDocument.type],
                status: currentDocument.status ?? 'draft'
              }}
              className="h-full"
            />
          )}
        </div>

        {!focusMode && sidebarOpen && (
          <div className="absolute inset-y-0 right-0 z-40 bg-card shadow-xl lg:static lg:z-auto lg:shadow-none">
            <EditorSidebar
              activeTab={sidebarTab}
              onTabChange={setSidebarTab}
              document={currentDocument}
              title={title}
              htmlContent={htmlContent}
              wordCount={stats.wordCount}
              sectionCount={stats.sectionCount}
              readingTime={stats.readingTime}
              templateSections={templateMeta?.sections}
              pageTheme={pageTheme}
              layoutPreset={layoutPreset}
              padding={pagePadding ?? { top: 56, right: 64, bottom: 72, left: 64 }}
              onPageThemeChange={handlePageThemeChange}
              onLayoutPresetChange={handleLayoutPresetChange}
              onPaddingChange={handlePaddingChange}
              onAIEdit={handleAIEdit}
              aiProcessing={aiProcessing}
              aiDraft={aiDraft}
              onAIDraftChange={setAiDraft}
              onFullPreview={() => setFullPreviewOpen(true)}
              onSaveTemplate={() => setSaveTemplateOpen(true)}
              onExport={() => setExportOpen(true)}
              onStatusChange={(status) => {
                if (documentId) void updateDocument(documentId, { status })
              }}
              onTagsChange={(tags) => {
                if (documentId) void updateDocument(documentId, { tags })
              }}
              onExtractKnowledge={() => void handleExtractKnowledge()}
              extractingKnowledge={isExtracting}
              onNavigateHeading={(_, item, occurrence) =>
                editorRef.current?.navigateToOutlineItem(item, occurrence)
              }
              onAddComment={handleStartAddComment}
              openCommentCount={openCommentCount}
              onInsertMissingSections={(titles) => editorRef.current?.insertMissingSections(titles)}
              onTypeChange={(type: DocumentType) => {
                if (documentId) void updateDocument(documentId, { type })
              }}
              onJumpPlaceholder={() => editorRef.current?.findNextPlaceholder()}
              pageSettings={pageSettings}
              onPageSettingsChange={handlePageSettingsChange}
              comments={comments}
              activeCommentId={activeCommentId}
              onSelectComment={handleSelectComment}
              onReplyComment={handleReplyComment}
              onResolveComment={handleResolveComment}
              onReopenComment={handleReopenComment}
              onDeleteComment={handleDeleteComment}
            />
          </div>
        )}
      </div>

      {/* Status bar */}
      <footer className="flex h-8 shrink-0 items-center justify-between gap-3 border-t border-border/70 bg-card px-3 text-[11px] text-muted-foreground">
        <div className="flex items-center gap-0 overflow-x-auto whitespace-nowrap">
          <span className="px-1.5 tabular-nums">{analytics.wordCount.toLocaleString()} words</span>
          <span className="hidden h-3.5 w-px bg-border sm:block" />
          <span className="hidden px-1.5 tabular-nums sm:inline">
            {analytics.charCount.toLocaleString()} characters
          </span>
          <span className="hidden h-3.5 w-px bg-border md:block" />
          <span className="hidden px-1.5 md:inline">{analytics.readingTimeMin} min read</span>
          <span className="hidden h-3.5 w-px bg-border md:block" />
          <span className="hidden items-center gap-1 px-1.5 md:inline-flex">
            <Hash className="h-3 w-3" />
            {analytics.requirementCount} requirements
          </span>
        </div>

        <div className="flex items-center gap-2 whitespace-nowrap">
          <ScoreChip label="Quality" value={analytics.aiScore} />
          <ScoreChip
            label="Grammar"
            value={analytics.grammarScore}
            className="hidden lg:inline-flex"
          />
          <ScoreChip
            label="Req"
            value={analytics.requirementScore}
            className="hidden lg:inline-flex"
          />

          <div className="hidden h-3.5 w-px bg-border sm:block" />

          <div className="flex items-center rounded-md border border-border/60 bg-muted/30">
            <WordScreenTip label="Zoom Out" description="Make the page smaller.">
              <span className={cn('inline-flex', zoom <= 0.5 && 'cursor-not-allowed')}>
                <button
                  type="button"
                  onClick={zoomOut}
                  className="rounded p-1 hover:bg-muted disabled:opacity-40"
                  aria-label="Zoom out"
                  disabled={zoom <= 0.5}
                >
                  <ZoomOut className="h-3.5 w-3.5" />
                </button>
              </span>
            </WordScreenTip>
            <WordScreenTip label="100%" description="Restore the page to its actual size.">
              <button
                type="button"
                onClick={resetZoom}
                className="w-10 rounded px-1 py-0.5 text-center tabular-nums hover:bg-muted"
                aria-label="Reset zoom"
              >
                {Math.round(zoom * 100)}%
              </button>
            </WordScreenTip>
            <WordScreenTip label="Zoom In" description="Make the page larger.">
              <span className={cn('inline-flex', zoom >= 2 && 'cursor-not-allowed')}>
                <button
                  type="button"
                  onClick={zoomIn}
                  className="rounded p-1 hover:bg-muted disabled:opacity-40"
                  aria-label="Zoom in"
                  disabled={zoom >= 2}
                >
                  <ZoomIn className="h-3.5 w-3.5" />
                </button>
              </span>
            </WordScreenTip>
          </div>

          <span className="hidden text-[11px] lg:inline">{getDocumentTheme(pageTheme).label}</span>
        </div>
      </footer>

      <DocumentViewDialog
        open={fullPreviewOpen}
        onOpenChange={setFullPreviewOpen}
        document={{ ...currentDocument, title, htmlContent }}
        onEdit={() => {
          setFullPreviewOpen(false)
          setViewMode('edit')
        }}
        onSavedLocal={() => {
          if (currentDocument?.id) void loadDocument(currentDocument.id)
        }}
      />

      <DocumentDiffDialog
        open={diffOpen}
        onOpenChange={setDiffOpen}
        originalHtml={diffOriginalHtml}
        editedHtml={diffEditedHtml}
        isApplying={isApplyingDiff}
        onAccept={() => void handleAcceptDiff()}
        onDiscard={handleDiscardDiff}
      />

      <DocumentDiffDialog
        open={versionCompareOpen}
        onOpenChange={setVersionCompareOpen}
        originalHtml={compareVersion?.htmlContent || compareVersion?.content || ''}
        editedHtml={htmlContent}
        title={
          compareVersion
            ? `Compare v${compareVersion.version} to current draft`
            : 'Compare versions'
        }
        description={
          compareVersion
            ? `Snapshot from ${new Date(compareVersion.createdAt).toLocaleString()} compared with the content currently in the editor.`
            : undefined
        }
        mode="compare"
        originalLabel={compareVersion ? `v${compareVersion.version}` : 'Version'}
        editedLabel="current draft"
        onDiscard={handleCloseVersionCompare}
      />

      <SaveTemplateDialog
        open={saveTemplateOpen}
        onOpenChange={setSaveTemplateOpen}
        htmlContent={htmlContent}
        type={currentDocument.type}
        style={currentDocument.style}
        defaultName={title}
        sections={templateMeta?.sections ?? []}
      />

      <ExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        document={{
          id: currentDocument.id,
          title,
          type: currentDocument.type,
          htmlContent,
          content,
          style: currentDocument.style,
          pageTheme: currentDocument.pageTheme,
          pageSettings,
          layoutPreset: currentDocument.layoutPreset,
          paddingTop: currentDocument.paddingTop,
          paddingRight: currentDocument.paddingRight,
          paddingBottom: currentDocument.paddingBottom,
          paddingLeft: currentDocument.paddingLeft
        }}
        projectName={currentProject?.name ?? 'Project'}
        companyName={currentProject?.companyName}
        companyLogo={currentProject?.companyLogo}
        onBeforeExport={handleSave}
        defaultFormat={exportFormat}
      />

      <EditorShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
      <InsertFromDocumentDialog
        open={insertFromOpen}
        onOpenChange={setInsertFromOpen}
        documents={documents}
        currentId={documentId}
        onInsert={(html, sourceTitle) => {
          editorRef.current?.insertHtml(`<h2>From ${sourceTitle.replace(/</g, '')}</h2>${html}`)
          toast.success(`Inserted ${sourceTitle}`)
        }}
      />

      <AddCommentDialog
        open={commentDialogOpen}
        quote={pendingCommentQuote}
        onOpenChange={setCommentDialogOpen}
        onSubmit={handleSubmitComment}
      />
    </div>
  )
}

function ScoreChip({
  label,
  value,
  className
}: {
  label: string
  value: number
  className?: string
}) {
  const tone = scoreTone(value)
  return (
    <WordScreenTip
      label={`${label} score`}
      description={`Estimated ${label.toLowerCase()} of this document based on structure and writing quality.`}
      side="top"
    >
      <span
        className={cn(
          'inline-flex items-center gap-1 rounded px-1 py-0.5 text-[10px] font-medium tabular-nums',
          tone === 'good' && 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
          tone === 'warn' && 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
          tone === 'bad' && 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
          className
        )}
      >
        {label} {value}
      </span>
    </WordScreenTip>
  )
}
