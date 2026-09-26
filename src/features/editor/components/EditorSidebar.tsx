import {
  FileText,
  Sparkles,
  ListTree,
  Palette,
  Eye,
  LayoutTemplate,
  FileOutput,
  Clock,
  Hash,
  AlignLeft,
  Layout,
  Brain,
  Bookmark,
  MessageSquare
} from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Badge } from '@/shared/components/ui/badge'
import { Input } from '@/shared/components/ui/input'
import { AIDocumentEditPanel } from '@/features/documents/components/AIDocumentEditPanel'
import { DocumentOutline, type OutlineItem } from '@/features/editor/components/DocumentOutline'
import { CommentPanel } from '@/features/editor/components/CommentPanel'
import {
  DOCUMENT_THEMES,
  LAYOUT_PRESETS,
  getDocumentTheme,
  type DocumentThemeId,
  type LayoutPresetId,
  type DocumentPadding
} from '@/features/editor/lib/editor-colors'
import { PAGE_SIZE_OPTIONS, DEFAULT_PAGE_SETTINGS } from '@shared/lib/document-page'
import { WordScreenTip } from '@/features/editor/components/WordScreenTip'
import { DOCUMENT_TYPE_LABELS, formatRelativeTime, cn } from '@/shared/lib/utils'
import {
  DOCUMENT_STATUSES,
  DOCUMENT_STATUS_LABELS,
  DOCUMENT_STATUS_STYLES
} from '@/features/documents/lib/document-meta'
import type {
  Document,
  DocumentComment,
  DocumentPageSettings,
  DocumentStatus,
  DocumentType,
  PageOrientation,
  PageSizeId
} from '@shared/types'
import { analyzeDocumentQuality } from '@/features/editor/lib/document-quality'

type SidebarTab = 'details' | 'outline' | 'ai' | 'theme' | 'comments'

interface EditorSidebarProps {
  activeTab: SidebarTab
  onTabChange: (tab: SidebarTab) => void
  document: Document
  title: string
  htmlContent: string
  wordCount: number
  sectionCount: number
  readingTime: number
  templateSections?: string[]
  pageTheme: DocumentThemeId
  layoutPreset: LayoutPresetId
  padding: DocumentPadding
  onPageThemeChange: (theme: DocumentThemeId, resetDesign?: boolean) => void
  onLayoutPresetChange: (preset: LayoutPresetId, padding: DocumentPadding) => void
  onPaddingChange: (padding: DocumentPadding, preset: LayoutPresetId) => void
  onAIEdit: (instruction: string, sectionTitle?: string) => Promise<void>
  aiProcessing: boolean
  aiDraft?: string
  onAIDraftChange?: (value: string) => void
  onFullPreview: () => void
  onSaveTemplate: () => void
  onExport: () => void
  onStatusChange: (status: DocumentStatus) => void
  onTagsChange: (tags: string[]) => void
  onExtractKnowledge: () => void
  extractingKnowledge?: boolean
  onNavigateHeading?: (text: string, item: OutlineItem, occurrence: number) => void
  onAddComment?: () => void
  openCommentCount?: number
  onInsertMissingSections?: (titles: string[]) => void
  onTypeChange?: (type: DocumentType) => void
  onJumpPlaceholder?: () => void
  pageSettings: DocumentPageSettings
  onPageSettingsChange: (settings: DocumentPageSettings) => void
  comments: DocumentComment[]
  activeCommentId?: string | null
  onSelectComment: (id: string) => void
  onReplyComment: (id: string, body: string) => void
  onResolveComment: (id: string) => void
  onReopenComment: (id: string) => void
  onDeleteComment: (id: string) => void
}

const TABS: { id: SidebarTab; icon: typeof FileText; label: string; description: string }[] = [
  {
    id: 'details',
    icon: FileText,
    label: 'Details',
    description: 'Document properties, status, and tags.'
  },
  {
    id: 'outline',
    icon: ListTree,
    label: 'Outline',
    description: 'Jump to headings in this document.'
  },
  {
    id: 'comments',
    icon: MessageSquare,
    label: 'Review',
    description: 'Read, reply to, and resolve comments.'
  },
  {
    id: 'ai',
    icon: Sparkles,
    label: 'AI',
    description: 'Rewrite, summarize, and generate with AI.'
  },
  {
    id: 'theme',
    icon: Palette,
    label: 'Layout',
    description: 'Page size, headers, theme, and margins.'
  }
]

