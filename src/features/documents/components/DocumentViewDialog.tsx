import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Check,
  Download,
  ExternalLink,
  FileOutput,
  FileText,
  FileType,
  FolderOpen,
  Loader2,
  Pencil,
  Save,
  Upload,
  X,
  ZoomIn,
  ZoomOut
} from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/shared/components/ui/dialog'
import { Button } from '@/shared/components/ui/button'
import { Badge } from '@/shared/components/ui/badge'
import { getDocumentDisplayHtml } from '@/shared/lib/html-utils'
import {
  resolveDocumentTheme,
  resolveDocumentPadding,
  themeToCssVars,
  paddingToCssVars
} from '@shared/lib/document-theme'
import { pageSettingsToCssVars } from '@shared/lib/document-page'
import { DOCUMENT_TYPE_LABELS, cn, formatRelativeTime } from '@/shared/lib/utils'
import { exportDefaultsFromSettings } from '@shared/lib/export-defaults'
import { useSettingsStore } from '@/shared/stores/settings.store'
import {
  IMPORT_FILE_ACCEPT,
  readImportedFile,
  type ImportedSource
} from '@/features/documents/lib/read-import-file'
import type { Document, ExportOptions } from '@shared/types'
import { toast } from 'sonner'

interface DocumentViewDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  document: Document | null
  onEdit?: () => void
  /** Called after Save as Word so the list can refresh paths. */
  onSavedLocal?: (doc: Document, filePath: string) => void
  /** Open a local PDF/Word into the project and show it here. */
  onOpenLocalFile?: (source: ImportedSource) => Promise<Document | null>
  projectName?: string
}

type RibbonTab = 'file' | 'view'

