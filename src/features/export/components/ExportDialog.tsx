import { useEffect, useMemo, useRef, useState } from 'react'
import {
  FileText,
  FileType,
  Check,
  Loader2,
  Building2,
  List,
  Hash,
  AlignLeft,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Save,
  Stamp,
  Shield,
  RectangleHorizontal,
  Image as ImageIcon,
  RectangleVertical,
  Lock,
  ImageDown,
  Upload
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/shared/components/ui/dialog'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { cn, DOCUMENT_TYPE_LABELS } from '@/shared/lib/utils'
import { resolveDocumentHtml, stripInnerHtml } from '@/shared/lib/html-utils'
import {
  resolveDocumentTheme,
  getLayoutPreset,
  getDocumentAppearanceStyle,
  themeToCssVars,
  resolveDocumentPadding
} from '@shared/lib/document-theme'
import { DEFAULT_PAGE_SETTINGS, pageSettingsToCssVars } from '@shared/lib/document-page'
import { useSettingsStore } from '@/shared/stores/settings.store'
import { exportDefaultsFromSettings } from '@shared/lib/export-defaults'
import {
  CLASSIFICATION_META,
  COVER_ACCENT_PRESETS,
  COVER_FONTS,
  parseCoverOverlay,
  parseExportClassification,
  parseExportCoverStyle,
  parseExportImageQuality,
  parseExportOrientation,
  parseExportPageSize,
  parseExportWatermarkStyle,
  resolveCoverAccent,
  resolveCoverFont,
  resolveExportPageBox,
  resolveWatermarkText
} from '@shared/lib/export-cover'
import type {
  ExportClassification,
  ExportCoverStyle,
  ExportHeaderFooterStyle,
  ExportImageQuality,
  ExportOptions,
  ExportOrientation,
  ExportPageNumberStyle,
  ExportPageSize,
  ExportTocStyle,
  ExportWatermarkStyle
} from '@shared/types'
import { toast } from 'sonner'
import { CoverPagePreview, CoverStylePicker } from '@/features/export/components/CoverPagePreview'

export interface ExportDialogDocument {
  id: string
  title: string
  type: string
  htmlContent?: string
  content?: string
  style?: string
  pageTheme?: string
  pageSettings?: import('@shared/types').DocumentPageSettings
  layoutPreset?: string
  paddingTop?: number
  paddingRight?: number
  paddingBottom?: number
  paddingLeft?: number
}

interface ExportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  document: ExportDialogDocument | null
  projectName?: string
  companyName?: string
  companyLogo?: string
  onBeforeExport?: () => Promise<void>
  defaultFormat?: 'pdf' | 'docx'
}

type ExportFormattingOptions = Pick<
  ExportOptions,
  | 'includeCoverPage'
  | 'includeTableOfContents'
  | 'includePageNumbers'
  | 'includeHeaderFooter'
  | 'includeLogo'
  | 'includeWatermark'
>

interface ExportStyleOptions {
  coverStyle: ExportCoverStyle
  tocStyle: ExportTocStyle
  pageNumberStyle: ExportPageNumberStyle
  headerFooterStyle: ExportHeaderFooterStyle
  coverAccent: string
  coverSubtitle: string
  preparedBy: string
  watermarkStyle: ExportWatermarkStyle
  watermarkText: string
  classification: ExportClassification
  pageSize: ExportPageSize
  orientation: ExportOrientation
  coverBackground: string
  coverOverlay: number
  coverFont: string
  imageQuality: ExportImageQuality
}

const WORDS_PER_PAGE = 480

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function readCoverBackground(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('read failed'))
    reader.onload = () => {
      const image = new Image()
      image.onload = () => {
        const maxEdge = 1800
        const scale = Math.min(1, maxEdge / Math.max(image.width, image.height))
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(image.width * scale))
        canvas.height = Math.max(1, Math.round(image.height * scale))
        const context = canvas.getContext('2d')
        if (!context) {
          reject(new Error('canvas'))
          return
        }
        context.drawImage(image, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', 0.84))
      }
      image.onerror = () => reject(new Error('image'))
      image.src = String(reader.result)
    }
    reader.readAsDataURL(file)
  })
}

