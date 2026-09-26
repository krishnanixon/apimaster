import { getDocumentDisplayHtml } from '@/shared/lib/html-utils'
import { cn } from '@/shared/lib/utils'
import {
  getDocumentAppearanceStyle,
  type DocumentPadding,
  type DocumentThemeId
} from '@shared/lib/document-theme'

interface DocumentHtmlPreviewProps {
  htmlContent?: string
  content?: string
  className?: string
  scale?: number
  emptyText?: string
  pageTheme?: DocumentThemeId
  pagePadding?: DocumentPadding
}

export function DocumentHtmlPreview({
  htmlContent,
  content,
  className,
  scale = 0.28,
  emptyText = 'Empty document',
  pageTheme = 'professional',
  pagePadding
}: DocumentHtmlPreviewProps) {
  const html = getDocumentDisplayHtml({ htmlContent, content })
  const appearanceStyle = getDocumentAppearanceStyle(pageTheme, pagePadding)

  if (!html) {
    return (
      <div
        className={cn(
          'flex h-full min-h-[120px] items-center justify-center p-4 text-center text-[10px] text-neutral-400',
          className
        )}
        style={appearanceStyle}
      >
        {emptyText}
      </div>
    )
  }

  const inverseScale = 1 / scale

  return (
    <div
      className={cn('document-card-preview relative overflow-hidden', className)}
      style={appearanceStyle}
      data-doc-theme={pageTheme}
    >
      <div
        className="document-page-content tiptap pointer-events-none origin-top-left select-none"
        data-doc-theme={pageTheme}
        style={{
          transform: `scale(${scale})`,
          width: `${inverseScale * 100}%`,
          minHeight: `${inverseScale * 120}px`
        }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  )
}