export function DocumentViewDialog({
  open,
  onOpenChange,
  document: doc,
  onEdit,
  onSavedLocal,
  onOpenLocalFile,
  projectName
}: DocumentViewDialogProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { settings } = useSettingsStore()
  const [activeDoc, setActiveDoc] = useState<Document | null>(doc)
  const [ribbon, setRibbon] = useState<RibbonTab>('file')
  const [zoom, setZoom] = useState(100)
  const [busy, setBusy] = useState<'word' | 'pdf' | 'open' | null>(null)
  const [lastSavedPath, setLastSavedPath] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setActiveDoc(doc)
      setZoom(100)
      setLastSavedPath(doc?.exportedFilePath ?? null)
      setRibbon('file')
      setBusy(null)
    }
  }, [open, doc])

  const html = activeDoc ? getDocumentDisplayHtml(activeDoc) : ''
  const theme = resolveDocumentTheme(activeDoc?.pageTheme, activeDoc?.pageSettings)
  const padding = resolveDocumentPadding(
    activeDoc ?? {
      layoutPreset: 'normal',
      paddingTop: 56,
      paddingRight: 64,
      paddingBottom: 72,
      paddingLeft: 64
    }
  )
  const appearanceStyle = {
    backgroundColor: theme.bg,
    color: theme.text,
    ...themeToCssVars(theme),
    ...paddingToCssVars(padding),
    ...(activeDoc?.pageSettings ? pageSettingsToCssVars(activeDoc.pageSettings) : {}),
    transform: `scale(${zoom / 100})`,
    transformOrigin: 'top center'
  }

  const saveAsWord = useCallback(async () => {
    if (!activeDoc || activeDoc.id.startsWith('optimistic-')) return
    setBusy('word')
    try {
      const folder = settings?.exportFolderPath?.trim() || undefined
      const result = await window.electronAPI.documents.saveWord({
        documentId: activeDoc.id,
        folderPath: folder
      })
      if (!result.success || !result.data?.filePath) {
        throw new Error(result.error ?? 'Could not save Word file')
      }
      const path = result.data.filePath
      setLastSavedPath(path)
      setActiveDoc((prev) => (prev ? { ...prev, exportedFilePath: path } : prev))
      onSavedLocal?.(activeDoc, path)
      toast.success(`Saved Word file: ${path}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save Word file')
    } finally {
      setBusy(null)
    }
  }, [activeDoc, onSavedLocal, settings?.exportFolderPath])

  const saveAsPdf = useCallback(async () => {
    if (!activeDoc || activeDoc.id.startsWith('optimistic-')) return
    setBusy('pdf')
    try {
      const pathRes = await window.electronAPI.export.selectPath('pdf')
      if (!pathRes.success || !pathRes.data) {
        if (pathRes.error && !/cancel/i.test(pathRes.error)) {
          toast.error(pathRes.error)
        }
        return
      }
      const defaults = exportDefaultsFromSettings(settings)
      const payload: ExportOptions = {
        documentId: activeDoc.id,
        format: 'pdf',
        filePath: pathRes.data,
        includeCoverPage: defaults.includeCoverPage,
        includeTableOfContents: defaults.includeTableOfContents,
        includePageNumbers: defaults.includePageNumbers,
        includeHeaderFooter: defaults.includeHeaderFooter,
        includeLogo: defaults.includeLogo,
        includeWatermark: defaults.includeWatermark,
        coverStyle: defaults.coverStyle,
        tocStyle: defaults.tocStyle,
        pageNumberStyle: defaults.pageNumberStyle,
        headerFooterStyle: defaults.headerFooterStyle,
        coverAccent: defaults.coverAccent,
        coverSubtitle: defaults.coverSubtitle,
        preparedBy: defaults.preparedBy,
        watermarkStyle: defaults.watermarkStyle,
        watermarkText: defaults.watermarkText,
        classification: defaults.classification,
        pageSize: defaults.pageSize,
        orientation: defaults.orientation,
        coverBackground: defaults.coverBackground,
        coverOverlay: defaults.coverOverlay,
        coverFont: defaults.coverFont,
        imageQuality: defaults.imageQuality
      }
      const result = await window.electronAPI.export.document(payload)
      if (!result.success || !result.data?.filePath) {
        throw new Error(result.error ?? 'Could not save PDF')
      }
      setLastSavedPath(result.data.filePath)
      toast.success(`Saved PDF: ${result.data.filePath}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save PDF')
    } finally {
      setBusy(null)
    }
  }, [activeDoc, settings])

  const saveWordToDesktop = useCallback(async () => {
    if (!activeDoc || activeDoc.id.startsWith('optimistic-')) return
    setBusy('word')
    try {
      const pathRes = await window.electronAPI.export.selectPath('docx')
      if (!pathRes.success || !pathRes.data) {
        if (pathRes.error && !/cancel/i.test(pathRes.error)) {
          toast.error(pathRes.error)
        }
        return
      }
      const defaults = exportDefaultsFromSettings(settings)
      const result = await window.electronAPI.export.document({
        documentId: activeDoc.id,
        format: 'docx',
        filePath: pathRes.data,
        includeCoverPage: defaults.includeCoverPage,
        includeTableOfContents: defaults.includeTableOfContents,
        includePageNumbers: defaults.includePageNumbers,
        includeHeaderFooter: defaults.includeHeaderFooter,
        includeLogo: defaults.includeLogo,
        includeWatermark: defaults.includeWatermark,
        coverStyle: defaults.coverStyle,
        tocStyle: defaults.tocStyle,
        pageNumberStyle: defaults.pageNumberStyle,
        headerFooterStyle: defaults.headerFooterStyle,
        coverAccent: defaults.coverAccent,
        coverSubtitle: defaults.coverSubtitle,
        preparedBy: defaults.preparedBy,
        watermarkStyle: defaults.watermarkStyle,
        watermarkText: defaults.watermarkText,
        classification: defaults.classification,
        pageSize: defaults.pageSize,
        orientation: defaults.orientation,
        coverBackground: defaults.coverBackground,
        coverOverlay: defaults.coverOverlay,
        coverFont: defaults.coverFont,
        imageQuality: defaults.imageQuality
      })
      if (!result.success || !result.data?.filePath) {
        throw new Error(result.error ?? 'Could not save Word file')
      }
      const path = result.data.filePath
      setLastSavedPath(path)
      setActiveDoc((prev) => (prev ? { ...prev, exportedFilePath: path } : prev))
      onSavedLocal?.(activeDoc, path)
      toast.success(`Saved Word file: ${path}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save Word file')
    } finally {
      setBusy(null)
    }
  }, [activeDoc, onSavedLocal, settings])

  const openLocalInSystem = useCallback(async () => {
    const path = lastSavedPath || activeDoc?.exportedFilePath
    if (!path) {
      toast.error('Save a Word or PDF copy first, then open it')
      return
    }
    const result = await window.electronAPI.export.openPath(path)
    if (!result.success) {
      toast.error(result.error ?? 'Could not open file')
      return
    }
    toast.success('Opened in your desktop app')
  }, [activeDoc?.exportedFilePath, lastSavedPath])

  const revealLocal = useCallback(async () => {
    const path = lastSavedPath || activeDoc?.exportedFilePath
    if (!path) {
      toast.error('No local file yet — save Word or PDF first')
      return
    }
    const result = await window.electronAPI.export.revealPath(path)
    if (!result.success) toast.error(result.error ?? 'Could not show file')
  }, [activeDoc?.exportedFilePath, lastSavedPath])

  const handleOpenLocalFile = useCallback(
    async (file: File) => {
      if (!onOpenLocalFile) {
        toast.error('Opening local files is not available here')
        return
      }
      setBusy('open')
      try {
        const source = await readImportedFile(file)
        const created = await onOpenLocalFile(source)
        if (created) {
          setActiveDoc(created)
          setLastSavedPath(created.exportedFilePath ?? null)
          toast.success(`Opened ${source.fileName}`)
        } else {
          toast.error(`Could not open ${file.name}`)
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Could not open file')
      } finally {
        setBusy(null)
        if (fileInputRef.current) fileInputRef.current.value = ''
      }
    },
    [onOpenLocalFile]
  )

  if (!activeDoc) return null

  const localPath = lastSavedPath || activeDoc.exportedFilePath || null
  const isBusy = busy !== null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideClose
        className="office-viewer flex h-[94vh] max-h-[94vh] w-[min(1100px,96vw)] max-w-[1100px] flex-col gap-0 overflow-hidden border-border/80 p-0 shadow-2xl"
      >
        <DialogTitle className="sr-only">{activeDoc.title}</DialogTitle>

        <input
          ref={fileInputRef}
          type="file"
          accept={IMPORT_FILE_ACCEPT}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void handleOpenLocalFile(file)
          }}
        />

        {/* Title bar */}
        <div className="office-viewer-titlebar flex shrink-0 items-center justify-between gap-3 border-b border-border/70 px-3 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-sky-600 text-white shadow-sm">
              <FileText className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold tracking-tight">{activeDoc.title}</p>
              <p className="truncate text-[10px] text-muted-foreground">
                {projectName ? `${projectName} · ` : ''}
                {DOCUMENT_TYPE_LABELS[activeDoc.type] ?? activeDoc.type}
                {' · '}
                Updated {formatRelativeTime(activeDoc.updatedAt)}
              </p>
            </div>
            {localPath ? (
              <Badge
                variant="outline"
                className="hidden max-w-[220px] truncate text-[9px] sm:inline-flex"
              >
                Local file ready
              </Badge>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {onEdit ? (
              <Button
                size="sm"
                variant="outline"
                className="h-7 gap-1 text-xs"
                onClick={onEdit}
                disabled={isBusy}
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </Button>
            ) : null}
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={() => onOpenChange(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Ribbon tabs */}
        <div className="office-viewer-ribbon shrink-0 border-b border-border/70 bg-muted/40">
          <div className="flex items-center gap-0.5 px-2 pt-1">
            {(
              [
                ['file', 'File'],
                ['view', 'View']
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={cn(
                  'rounded-t-md px-3 py-1 text-xs font-medium transition-colors',
                  ribbon === id
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
                onClick={() => setRibbon(id)}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-1 bg-background px-2 py-1.5">
            {ribbon === 'file' ? (
              <>
                {onOpenLocalFile ? (
                  <RibbonAction
                    icon={Upload}
                    label="Open"
                    detail="PDF / Word"
                    disabled={isBusy}
                    onClick={() => fileInputRef.current?.click()}
                  />
                ) : null}
                <RibbonAction
                  icon={busy === 'word' ? Loader2 : Save}
                  label="Save Word"
                  detail="Project folder"
                  spinning={busy === 'word'}
                  disabled={isBusy}
                  onClick={() => void saveAsWord()}
                />
                <RibbonAction
                  icon={busy === 'word' ? Loader2 : Download}
                  label="Save as…"
                  detail="Word (.docx)"
                  spinning={busy === 'word'}
                  disabled={isBusy}
                  onClick={() => void saveWordToDesktop()}
                />
                <RibbonAction
                  icon={busy === 'pdf' ? Loader2 : FileType}
                  label="Save PDF"
                  detail="Desktop / folder"
                  spinning={busy === 'pdf'}
                  disabled={isBusy}
                  onClick={() => void saveAsPdf()}
                />
                <div className="mx-1 h-8 w-px bg-border" />
                <RibbonAction
                  icon={ExternalLink}
                  label="Open file"
                  detail="Word / PDF app"
                  disabled={isBusy || !localPath}
                  onClick={() => void openLocalInSystem()}
                />
                <RibbonAction
                  icon={FolderOpen}
                  label="Show in folder"
                  detail="Explorer"
                  disabled={isBusy || !localPath}
                  onClick={() => void revealLocal()}
                />
                {onEdit ? (
                  <>
                    <div className="mx-1 h-8 w-px bg-border" />
                    <RibbonAction
                      icon={Pencil}
                      label="Edit"
                      detail="Studio editor"
                      disabled={isBusy}
                      onClick={onEdit}
                    />
                  </>
                ) : null}
              </>
            ) : (
              <>
                <RibbonAction
                  icon={ZoomOut}
                  label="Zoom out"
                  disabled={zoom <= 70}
                  onClick={() => setZoom((z) => Math.max(70, z - 10))}
                />
                <span className="min-w-[3rem] text-center text-[11px] font-medium tabular-nums text-muted-foreground">
                  {zoom}%
                </span>
                <RibbonAction
                  icon={ZoomIn}
                  label="Zoom in"
                  disabled={zoom >= 140}
                  onClick={() => setZoom((z) => Math.min(140, z + 10))}
                />
                <RibbonAction
                  icon={Check}
                  label="Fit page"
                  detail="100%"
                  onClick={() => setZoom(100)}
                />
              </>
            )}
          </div>
        </div>

        {/* Canvas */}
        <div className="office-viewer-canvas min-h-0 flex-1 overflow-auto">
          <div className="document-canvas px-4 py-6">
            <div
              className="document-page mx-auto transition-transform duration-200"
              style={appearanceStyle}
              data-doc-theme={activeDoc.pageTheme ?? 'professional'}
              data-heading-style={activeDoc.pageSettings?.headingStyle}
              data-page-border={activeDoc.pageSettings?.pageBorder}
              data-paragraph-spacing={activeDoc.pageSettings?.paragraphSpacing}
            >
              {html ? (
                <div
                  className="document-page-content tiptap"
                  data-doc-theme={activeDoc.pageTheme ?? 'professional'}
                  dangerouslySetInnerHTML={{ __html: html }}
                />
              ) : (
                <div className="document-page-content flex min-h-[400px] flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
                  <FileOutput className="h-8 w-8 opacity-40" />
                  <p>No content yet. Open a PDF or Word file, or edit in the studio.</p>
                  {onOpenLocalFile ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Upload className="h-3.5 w-3.5" />
                      Open PDF / Word
                    </Button>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Status bar */}
        <div className="office-viewer-statusbar flex shrink-0 items-center justify-between gap-3 border-t border-border/70 px-3 py-1.5 text-[10px] text-muted-foreground">
          <span className="truncate">
            {busy === 'open'
              ? 'Opening file…'
              : busy === 'word'
                ? 'Saving Word…'
                : busy === 'pdf'
                  ? 'Saving PDF…'
                  : localPath
                    ? localPath
                    : 'Not saved to desktop yet — use Save Word or Save PDF'}
          </span>
          <span className="shrink-0 tabular-nums">{zoom}% · Page view</span>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function RibbonAction({
  icon: Icon,
  label,
  detail,
  onClick,
  disabled,
  spinning
}: {
  icon: typeof Save
  label: string
  detail?: string
  onClick: () => void
  disabled?: boolean
  spinning?: boolean
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'inline-flex min-w-[4.5rem] flex-col items-center gap-0.5 rounded-md px-2 py-1 text-foreground transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-40'
      )}
    >
      <Icon className={cn('h-4 w-4 text-sky-700 dark:text-sky-400', spinning && 'animate-spin')} />
      <span className="text-[10px] font-medium leading-none">{label}</span>
      {detail ? (
        <span className="text-[9px] leading-none text-muted-foreground">{detail}</span>
      ) : null}
    </button>
  )
}