const PADDING_SLIDERS: { key: keyof DocumentPadding; label: string }[] = [
  { key: 'top', label: 'Top' },
  { key: 'bottom', label: 'Bottom' },
  { key: 'left', label: 'Left' },
  { key: 'right', label: 'Right' }
]

const DESIGN_ACCENTS = [
  '#2563eb',
  '#4f46e5',
  '#8b5cf6',
  '#db2777',
  '#dc2626',
  '#ea580c',
  '#0d9488',
  '#16a34a'
]
const PAPER_COLORS = ['#ffffff', '#fffef9', '#f8fafc', '#f8fcff', '#fbfdf9', '#fffaf5', '#fdfbff']
const DESIGN_FONTS = [
  { label: 'Theme font', value: '' },
  { label: 'Aptos', value: 'Aptos, Calibri, sans-serif' },
  { label: 'Inter', value: 'Inter, Segoe UI, sans-serif' },
  { label: 'Arial', value: 'Arial, Helvetica, sans-serif' },
  { label: 'Georgia', value: 'Georgia, Times New Roman, serif' },
  { label: 'Garamond', value: 'Garamond, Georgia, serif' },
  { label: 'Times New Roman', value: 'Times New Roman, Times, serif' }
]

export function EditorSidebar({
  activeTab,
  onTabChange,
  document,
  title,
  htmlContent,
  wordCount,
  sectionCount,
  readingTime,
  templateSections,
  pageTheme,
  layoutPreset,
  padding,
  onPageThemeChange,
  onLayoutPresetChange,
  onPaddingChange,
  onAIEdit,
  aiProcessing,
  aiDraft,
  onAIDraftChange,
  onFullPreview,
  onSaveTemplate,
  onExport,
  onStatusChange,
  onTagsChange,
  onExtractKnowledge,
  extractingKnowledge = false,
  onNavigateHeading,
  onAddComment,
  openCommentCount = 0,
  onInsertMissingSections,
  onTypeChange,
  onJumpPlaceholder,
  pageSettings = DEFAULT_PAGE_SETTINGS,
  onPageSettingsChange,
  comments = [],
  activeCommentId,
  onSelectComment,
  onReplyComment,
  onResolveComment,
  onReopenComment,
  onDeleteComment
}: EditorSidebarProps) {
  const activeTheme = getDocumentTheme(pageTheme)
  const qualityIssues = analyzeDocumentQuality(htmlContent)
  const missingSections = (templateSections ?? []).filter(
    (section) =>
      !htmlContent.toLowerCase().includes(`>${section.toLowerCase()}<`) &&
      !htmlContent.toLowerCase().includes(section.toLowerCase())
  )

  return (
    <aside className="flex h-full w-[18.5rem] shrink-0 flex-col border-l border-border/70 bg-card">
      <div className="m-1.5 grid grid-cols-5 gap-0.5 rounded-lg bg-muted/50 p-0.5">
        {TABS.map(({ id, icon: Icon, label, description }) => (
          <WordScreenTip key={id} label={label} description={description}>
            <button
              type="button"
              onClick={() => onTabChange(id)}
              className={cn(
                'relative flex w-full flex-col items-center gap-0.5 rounded-md py-1.5 text-[10px] font-medium transition-all',
                activeTab === id
                  ? 'bg-background text-primary shadow-sm'
                  : 'text-muted-foreground hover:bg-background/60 hover:text-foreground'
              )}
            >
              <Icon className="h-4 w-4" />
              {id === 'comments' && openCommentCount > 0 && (
                <span className="absolute right-1 top-1 min-w-[14px] rounded-full bg-primary px-1 text-[9px] leading-4 text-primary-foreground">
                  {openCommentCount}
                </span>
              )}
              {label}
            </button>
          </WordScreenTip>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-3 pt-1.5">
        {activeTab === 'details' && (
          <div className="space-y-4">
            <div>
              <Badge variant="secondary" className="text-[10px]">
                {DOCUMENT_TYPE_LABELS[document.type] ?? document.type}
              </Badge>
              <p className="mt-2 text-xs capitalize text-muted-foreground">
                {activeTheme.label} theme · {document.style} style
              </p>
            </div>

            <div>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Type
              </p>
              <select
                value={document.type}
                disabled={!onTypeChange}
                onChange={(e) => onTypeChange?.(e.target.value as DocumentType)}
                className="h-7 w-full rounded-md border border-input bg-background px-1.5 text-[11px] outline-none"
              >
                {Object.entries(DOCUMENT_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Status
              </p>
              <div className="flex flex-wrap gap-1">
                {DOCUMENT_STATUSES.map((status) => (
                  <button
                    key={status}
                    type="button"
                    onClick={() => onStatusChange(status)}
                    className={cn(
                      'rounded-md border px-1.5 py-0.5 text-[10px]',
                      (document.status ?? 'draft') === status
                        ? DOCUMENT_STATUS_STYLES[status]
                        : 'border-border text-muted-foreground hover:bg-muted/50'
                    )}
                  >
                    {DOCUMENT_STATUS_LABELS[status]}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-1.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                <Bookmark className="h-3 w-3" /> Tags
              </p>
              <Input
                defaultValue={(document.tags ?? []).join(', ')}
                key={document.id + (document.tags ?? []).join(',')}
                placeholder="client, internal, v1"
                className="h-7 text-xs"
                onBlur={(e) => {
                  const tags = e.target.value
                    .split(',')
                    .map((t) => t.trim())
                    .filter(Boolean)
                  onTagsChange(tags)
                }}
              />
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              {[
                { icon: FileText, value: wordCount, label: 'words' },
                { icon: Hash, value: sectionCount, label: 'sections' },
                { icon: AlignLeft, value: readingTime, label: 'min read' },
                { icon: Clock, value: formatRelativeTime(document.updatedAt), label: 'updated' }
              ].map(({ icon: Icon, value, label }) => (
                <div
                  key={label}
                  className="rounded-md border border-border/70 bg-muted/25 px-2 py-1.5"
                >
                  <Icon className="mb-0.5 h-3 w-3 text-muted-foreground" />
                  <p className="text-xs font-semibold leading-none">{value}</p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">{label}</p>
                </div>
              ))}
            </div>

            {qualityIssues.length > 0 && (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
                  Writing checks
                </p>
                <ul className="mt-1.5 space-y-1">
                  {qualityIssues.map((issue) => (
                    <li key={issue.id} className="text-[11px] text-muted-foreground">
                      <span className="font-medium text-foreground">{issue.count}</span>{' '}
                      {issue.label}
                      <span className="block text-[10px]">{issue.hint}</span>
                    </li>
                  ))}
                </ul>
                {onJumpPlaceholder &&
                  qualityIssues.some((issue) => issue.id === 'placeholders') && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2 h-7 w-full justify-start text-[11px]"
                      onClick={onJumpPlaceholder}
                    >
                      Next placeholder
                    </Button>
                  )}
              </div>
            )}

            {templateSections && templateSections.length > 0 && (
              <div className="rounded-md border border-border bg-muted/20 p-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Template sections
                </p>
                <ul className="mt-1.5 space-y-0.5">
                  {templateSections.map((s) => (
                    <li key={s} className="text-[11px] text-muted-foreground">
                      · {s}
                    </li>
                  ))}
                </ul>
                {missingSections.length > 0 && onInsertMissingSections && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2 h-7 w-full justify-start text-[11px]"
                    onClick={() => onInsertMissingSections(missingSections)}
                  >
                    Insert {missingSections.length} missing
                  </Button>
                )}
              </div>
            )}

            <div className="space-y-1">
              <Button
                variant="outline"
                size="sm"
                className="h-7 w-full justify-start text-[11px]"
                onClick={onFullPreview}
              >
                <Eye className="h-3.5 w-3.5" /> Full preview
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 w-full justify-start text-[11px]"
                onClick={onSaveTemplate}
              >
                <LayoutTemplate className="h-3.5 w-3.5" /> Save as template
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 w-full justify-start text-[11px]"
                onClick={onExport}
              >
                <FileOutput className="h-3.5 w-3.5" /> Export PDF / DOCX
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 w-full justify-start text-[11px]"
                onClick={onExtractKnowledge}
                disabled={extractingKnowledge}
              >
                <Brain className="h-3.5 w-3.5" />{' '}
                {extractingKnowledge ? 'Extracting…' : 'Extract to Knowledge'}
              </Button>
            </div>
          </div>
        )}

        {activeTab === 'outline' && (
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">Document outline</p>
            <DocumentOutline html={htmlContent} onNavigate={onNavigateHeading} />
          </div>
        )}

        {activeTab === 'comments' && (
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">Review comments</p>
            <CommentPanel
              comments={comments}
              activeId={activeCommentId}
              onAddComment={onAddComment}
              onSelect={onSelectComment}
            onReply={onReplyComment}
            onResolve={onResolveComment}
            onReopen={onReopenComment}
            onDelete={onDeleteComment}
            />
          </div>
        )}

        {activeTab === 'ai' && (
          <AIDocumentEditPanel
            onApply={onAIEdit}
            isProcessing={aiProcessing}
            instruction={aiDraft}
            onInstructionChange={onAIDraftChange}
            htmlContent={htmlContent}
          />
        )}

        {activeTab === 'theme' && (
          <div className="space-y-5">
            <div>
              <p className="mb-1 text-xs font-medium">Document theme</p>
              <p className="mb-2 text-[10px] text-muted-foreground">
                Applied in editor and exported to PDF / DOCX
              </p>
              <div className="grid grid-cols-2 gap-1.5">
                {(DOCUMENT_THEMES ?? []).map((theme) => (
                  <button
                    key={theme.id}
                    type="button"
                    onClick={() => {
                      onPageThemeChange(theme.id, true)
                    }}
                    className={cn(
                      'flex min-w-0 flex-col items-start gap-1 rounded-md border p-1.5 text-left transition-all',
                      pageTheme === theme.id
                        ? 'border-primary/60 bg-primary/5 shadow-sm ring-1 ring-primary/30'
                        : 'border-border/70 hover:border-primary/40 hover:bg-muted/30'
                    )}
                  >
                    <span
                      className="relative h-7 w-full shrink-0 overflow-hidden rounded border border-black/10 shadow-sm"
                      style={{ backgroundColor: theme.bg }}
                    >
                      <span
                        className="absolute left-1.5 right-1.5 top-2 h-1 rounded-full"
                        style={{ backgroundColor: theme.heading1Color }}
                      />
                      <span
                        className="absolute left-1.5 right-2 top-4 h-0.5 rounded-full opacity-70"
                        style={{ backgroundColor: theme.accentColor }}
                      />
                      <span className="absolute left-1.5 right-1.5 top-6 h-px bg-slate-300/80" />
                      <span className="absolute left-1.5 right-3 top-8 h-px bg-slate-300/70" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-medium">{theme.label}</p>
                      <p className="line-clamp-1 text-[9px] text-muted-foreground">
                        {theme.description}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-border/70 bg-muted/15 p-2.5">
              <div className="mb-2 flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium">Colors & typography</p>
                  <p className="text-[9px] text-muted-foreground">Customize the selected theme</p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-1.5 text-[10px]"
                  onClick={() =>
                    onPageSettingsChange({
                      ...pageSettings,
                      accentColor: undefined,
                      pageColor: undefined,
                      textColor: undefined,
                      fontFamily: undefined,
                      bodyFontSize: undefined,
                      lineHeight: undefined,
                      headingStyle: undefined,
                      pageBorder: undefined,
                      paragraphSpacing: undefined
                    })
                  }
                >
                  Reset
                </Button>
              </div>

              <p className="mb-1 text-[10px] font-medium text-muted-foreground">Accent</p>
              <div className="mb-2 flex items-center gap-1">
                {DESIGN_ACCENTS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    aria-label={`Use ${color} accent`}
                    className={cn(
                      'h-5 w-5 rounded-full border border-black/10 shadow-sm transition-transform hover:scale-110',
                      pageSettings.accentColor === color &&
                        'ring-2 ring-primary ring-offset-1 ring-offset-background'
                    )}
                    style={{ backgroundColor: color }}
                    onClick={() => onPageSettingsChange({ ...pageSettings, accentColor: color })}
                  />
                ))}
                <label
                  className="relative ml-auto h-5 w-5 cursor-pointer overflow-hidden rounded-full border border-border bg-[conic-gradient(red,yellow,lime,aqua,blue,magenta,red)]"
                  title="Custom accent color"
                >
                  <input
                    type="color"
                    value={pageSettings.accentColor || activeTheme.accentColor}
                    onChange={(event) =>
                      onPageSettingsChange({ ...pageSettings, accentColor: event.target.value })
                    }
                    className="absolute inset-0 cursor-pointer opacity-0"
                  />
                </label>
              </div>

              <p className="mb-1 text-[10px] font-medium text-muted-foreground">Paper color</p>
              <div className="mb-2 flex items-center gap-1">
                {PAPER_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    aria-label={`Use ${color} page color`}
                    className={cn(
                      'h-5 w-6 rounded border border-black/15 shadow-sm',
                      pageSettings.pageColor === color &&
                        'ring-2 ring-primary ring-offset-1 ring-offset-background'
                    )}
                    style={{ backgroundColor: color }}
                    onClick={() => onPageSettingsChange({ ...pageSettings, pageColor: color })}
                  />
                ))}
                <label className="ml-auto flex items-center gap-1 text-[9px] text-muted-foreground">
                  Text
                  <input
                    type="color"
                    value={pageSettings.textColor || activeTheme.text}
                    onChange={(event) =>
                      onPageSettingsChange({ ...pageSettings, textColor: event.target.value })
                    }
                    className="h-5 w-6 cursor-pointer rounded border border-border bg-transparent p-0"
                  />
                </label>
              </div>

              <div className="grid grid-cols-[1fr_68px] gap-1.5">
                <select
                  aria-label="Document font"
                  value={pageSettings.fontFamily || ''}
                  onChange={(event) =>
                    onPageSettingsChange({
                      ...pageSettings,
                      fontFamily: event.target.value || undefined
                    })
                  }
                  className="h-7 rounded-md border border-input bg-background px-1.5 text-[10px]"
                >
                  {DESIGN_FONTS.map((font) => (
                    <option key={font.label} value={font.value}>
                      {font.label}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Body font size"
                  value={pageSettings.bodyFontSize || ''}
                  onChange={(event) =>
                    onPageSettingsChange({
                      ...pageSettings,
                      bodyFontSize: event.target.value ? Number(event.target.value) : undefined
                    })
                  }
                  className="h-7 rounded-md border border-input bg-background px-1 text-[10px]"
                >
                  <option value="">Size</option>
                  {[10, 11, 12, 13, 14, 15, 16, 18].map((size) => (
                    <option key={size} value={size}>
                      {size} px
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <p className="mb-1 text-xs font-medium">Design details</p>
              <div className="space-y-2">
                <div>
                  <p className="mb-1 text-[10px] text-muted-foreground">Heading treatment</p>
                  <div className="grid grid-cols-4 gap-1">
                    {(['theme', 'accent', 'underline', 'plain'] as const).map((style) => (
                      <button
                        key={style}
                        type="button"
                        onClick={() =>
                          onPageSettingsChange({ ...pageSettings, headingStyle: style })
                        }
                        className={cn(
                          'rounded-md border px-1 py-1.5 text-[9px] capitalize',
                          (pageSettings.headingStyle || 'theme') === style
                            ? 'border-primary bg-primary/5 text-primary'
                            : 'border-border'
                        )}
                      >
                        {style}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="mb-1 text-[10px] text-muted-foreground">Page border</p>
                  <div className="grid grid-cols-3 gap-1">
                    {(['none', 'subtle', 'accent'] as const).map((border) => (
                      <button
                        key={border}
                        type="button"
                        onClick={() =>
                          onPageSettingsChange({ ...pageSettings, pageBorder: border })
                        }
                        className={cn(
                          'rounded-md border px-1 py-1.5 text-[9px] capitalize',
                          (pageSettings.pageBorder || 'none') === border
                            ? 'border-primary bg-primary/5 text-primary'
                            : 'border-border'
                        )}
                      >
                        {border}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="mb-1 text-[10px] text-muted-foreground">Content density</p>
                  <div className="grid grid-cols-3 gap-1">
                    {[
                      { id: 'compact' as const, size: 11.5, line: 1.4 },
                      { id: 'normal' as const, size: 13, line: 1.65 },
                      { id: 'relaxed' as const, size: 14, line: 1.85 }
                    ].map((density) => (
                      <button
                        key={density.id}
                        type="button"
                        onClick={() =>
                          onPageSettingsChange({
                            ...pageSettings,
                            paragraphSpacing: density.id,
                            bodyFontSize: density.size,
                            lineHeight: density.line
                          })
                        }
                        className={cn(
                          'rounded-md border px-1 py-1.5 text-[9px] capitalize',
                          pageSettings.paragraphSpacing === density.id
                            ? 'border-primary bg-primary/5 text-primary'
                            : 'border-border'
                        )}
                      >
                        {density.id}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div>
              <p className="mb-1 text-xs font-medium">Page size</p>
              <div className="grid grid-cols-3 gap-1.5">
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <button
                    key={size.id}
                    type="button"
                    onClick={() =>
                      onPageSettingsChange({ ...pageSettings, pageSize: size.id as PageSizeId })
                    }
                    className={cn(
                      'rounded-md border px-1.5 py-1.5 text-center transition-all',
                      pageSettings.pageSize === size.id
                        ? 'border-primary bg-primary/5 ring-1 ring-primary'
                        : 'border-border hover:border-primary/40'
                    )}
                  >
                    <p className="text-[11px] font-medium">{size.label}</p>
                    <p className="text-[9px] text-muted-foreground">{size.description}</p>
                  </button>
                ))}
              </div>
              <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                {(['portrait', 'landscape'] as PageOrientation[]).map((orientation) => (
                  <button
                    key={orientation}
                    type="button"
                    onClick={() => onPageSettingsChange({ ...pageSettings, orientation })}
                    className={cn(
                      'rounded-md border px-2 py-1.5 text-[11px] capitalize',
                      pageSettings.orientation === orientation
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/40'
                    )}
                  >
                    {orientation}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-1 text-xs font-medium">Header & footer</p>
              <label className="mb-1.5 block text-[10px] text-muted-foreground">
                Header
                <Input
                  value={pageSettings.headerText}
                  onChange={(e) =>
                    onPageSettingsChange({ ...pageSettings, headerText: e.target.value })
                  }
                  placeholder="Company · document title"
                  className="mt-0.5 h-7 text-xs"
                />
              </label>
              <label className="mb-1.5 block text-[10px] text-muted-foreground">
                Footer
                <Input
                  value={pageSettings.footerText}
                  onChange={(e) =>
                    onPageSettingsChange({ ...pageSettings, footerText: e.target.value })
                  }
                  placeholder="Confidential · version"
                  className="mt-0.5 h-7 text-xs"
                />
              </label>
              <label className="flex items-center gap-2 text-[11px]">
                <input
                  type="checkbox"
                  checked={pageSettings.showPageNumbers}
                  onChange={(e) =>
                    onPageSettingsChange({ ...pageSettings, showPageNumbers: e.target.checked })
                  }
                />
                Page numbers
              </label>
              <label className="mt-1 flex items-center gap-2 text-[11px]">
                <input
                  type="checkbox"
                  checked={pageSettings.differentFirstPage}
                  onChange={(e) =>
                    onPageSettingsChange({ ...pageSettings, differentFirstPage: e.target.checked })
                  }
                />
                Different first page
              </label>
            </div>

            <div>
              <p className="mb-1 flex items-center gap-1.5 text-xs font-medium">
                <Layout className="h-3.5 w-3.5" /> Page layout
              </p>
              <p className="mb-2 text-[10px] text-muted-foreground">
                Predefined margins like Microsoft Word
              </p>
              <div className="grid grid-cols-2 gap-1.5">
                {(LAYOUT_PRESETS ?? [])
                  .filter((p) => p.id !== 'custom')
                  .map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => onLayoutPresetChange(preset.id, preset.padding)}
                      className={cn(
                        'rounded-xl border px-2.5 py-2.5 text-left transition-all',
                        layoutPreset === preset.id
                          ? 'border-primary bg-primary/5 ring-1 ring-primary'
                          : 'border-border hover:border-primary/40'
                      )}
                    >
                      <p className="text-[11px] font-medium">{preset.label}</p>
                      <p className="text-[9px] text-muted-foreground">{preset.description}</p>
                    </button>
                  ))}
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-medium">Custom margins (px)</p>
              <div className="space-y-3">
                {PADDING_SLIDERS.map(({ key, label }) => (
                  <div key={key}>
                    <div className="mb-1 flex items-center justify-between text-[10px]">
                      <span className="text-muted-foreground">{label}</span>
                      <span className="font-medium tabular-nums">{padding[key]}px</span>
                    </div>
                    <input
                      type="range"
                      min={24}
                      max={120}
                      step={4}
                      value={padding[key]}
                      onChange={(e) => {
                        const next = { ...padding, [key]: Number(e.target.value) }
                        const preset = LAYOUT_PRESETS.find(
                          (p) =>
                            p.id !== 'custom' &&
                            p.padding.top === next.top &&
                            p.padding.right === next.right &&
                            p.padding.bottom === next.bottom &&
                            p.padding.left === next.left
                        )
                        onPaddingChange(next, preset?.id ?? 'custom')
                      }}
                      className="h-1.5 w-full cursor-pointer accent-primary"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-border px-4 py-2">
        <p className="truncate text-[10px] text-muted-foreground" title={title}>
          {title}
        </p>
      </div>
    </aside>
  )
}

export type { SidebarTab }