export function ExportDialog({
  open,
  onOpenChange,
  document,
  projectName = 'Project',
  companyName = '',
  companyLogo = '',
  onBeforeExport,
  defaultFormat
}: ExportDialogProps) {
  const { settings, updateSettings } = useSettingsStore()
  const savedDefaults = useMemo(() => exportDefaultsFromSettings(settings), [settings])

  const [format, setFormat] = useState<'pdf' | 'docx'>(defaultFormat ?? savedDefaults.format)
  const [options, setOptions] = useState<ExportFormattingOptions>(() => ({
    includeCoverPage: savedDefaults.includeCoverPage,
    includeTableOfContents: savedDefaults.includeTableOfContents,
    includePageNumbers: savedDefaults.includePageNumbers,
    includeHeaderFooter: savedDefaults.includeHeaderFooter,
    includeLogo: savedDefaults.includeLogo,
    includeWatermark: savedDefaults.includeWatermark
  }))
  const [styles, setStyles] = useState<ExportStyleOptions>(() => ({
    coverStyle: savedDefaults.coverStyle,
    tocStyle: savedDefaults.tocStyle,
    pageNumberStyle: savedDefaults.pageNumberStyle,
    headerFooterStyle: savedDefaults.headerFooterStyle,
    coverAccent: savedDefaults.coverAccent,
    coverSubtitle: savedDefaults.coverSubtitle,
    preparedBy: savedDefaults.preparedBy,
    watermarkStyle: savedDefaults.watermarkStyle,
    watermarkText: savedDefaults.watermarkText,
    classification: savedDefaults.classification,
    pageSize: savedDefaults.pageSize,
    orientation: savedDefaults.orientation,
    coverBackground: savedDefaults.coverBackground,
    coverOverlay: savedDefaults.coverOverlay,
    coverFont: savedDefaults.coverFont,
    imageQuality: savedDefaults.imageQuality
  }))
  const [protectPdf, setProtectPdf] = useState(false)
  const [pdfPassword, setPdfPassword] = useState('')
  const [pdfPasswordConfirm, setPdfPasswordConfirm] = useState('')
  const [exporting, setExporting] = useState(false)
  const [lastPath, setLastPath] = useState<string | null>(null)

  const [containerWidth, setContainerWidth] = useState(0)
  const [userZoom, setUserZoom] = useState<number | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const isOpen = open && !!document

  useEffect(() => {
    if (isOpen) {
      const defaults = exportDefaultsFromSettings(settings)
      setFormat(defaultFormat ?? defaults.format)
      setOptions({
        includeCoverPage: defaults.includeCoverPage,
        includeTableOfContents: defaults.includeTableOfContents,
        includePageNumbers: defaults.includePageNumbers,
        includeHeaderFooter: defaults.includeHeaderFooter,
        includeLogo: defaults.includeLogo,
        includeWatermark: defaults.includeWatermark
      })
      setStyles({
        coverStyle: parseExportCoverStyle(defaults.coverStyle),
        tocStyle: defaults.tocStyle,
        pageNumberStyle: defaults.pageNumberStyle,
        headerFooterStyle: defaults.headerFooterStyle,
        coverAccent: defaults.coverAccent,
        coverSubtitle: defaults.coverSubtitle,
        preparedBy: defaults.preparedBy,
        watermarkStyle: parseExportWatermarkStyle(defaults.watermarkStyle),
        watermarkText: defaults.watermarkText,
        classification: parseExportClassification(defaults.classification),
        pageSize: parseExportPageSize(defaults.pageSize),
        orientation: parseExportOrientation(defaults.orientation),
        coverBackground: defaults.coverBackground,
        coverOverlay: parseCoverOverlay(defaults.coverOverlay),
        coverFont: defaults.coverFont,
        imageQuality: parseExportImageQuality(defaults.imageQuality)
      })
      setProtectPdf(false)
      setPdfPassword('')
      setPdfPasswordConfirm('')
      setUserZoom(null)
    } else {
      setExporting(false)
      setLastPath(null)
      setProtectPdf(false)
      setPdfPassword('')
      setPdfPasswordConfirm('')
    }
  }, [isOpen, defaultFormat, settings])

  useEffect(() => {
    const el = scrollRef.current
    if (!el || !isOpen) return
    setContainerWidth(el.clientWidth)
    const ro = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width
      if (width) setContainerWidth(width)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [isOpen])

  const previewHtml = useMemo(() => (document ? resolveDocumentHtml(document) : ''), [document])

  const theme = useMemo(
    () => resolveDocumentTheme(document?.pageTheme, document?.pageSettings),
    [document?.pageTheme, document?.pageSettings]
  )
  const padding = useMemo(
    () => (document ? resolveDocumentPadding(document) : resolveDocumentPadding({})),
    [document]
  )
  const appearanceStyle = useMemo(
    () => ({
      ...getDocumentAppearanceStyle(document?.pageTheme, padding),
      backgroundColor: theme.bg,
      color: theme.text,
      ...themeToCssVars(theme),
      ...pageSettingsToCssVars(document?.pageSettings ?? DEFAULT_PAGE_SETTINGS)
    }),
    [document?.pageTheme, document?.pageSettings, padding, theme]
  )

  const pageSize = resolveExportPageBox(styles.pageSize, styles.orientation)
  const coverAccent = resolveCoverAccent(theme.accentColor, styles.coverAccent)
  const coverFont = resolveCoverFont(theme.fontFamily, styles.coverFont)
  const watermarkText = options.includeWatermark
    ? resolveWatermarkText(styles.watermarkStyle, styles.watermarkText)
    : ''
  const dateLabel = new Date().toLocaleDateString()
  const classificationMeta =
    styles.classification === 'none' ? null : CLASSIFICATION_META[styles.classification]

  const toc = useMemo(() => {
    if (!previewHtml || typeof DOMParser === 'undefined') return []
    try {
      const parsed = new DOMParser().parseFromString(previewHtml, 'text/html')
      return Array.from(parsed.querySelectorAll('h1, h2'))
        .map((el) => ({ level: el.tagName === 'H1' ? 1 : 2, text: (el.textContent ?? '').trim() }))
        .filter((h) => h.text)
        .slice(0, 14)
    } catch {
      return []
    }
  }, [previewHtml])

  const stats = useMemo(() => {
    const text = stripInnerHtml(previewHtml).trim()
    const words = text ? text.split(/\s+/).filter(Boolean).length : 0
    const pages =
      Math.max(1, Math.ceil(words / WORDS_PER_PAGE)) + (options.includeCoverPage ? 1 : 0)
    return { words, pages }
  }, [previewHtml, options.includeCoverPage])

  const typeLabel = document ? (DOCUMENT_TYPE_LABELS[document.type] ?? document.type) : ''
  const themeLabel = theme.label
  const layoutLabel = document ? getLayoutPreset(document.layoutPreset).label : 'Normal'

  const fitZoom =
    containerWidth > 0 ? clamp((containerWidth - 8) / pageSize.widthPx, 0.4, 1.4) : 0.7
  const zoom = userZoom ?? fitZoom
  const zoomPercent = Math.round(zoom * 100)

  const toggle = (key: keyof typeof options) => {
    setOptions((o) => ({ ...o, [key]: !o[key] }))
  }

  const allOptionsSelected =
    options.includeCoverPage &&
    options.includeTableOfContents &&
    options.includePageNumbers &&
    options.includeHeaderFooter

  const setAllOptions = (checked: boolean) => {
    setOptions((current) => ({
      ...current,
      includeCoverPage: checked,
      includeTableOfContents: checked,
      includePageNumbers: checked,
      includeHeaderFooter: checked
    }))
  }

  const saveAsDefault = async () => {
    await updateSettings({
      exportDefaultFormat: format,
      exportIncludeCoverPage: options.includeCoverPage,
      exportIncludeTableOfContents: options.includeTableOfContents,
      exportIncludePageNumbers: options.includePageNumbers,
      exportIncludeHeaderFooter: options.includeHeaderFooter,
      exportCoverStyle: styles.coverStyle,
      exportTocStyle: styles.tocStyle,
      exportPageNumberStyle: styles.pageNumberStyle,
      exportHeaderFooterStyle: styles.headerFooterStyle,
      exportIncludeLogo: options.includeLogo,
      exportCoverAccent: styles.coverAccent,
      exportCoverSubtitle: styles.coverSubtitle,
      exportPreparedBy: styles.preparedBy,
      exportIncludeWatermark: options.includeWatermark,
      exportWatermarkStyle: styles.watermarkStyle,
      exportWatermarkText: styles.watermarkText,
      exportClassification: styles.classification,
      exportPageSize: styles.pageSize,
      exportOrientation: styles.orientation,
      exportCoverBackground: styles.coverBackground,
      exportCoverOverlay: styles.coverOverlay,
      exportCoverFont: styles.coverFont,
      exportImageQuality: styles.imageQuality
    })
    toast.success('Export defaults saved for next time')
  }

  const handleExport = async () => {
    if (!document) return
    if (format === 'pdf' && protectPdf) {
      if (pdfPassword.length < 4) {
        toast.error('PDF password must be at least 4 characters')
        return
      }
      if (pdfPassword !== pdfPasswordConfirm) {
        toast.error('PDF passwords do not match')
        return
      }
    }

    setExporting(true)
    setLastPath(null)
    try {
      if (onBeforeExport) await onBeforeExport()

      const payload: ExportOptions = {
        documentId: document.id,
        format,
        ...options,
        coverStyle: styles.coverStyle,
        tocStyle: styles.tocStyle,
        pageNumberStyle: styles.pageNumberStyle,
        headerFooterStyle: styles.headerFooterStyle,
        coverAccent: styles.coverAccent,
        coverSubtitle: styles.coverSubtitle,
        preparedBy: styles.preparedBy,
        watermarkStyle: styles.watermarkStyle,
        watermarkText: styles.watermarkText,
        classification: styles.classification,
        pageSize: styles.pageSize,
        orientation: styles.orientation,
        coverBackground: styles.coverBackground,
        coverOverlay: styles.coverOverlay,
        coverFont: styles.coverFont,
        imageQuality: styles.imageQuality,
        pdfPassword: format === 'pdf' && protectPdf ? pdfPassword : undefined
      }

      const result = await window.electronAPI.export.document(payload)
      if (result.success && result.data?.filePath) {
        setLastPath(result.data.filePath)
        toast.success(`Exported ${format.toUpperCase()} successfully`)
      } else if (result.data?.error === 'Export cancelled') {
        // user cancelled save dialog
      } else {
        toast.error(result.error ?? result.data?.error ?? 'Export failed')
      }
    } catch (e) {
      console.error(e)
      toast.error('Export failed')
    } finally {
      setExporting(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[94vh] max-h-[94vh] w-[98vw] max-w-[1680px] flex-col gap-0 overflow-hidden p-0 sm:rounded-2xl">
        {document && (
          <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_400px]">
            <div className="flex min-h-0 flex-col border-b border-border bg-muted/40 lg:border-b-0 lg:border-r">
              <DialogHeader className="shrink-0 px-7 pb-3 pt-6 text-left">
                <DialogTitle className="text-xl">Export Preview</DialogTitle>
                <DialogDescription>
                  A live, to-scale preview of your {format.toUpperCase()} using the{' '}
                  <span className="font-medium text-foreground">{themeLabel}</span> theme
                  {styles.coverStyle !== 'modern' && options.includeCoverPage
                    ? ` and ${styles.coverStyle} cover`
                    : ''}
                  .
                </DialogDescription>
              </DialogHeader>

              <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-y border-border/60 bg-background/60 px-7 py-2.5">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="rounded-full border border-border bg-card px-2 py-0.5 font-medium text-foreground">
                    {typeLabel}
                  </span>
                  <span className="rounded-full border border-border bg-card px-2 py-0.5">
                    {themeLabel}
                  </span>
                  <span className="rounded-full border border-border bg-card px-2 py-0.5">
                    {layoutLabel}
                  </span>
                  <span className="rounded-full border border-border bg-card px-2 py-0.5">
                    {pageSize.electron}
                  </span>
                  <span className="rounded-full border border-border bg-card px-2 py-0.5">
                    {styles.orientation === 'landscape' ? 'Landscape' : 'Portrait'}
                  </span>
                  <span className="hidden sm:inline">·</span>
                  <span>{stats.words.toLocaleString()} words</span>
                  <span>·</span>
                  <span>~{stats.pages} pages</span>
                </div>
                <div className="flex items-center gap-0.5 rounded-lg border border-border bg-card p-0.5">
                  <button
                    type="button"
                    onClick={() => setUserZoom(clamp(zoom - 0.1, 0.4, 2))}
                    className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    aria-label="Zoom out"
                  >
                    <ZoomOut className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setUserZoom(null)}
                    className="min-w-[3.25rem] rounded-md px-1.5 text-center text-xs font-medium tabular-nums text-foreground transition-colors hover:bg-accent"
                    title="Reset to fit width"
                  >
                    {zoomPercent}%
                  </button>
                  <button
                    type="button"
                    onClick={() => setUserZoom(clamp(zoom + 0.1, 0.4, 2))}
                    className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    aria-label="Zoom in"
                  >
                    <ZoomIn className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setUserZoom(null)}
                    className={cn(
                      'flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-accent hover:text-foreground',
                      userZoom === null ? 'text-primary' : 'text-muted-foreground'
                    )}
                    aria-label="Fit to width"
                    title="Fit to width"
                  >
                    <Maximize2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto px-8 py-6">
                <div className="mx-auto w-fit" style={{ zoom } as React.CSSProperties}>
                  <div className="flex flex-col items-center gap-8">
                    {options.includeCoverPage && (
                      <CoverPagePreview
                        width={pageSize.widthPx}
                        height={pageSize.heightPx}
                        style={styles.coverStyle}
                        accent={coverAccent}
                        heading1Color={theme.heading1Color}
                        bg={theme.bg}
                        text={theme.text}
                        muted={theme.heading3Color}
                        fontFamily={coverFont}
                        h1Size={theme.h1Size}
                        companyName={companyName}
                        companyLogo={companyLogo}
                        showLogo={!!options.includeLogo}
                        projectName={projectName}
                        title={document.title}
                        typeLabel={typeLabel}
                        subtitle={styles.coverSubtitle}
                        preparedBy={styles.preparedBy}
                        themeLabel={themeLabel}
                        dateLabel={dateLabel}
                        backgroundImage={styles.coverBackground}
                        overlay={styles.coverOverlay}
                      />
                    )}

                    <div
                      className="relative overflow-hidden rounded-sm shadow-lg ring-1 ring-black/5"
                      style={{
                        width: pageSize.widthPx,
                        minHeight: pageSize.heightPx,
                        background: theme.bg
                      }}
                    >
                      {classificationMeta && (
                        <div
                          className="text-center text-[10px] font-bold uppercase tracking-[0.18em]"
                          style={{
                            color: classificationMeta.color,
                            background: classificationMeta.background
                          }}
                        >
                          {classificationMeta.label}
                        </div>
                      )}
                      {watermarkText && (
                        <div
                          className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center text-[56px] font-extrabold uppercase tracking-[0.18em] text-slate-900 opacity-[0.085]"
                          style={{ transform: 'rotate(-32deg)' }}
                        >
                          {watermarkText}
                        </div>
                      )}
                      <div
                        className="document-page-content tiptap relative"
                        data-doc-theme={theme.id}
                        data-heading-style={document?.pageSettings?.headingStyle}
                        data-page-border={document?.pageSettings?.pageBorder}
                        data-paragraph-spacing={document?.pageSettings?.paragraphSpacing}
                        style={appearanceStyle as React.CSSProperties}
                      >
                        {options.includeHeaderFooter && (
                          <div
                            className={cn(
                              'mb-6 flex items-center justify-between pb-2 text-[11px] uppercase tracking-wide',
                              styles.headerFooterStyle === 'branded'
                                ? '-mx-4 rounded-md border-0 px-4 py-2 text-white'
                                : 'border-b'
                            )}
                            style={{
                              borderColor: '#e5e7eb',
                              color:
                                styles.headerFooterStyle === 'branded'
                                  ? '#ffffff'
                                  : theme.heading3Color,
                              background:
                                styles.headerFooterStyle === 'branded'
                                  ? theme.accentColor
                                  : undefined
                            }}
                          >
                            <span className="flex min-w-0 items-center gap-3">
                              {companyLogo && options.includeLogo && (
                                <img
                                  src={companyLogo}
                                  alt=""
                                  className="max-h-8 max-w-24 shrink-0 object-contain"
                                />
                              )}
                              <span className="truncate">{projectName}</span>
                            </span>
                            <span className="truncate pl-4">{document.title}</span>
                          </div>
                        )}

                        {options.includeTableOfContents && (
                          <div className="mb-8">
                            <h2 style={{ color: theme.heading2Color, borderBottom: 'none' }}>
                              Table of Contents
                            </h2>
                            {toc.length > 0 ? (
                              <div
                                className={cn(
                                  'mt-2',
                                  styles.tocStyle === 'compact' ? 'space-y-0.5' : 'space-y-1.5'
                                )}
                              >
                                {toc.map((h, i) => (
                                  <div
                                    key={`${h.text}-${i}`}
                                    className={cn(
                                      'flex items-baseline gap-2 text-sm',
                                      h.level === 2 && 'pl-4'
                                    )}
                                    style={{ color: theme.text }}
                                  >
                                    <span className="truncate">
                                      {styles.tocStyle === 'numbered' && `${i + 1}. `}
                                      {h.text}
                                    </span>
                                    <span
                                      className="mx-1 flex-1 self-center border-b border-dotted"
                                      style={{ borderColor: `${theme.heading3Color}66` }}
                                    />
                                    <span style={{ color: theme.heading3Color }}>
                                      {i + 1 + (options.includeCoverPage ? 1 : 0)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="mt-2 text-sm" style={{ color: theme.heading3Color }}>
                                Headings will be listed here.
                              </p>
                            )}
                          </div>
                        )}

                        {previewHtml ? (
                          <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
                        ) : (
                          <p style={{ color: theme.heading3Color }}>
                            This document has no content yet. Add content in the editor to see it
                            here.
                          </p>
                        )}

                        {options.includePageNumbers && (
                          <p
                            className="mt-10 border-t pt-3 text-center text-xs"
                            style={{ borderColor: '#e5e7eb', color: theme.heading3Color }}
                          >
                            {styles.pageNumberStyle === 'number'
                              ? options.includeCoverPage
                                ? 2
                                : 1
                              : styles.pageNumberStyle === 'page'
                                ? `Page ${options.includeCoverPage ? 2 : 1}`
                                : `Page ${options.includeCoverPage ? 2 : 1} of ${stats.pages}`}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex min-h-0 flex-col overflow-y-auto bg-card p-6">
              <div className="mb-5">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Export format
                </p>
                <div className="mt-2.5 grid grid-cols-2 gap-2">
                  <FormatOption
                    active={format === 'pdf'}
                    onClick={() => setFormat('pdf')}
                    icon={FileText}
                    label="PDF"
                    desc="Print-ready"
                  />
                  <FormatOption
                    active={format === 'docx'}
                    onClick={() => setFormat('docx')}
                    icon={FileType}
                    label="DOCX"
                    desc="Editable Word"
                  />
                </div>
              </div>

              <div className="mb-5">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Page size
                </p>
                <div className="mt-2.5 grid grid-cols-2 gap-2">
                  <FormatOption
                    active={styles.pageSize === 'letter'}
                    onClick={() => setStyles((current) => ({ ...current, pageSize: 'letter' }))}
                    icon={RectangleHorizontal}
                    label="Letter"
                    desc="8.5 × 11 in"
                  />
                  <FormatOption
                    active={styles.pageSize === 'a4'}
                    onClick={() => setStyles((current) => ({ ...current, pageSize: 'a4' }))}
                    icon={RectangleHorizontal}
                    label="A4"
                    desc="210 × 297 mm"
                  />
                  <FormatOption
                    active={styles.orientation === 'portrait'}
                    onClick={() =>
                      setStyles((current) => ({ ...current, orientation: 'portrait' }))
                    }
                    icon={RectangleVertical}
                    label="Portrait"
                    desc="Tall page"
                  />
                  <FormatOption
                    active={styles.orientation === 'landscape'}
                    onClick={() =>
                      setStyles((current) => ({ ...current, orientation: 'landscape' }))
                    }
                    icon={RectangleHorizontal}
                    label="Landscape"
                    desc="Wide page"
                  />
                </div>
              </div>

              <div className="mb-5 space-y-1">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Cover & formatting
                  </p>
                  <button
                    type="button"
                    className="text-[10px] font-medium text-primary hover:underline"
                    onClick={() => setAllOptions(!allOptionsSelected)}
                  >
                    {allOptionsSelected ? 'Clear all' : 'Select all'}
                  </button>
                </div>
                <OptionToggle
                  icon={Building2}
                  label="Cover page"
                  description="Title page with project branding"
                  checked={!!options.includeCoverPage}
                  onChange={() => toggle('includeCoverPage')}
                />
                {options.includeCoverPage && (
                  <div className="mb-3 ml-8 space-y-3 rounded-xl border border-border/70 bg-muted/30 p-3">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      Cover design
                    </p>
                    <CoverStylePicker
                      value={styles.coverStyle}
                      accent={coverAccent}
                      onChange={(coverStyle) =>
                        setStyles((current) => ({ ...current, coverStyle }))
                      }
                    />
                    <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      Accent color
                    </p>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {COVER_ACCENT_PRESETS.map((preset) => {
                        const swatch = preset.value || theme.accentColor
                        const selected =
                          preset.value === ''
                            ? !styles.coverAccent
                            : styles.coverAccent.toLowerCase() === preset.value
                        return (
                          <button
                            key={preset.id}
                            type="button"
                            title={preset.label}
                            onClick={() =>
                              setStyles((current) => ({ ...current, coverAccent: preset.value }))
                            }
                            className={cn(
                              'h-5 w-5 rounded-full border border-black/10',
                              selected && 'ring-2 ring-primary ring-offset-1 ring-offset-background'
                            )}
                            style={{ background: swatch }}
                          />
                        )
                      })}
                      <label className="relative h-5 w-5 overflow-hidden rounded-full border border-dashed border-border">
                        <input
                          type="color"
                          value={coverAccent}
                          onChange={(event) =>
                            setStyles((current) => ({
                              ...current,
                              coverAccent: event.target.value
                            }))
                          }
                          className="absolute inset-0 cursor-pointer opacity-0"
                          aria-label="Custom cover accent"
                        />
                        <span className="flex h-full w-full items-center justify-center text-[8px] text-muted-foreground">
                          +
                        </span>
                      </label>
                    </div>
                    <OptionToggle
                      icon={ImageIcon}
                      label="Company logo"
                      description={
                        companyLogo ? 'Show logo on the cover' : 'Add a logo in project settings'
                      }
                      checked={!!options.includeLogo}
                      onChange={() => toggle('includeLogo')}
                    />
                    <Input
                      value={styles.coverSubtitle}
                      onChange={(event) =>
                        setStyles((current) => ({ ...current, coverSubtitle: event.target.value }))
                      }
                      placeholder="Optional subtitle"
                      className="h-8 px-2.5 text-xs"
                    />
                    <Input
                      value={styles.preparedBy}
                      onChange={(event) =>
                        setStyles((current) => ({ ...current, preparedBy: event.target.value }))
                      }
                      placeholder="Prepared by"
                      className="h-8 px-2.5 text-xs"
                    />
                    <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      Typeface
                    </p>
                    <StyleSelector
                      value={styles.coverFont}
                      options={COVER_FONTS.map((font) => [font.value, font.label])}
                      onChange={(coverFont) => setStyles((current) => ({ ...current, coverFont }))}
                    />
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        Background image
                      </p>
                      {styles.coverBackground && (
                        <button
                          type="button"
                          className="text-[10px] font-medium text-primary hover:underline"
                          onClick={() =>
                            setStyles((current) => ({ ...current, coverBackground: '' }))
                          }
                        >
                          Remove
                        </button>
                      )}
                    </div>
                    <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-border px-2 py-1.5 hover:bg-muted/60">
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="hidden"
                        onChange={(event) => {
                          const file = event.target.files?.[0]
                          event.target.value = ''
                          if (!file) return
                          void readCoverBackground(file)
                            .then((coverBackground) =>
                              setStyles((current) => ({ ...current, coverBackground }))
                            )
                            .catch(() => toast.error('Could not read this image'))
                        }}
                      />
                      {styles.coverBackground ? (
                        <img
                          src={styles.coverBackground}
                          alt=""
                          className="h-8 w-12 rounded-sm object-cover"
                        />
                      ) : (
                        <Upload className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                      <span className="text-[10px] text-muted-foreground">
                        {styles.coverBackground ? 'Replace photo' : 'Upload a cover photo'}
                      </span>
                    </label>
                    {styles.coverBackground && (
                      <label className="block space-y-1">
                        <span className="text-[10px] text-muted-foreground">
                          Overlay {styles.coverOverlay}%
                        </span>
                        <input
                          type="range"
                          min={0}
                          max={80}
                          value={styles.coverOverlay}
                          onChange={(event) =>
                            setStyles((current) => ({
                              ...current,
                              coverOverlay: Number(event.target.value)
                            }))
                          }
                          className="w-full accent-primary"
                        />
                      </label>
                    )}
                  </div>
                )}
                <OptionToggle
                  icon={List}
                  label="Table of contents"
                  description="Auto-generated from document headings"
                  checked={!!options.includeTableOfContents}
                  onChange={() => toggle('includeTableOfContents')}
                />
                {options.includeTableOfContents && (
                  <StyleSelector
                    value={styles.tocStyle}
                    options={[
                      ['classic', 'Classic'],
                      ['compact', 'Compact'],
                      ['numbered', 'Numbered']
                    ]}
                    onChange={(tocStyle) =>
                      setStyles((current) => ({ ...current, tocStyle: tocStyle as ExportTocStyle }))
                    }
                  />
                )}
                <OptionToggle
                  icon={Hash}
                  label="Page numbers"
                  description="Numbered pages in footer"
                  checked={!!options.includePageNumbers}
                  onChange={() => toggle('includePageNumbers')}
                />
                {options.includePageNumbers && (
                  <StyleSelector
                    value={styles.pageNumberStyle}
                    options={[
                      ['page-total', 'Page 1 of 8'],
                      ['page', 'Page 1'],
                      ['number', '1']
                    ]}
                    onChange={(pageNumberStyle) =>
                      setStyles((current) => ({
                        ...current,
                        pageNumberStyle: pageNumberStyle as ExportPageNumberStyle
                      }))
                    }
                  />
                )}
                <OptionToggle
                  icon={AlignLeft}
                  label="Headers & footers"
                  description="Project name and document title"
                  checked={!!options.includeHeaderFooter}
                  onChange={() => toggle('includeHeaderFooter')}
                />
                {options.includeHeaderFooter && (
                  <StyleSelector
                    value={styles.headerFooterStyle}
                    options={[
                      ['standard', 'Standard'],
                      ['minimal', 'Minimal'],
                      ['branded', 'Branded']
                    ]}
                    onChange={(headerFooterStyle) =>
                      setStyles((current) => ({
                        ...current,
                        headerFooterStyle: headerFooterStyle as ExportHeaderFooterStyle
                      }))
                    }
                  />
                )}
                <OptionToggle
                  icon={Stamp}
                  label="Watermark"
                  description="Diagonal draft or confidential mark"
                  checked={!!options.includeWatermark}
                  onChange={() => toggle('includeWatermark')}
                />
                {options.includeWatermark && (
                  <div className="space-y-1.5">
                    <StyleSelector
                      value={styles.watermarkStyle}
                      options={[
                        ['confidential', 'Confidential'],
                        ['draft', 'Draft'],
                        ['internal', 'Internal']
                      ]}
                      onChange={(watermarkStyle) =>
                        setStyles((current) => ({
                          ...current,
                          watermarkStyle: watermarkStyle as ExportWatermarkStyle
                        }))
                      }
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setStyles((current) => ({ ...current, watermarkStyle: 'custom' }))
                      }
                      className={cn(
                        'ml-8 w-[calc(100%-2rem)] rounded-md px-2 py-1.5 text-left text-[11px] font-medium',
                        styles.watermarkStyle === 'custom'
                          ? 'bg-background text-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      Custom text
                    </button>
                    {styles.watermarkStyle === 'custom' && (
                      <Input
                        value={styles.watermarkText}
                        onChange={(event) =>
                          setStyles((current) => ({
                            ...current,
                            watermarkText: event.target.value
                          }))
                        }
                        placeholder="e.g. CLIENT REVIEW"
                        className="ml-8 h-8 w-[calc(100%-2rem)] px-2.5 text-xs"
                      />
                    )}
                  </div>
                )}
                <OptionToggle
                  icon={Shield}
                  label="Classification banner"
                  description="Label at the top of every page"
                  checked={styles.classification !== 'none'}
                  onChange={() =>
                    setStyles((current) => ({
                      ...current,
                      classification: current.classification === 'none' ? 'confidential' : 'none'
                    }))
                  }
                />
                {styles.classification !== 'none' && (
                  <StyleSelector
                    value={styles.classification}
                    options={[
                      ['confidential', 'Confidential'],
                      ['internal', 'Internal'],
                      ['draft', 'Draft']
                    ]}
                    onChange={(classification) =>
                      setStyles((current) => ({
                        ...current,
                        classification: classification as ExportClassification
                      }))
                    }
                  />
                )}
                <div className="px-1.5 py-2">
                  <p className="flex items-center gap-2 text-xs font-medium">
                    <ImageDown className="h-3.5 w-3.5 text-muted-foreground" />
                    Image quality
                  </p>
                  <p className="mb-1.5 pl-6 text-[10px] leading-snug text-muted-foreground">
                    Compress photos in the exported file
                  </p>
                  <StyleSelector
                    value={styles.imageQuality}
                    options={[
                      ['high', 'High'],
                      ['standard', 'Standard'],
                      ['compact', 'Compact']
                    ]}
                    onChange={(imageQuality) =>
                      setStyles((current) => ({
                        ...current,
                        imageQuality: imageQuality as ExportImageQuality
                      }))
                    }
                  />
                </div>
                {format === 'pdf' && (
                  <>
                    <OptionToggle
                      icon={Lock}
                      label="Password protect PDF"
                      description="Require a password to open the file"
                      checked={protectPdf}
                      onChange={() => setProtectPdf((value) => !value)}
                    />
                    {protectPdf && (
                      <div className="ml-8 space-y-2">
                        <Input
                          type="password"
                          value={pdfPassword}
                          onChange={(event) => setPdfPassword(event.target.value)}
                          placeholder="Password"
                          className="h-8 px-2.5 text-xs"
                          autoComplete="new-password"
                        />
                        <Input
                          type="password"
                          value={pdfPasswordConfirm}
                          onChange={(event) => setPdfPasswordConfirm(event.target.value)}
                          placeholder="Confirm password"
                          className="h-8 px-2.5 text-xs"
                          autoComplete="new-password"
                        />
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className="mt-auto space-y-3 border-t border-border pt-4">
                {lastPath && (
                  <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-200">
                    <Check className="mb-1 inline h-3.5 w-3.5" /> Saved to: {lastPath}
                  </div>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-xs"
                  onClick={() => void saveAsDefault()}
                >
                  <Save className="h-3.5 w-3.5" />
                  Save selection as default
                </Button>
                <DialogFooter className="flex-col gap-2.5 sm:flex-col">
                  <Button className="h-10 w-full" onClick={handleExport} disabled={exporting}>
                    {exporting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" /> Exporting…
                      </>
                    ) : (
                      <>Export {format.toUpperCase()}</>
                    )}
                  </Button>
                  <Button variant="outline" className="w-full" onClick={() => onOpenChange(false)}>
                    Cancel
                  </Button>
                </DialogFooter>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function FormatOption({
  active,
  onClick,
  icon: Icon,
  label,
  desc
}: {
  active: boolean
  onClick: () => void
  icon: React.ComponentType<{ className?: string }>
  label: string
  desc: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-2.5 rounded-xl border p-2.5 text-left transition-colors',
        active ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border hover:bg-muted'
      )}
    >
      <Icon className={cn('h-5 w-5 shrink-0', active ? 'text-primary' : 'text-muted-foreground')} />
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        <span className="block truncate text-[11px] text-muted-foreground">{desc}</span>
      </span>
    </button>
  )
}

function StyleSelector({
  value,
  options,
  onChange
}: {
  value: string
  options: Array<[value: string, label: string]>
  onChange: (value: string) => void
}) {
  return (
    <div className="ml-8 grid grid-cols-3 gap-1.5 rounded-xl bg-muted/50 p-1.5">
      {options.map(([optionValue, label]) => (
        <button
          key={optionValue}
          type="button"
          onClick={() => onChange(optionValue)}
          className={cn(
            'min-w-0 truncate rounded-md px-2 py-1.5 text-[11px] font-medium transition-colors',
            value === optionValue
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
          title={label}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

function OptionToggle({
  icon: Icon,
  label,
  description,
  checked,
  onChange
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  description: string
  checked: boolean
  onChange: () => void
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      className="flex w-full items-start gap-2.5 rounded-xl px-2 py-2.5 text-left hover:bg-muted/60"
      aria-pressed={checked}
    >
      <div
        className={cn(
          'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border',
          checked ? 'border-primary bg-primary text-primary-foreground' : 'border-border'
        )}
      >
        {checked && <Check className="h-3.5 w-3.5" />}
      </div>
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-[11px] leading-snug text-muted-foreground">{description}</p>
      </div>
    </button>
  )
}
