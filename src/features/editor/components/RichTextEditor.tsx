import { useEditor, EditorContent } from '@tiptap/react'
import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, FileText, PanelLeftClose } from 'lucide-react'
import { EditorToolbar } from '@/features/editor/components/EditorToolbar'
import {
  resolveDocumentTheme,
  paddingToCssVars,
  themeToCssVars,
  type DocumentThemeId,
  type DocumentPadding
} from '@/features/editor/lib/editor-colors'
import { cn } from '@/shared/lib/utils'
import { FloatingSelectionToolbar } from '@/features/editor/components/floating/FloatingSelectionToolbar'
import { FloatingImageToolbar } from '@/features/editor/components/floating/FloatingImageToolbar'
import { SlashCommandMenu } from '@/features/editor/components/floating/SlashCommandMenu'
import { InlineAskAIButton } from '@/features/editor/components/floating/InlineAskAIButton'
import { DocumentEditorContextMenu } from '@/features/editor/components/DocumentEditorContextMenu'
import { DocumentOutline } from '@/features/editor/components/DocumentOutline'
import {
  insertHtml,
  missingSectionSnippet,
  navigateToHeading,
  numberHeadings,
  findNextPlaceholder
} from '@/features/editor/lib/insert-snippets'
import {
  createDocumentEditorProps,
  createDocumentExtensions
} from '@/features/editor/extensions/document-extensions'
import {
  extractOutlineFromEditor,
  navigateToOutlineItem,
  type OutlineItem
} from '@/features/editor/lib/document-outline'
import { pageSettingsToCssVars } from '@shared/lib/document-page'
import type { DocumentPageSettings, DocumentStyle, DocumentComment } from '@shared/types'

export interface RichTextEditorHandle {
  insertHtml: (html: string) => void
  insertMissingSections: (titles: string[]) => void
  navigateToHeading: (text: string, occurrence?: number) => void
  navigateToOutlineItem: (item: OutlineItem, occurrence?: number) => void
  replaceDocumentHtml: (html: string) => void
  getSelectionRange: () => { from: number; to: number } | null
  addCommentMark: (commentId: string, range?: { from: number; to: number }) => boolean
  restoreCommentMarks: (comments: DocumentComment[]) => void
  numberHeadings: () => number
  findNextPlaceholder: () => boolean
  getHtml: () => string
  getOutline: () => OutlineItem[]
  getSelectedText: () => string
  selectComment: (commentId: string) => boolean
  unsetComment: (commentId: string) => void
  runCommand: (command: DocumentEditorCommand) => boolean
}

export type DocumentEditorCommand =
  | 'undo'
  | 'redo'
  | 'selectAll'
  | 'bold'
  | 'italic'
  | 'underline'
  | 'strike'
  | 'paragraph'
  | 'heading1'
  | 'heading2'
  | 'heading3'
  | 'bulletList'
  | 'orderedList'
  | 'blockquote'
  | 'horizontalRule'
  | 'table'
  | 'hardBreak'
  | 'clearFormatting'
  | 'link'
  | 'image'

interface RichTextEditorProps {
  content?: string
  onChange?: (content: string, html: string) => void
  placeholder?: string
  editable?: boolean
  className?: string
  documentMode?: boolean
  documentTheme?: DocumentThemeId
  pagePadding?: DocumentPadding
  documentStyle?: DocumentStyle
  pageSettings?: DocumentPageSettings
  onAskAI?: (draft: string) => void
  onAIEditSelection?: (instruction: string, selectedText: string) => Promise<string | null>
  aiProcessing?: boolean
  snippetContext?: { title?: string; projectName?: string; typeLabel?: string; status?: string }
  onAddComment?: () => void
  onCommentSelect?: (commentId: string) => void
  onOpenCommentsPanel?: () => void
  openCommentCount?: number
}

export const RichTextEditor = forwardRef<RichTextEditorHandle, RichTextEditorProps>(
  function RichTextEditor(
    {
      content = '',
      onChange,
      placeholder = 'Start writing, or type / for blocks…',
      editable = true,
      className,
      documentMode = false,
      documentTheme = 'compact',
      pagePadding,
      documentStyle,
      pageSettings,
      onAskAI,
      onAIEditSelection,
      aiProcessing = false,
      snippetContext,
      onAddComment,
      onCommentSelect,
      onOpenCommentsPanel,
      openCommentCount = 0
    },
    ref
  ) {
    const [outline, setOutline] = useState<OutlineItem[]>([])
    const [outlineOpen, setOutlineOpen] = useState(true)
    const themeStyle = useMemo(() => {
      const theme = resolveDocumentTheme(documentTheme, pageSettings)
      const pad = pagePadding ?? { top: 36, right: 40, bottom: 40, left: 40 }
      return {
        backgroundColor: theme.bg,
        color: theme.text,
        ...themeToCssVars(theme),
        ...paddingToCssVars(pad),
        ...(pageSettings ? pageSettingsToCssVars(pageSettings) : {})
      }
    }, [documentTheme, pagePadding, pageSettings])

    const editor = useEditor({
      extensions: createDocumentExtensions(placeholder),
      content,
      editable,
      editorProps: createDocumentEditorProps(),
      onUpdate: ({ editor: ed }) => {
        onChange?.(JSON.stringify(ed.getJSON()), ed.getHTML())
        setOutline(extractOutlineFromEditor(ed))
      },
      onSelectionUpdate: ({ editor: ed }) => {
        const commentId = ed.getAttributes('comment').commentId as string | undefined
        if (commentId) onCommentSelect?.(commentId)
      }
    })

    useEffect(() => {
      if (!editor) return
      const next = content ?? ''
      const current = editor.getHTML()
      const isEmpty = editor.isEmpty || !editor.getText().trim()
      if ((isEmpty || !editor.isFocused) && current !== next) {
        editor.commands.setContent(next, false)
      }
    }, [content, editor])

    useEffect(() => {
      if (editor) editor.setEditable(editable)
    }, [editor, editable])

    useEffect(() => {
      if (editor) setOutline(extractOutlineFromEditor(editor))
    }, [editor, content])

    useImperativeHandle(
      ref,
      () => ({
        insertHtml: (html: string) => {
          if (editor) insertHtml(editor, html)
        },
        insertMissingSections: (titles: string[]) => {
          if (!editor || titles.length === 0) return
          insertHtml(editor, titles.map(missingSectionSnippet).join(''))
        },
        navigateToHeading: (text: string, occurrence = 0) => {
          if (editor) navigateToHeading(editor, text, occurrence)
        },
        navigateToOutlineItem: (item: OutlineItem, occurrence = 0) => {
          if (editor) navigateToOutlineItem(editor, item, occurrence)
        },
        replaceDocumentHtml: (html: string) => {
          if (!editor) return
          editor.commands.setContent(html, false)
          onChange?.(JSON.stringify(editor.getJSON()), editor.getHTML())
        },
        numberHeadings: () => (editor ? numberHeadings(editor) : 0),
        findNextPlaceholder: () => (editor ? findNextPlaceholder(editor) : false),
        getHtml: () => editor?.getHTML() ?? '',
        getOutline: () => (editor ? extractOutlineFromEditor(editor) : []),
        getSelectedText: () => {
          if (!editor) return ''
          const { from, to } = editor.state.selection
          return editor.state.doc.textBetween(from, to, ' ').trim()
        },
        getSelectionRange: () => {
          if (!editor) return null
          const { from, to } = editor.state.selection
          if (from === to) return null
          return { from, to }
        },
        addCommentMark: (commentId: string, range?: { from: number; to: number }) => {
          if (!editor) return false
          const selection = range ?? {
            from: editor.state.selection.from,
            to: editor.state.selection.to
          }
          if (selection.from === selection.to) return false
          return editor
            .chain()
            .focus()
            .setTextSelection(selection)
            .setComment(commentId)
            .run()
        },
        restoreCommentMarks: (comments: DocumentComment[]) => {
          if (!editor || comments.length === 0) return
          for (const comment of comments) {
            if (comment.resolved || !comment.quote?.trim()) continue
            let alreadyMarked = false
            editor.state.doc.descendants((node) => {
              if (alreadyMarked) return false
              if (
                node.marks.some(
                  (mark) => mark.type.name === 'comment' && mark.attrs.commentId === comment.id
                )
              ) {
                alreadyMarked = true
                return false
              }
              return true
            })
            if (alreadyMarked) continue

            const quote = comment.quote.trim()
            const target = quote.toLowerCase()
            editor.state.doc.descendants((node, pos) => {
              if (alreadyMarked || !node.isText || !node.text) return
              const index = node.text.toLowerCase().indexOf(target)
              if (index < 0) return
              const from = pos + index
              const to = from + quote.length
              editor.chain().setTextSelection({ from, to }).setComment(comment.id).run()
              alreadyMarked = true
            })
          }
        },
        selectComment: (commentId: string) => {
          if (!editor) return false
          let from: number | null = null
          let to: number | null = null
          editor.state.doc.descendants((node, pos) => {
            if (!node.isText || !node.text) return
            const hasMark = node.marks.some(
              (mark) => mark.type.name === 'comment' && mark.attrs.commentId === commentId
            )
            if (!hasMark) return
            if (from === null) from = pos
            to = pos + node.nodeSize
          })
          if (from === null || to === null) return false
          editor.chain().focus().setTextSelection({ from, to }).scrollIntoView().run()
          return true
        },
        unsetComment: (commentId: string) => {
          editor?.commands.unsetComment(commentId)
        },
        runCommand: (command: DocumentEditorCommand) => {
          if (!editor) return false
          const chain = editor.chain().focus()
          switch (command) {
            case 'undo':
              return chain.undo().run()
            case 'redo':
              return chain.redo().run()
            case 'selectAll':
              return chain.selectAll().run()
            case 'bold':
              return chain.toggleBold().run()
            case 'italic':
              return chain.toggleItalic().run()
            case 'underline':
              return chain.toggleUnderline().run()
            case 'strike':
              return chain.toggleStrike().run()
            case 'paragraph':
              return chain.setParagraph().run()
            case 'heading1':
              return chain.toggleHeading({ level: 1 }).run()
            case 'heading2':
              return chain.toggleHeading({ level: 2 }).run()
            case 'heading3':
              return chain.toggleHeading({ level: 3 }).run()
            case 'bulletList':
              return chain.toggleBulletList().run()
            case 'orderedList':
              return chain.toggleOrderedList().run()
            case 'blockquote':
              return chain.toggleBlockquote().run()
            case 'horizontalRule':
              return chain.setHorizontalRule().run()
            case 'table':
              return chain.insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
            case 'hardBreak':
              return chain.setHardBreak().run()
            case 'clearFormatting':
              return chain.clearNodes().unsetAllMarks().run()
            case 'link': {
              const href = window.prompt(
                'Link URL',
                editor.getAttributes('link').href || 'https://'
              )
              if (!href?.trim()) return false
              return chain.extendMarkRange('link').setLink({ href: href.trim() }).run()
            }
            case 'image': {
              const src = window.prompt('Image URL')
              if (!src?.trim()) return false
              return chain.setImage({ src: src.trim(), alt: 'Document image' }).run()
            }
          }
        }
      }),
      [editor]
    )

    if (!editor) return null

    const headerText = pageSettings?.headerText?.trim()
    const footerText = pageSettings?.footerText?.trim()
    const showPageNumbers = pageSettings?.showPageNumbers !== false

    return (
      <div className={cn('flex min-h-0 flex-1 flex-col', className)}>
        {editable && (
          <div className="editor-toolbar-shell relative z-30 shrink-0">
            <EditorToolbar
              editor={editor}
              snippetContext={snippetContext}
              onAddComment={onAddComment}
              onOpenCommentsPanel={onOpenCommentsPanel}
              openCommentCount={openCommentCount}
            />
          </div>
        )}
        <div className={cn('min-h-0 flex-1', documentMode ? 'flex' : 'overflow-y-auto p-4')}>
          {documentMode ? (
            <>
              <aside
                className={cn(
                  'document-outline-rail hidden shrink-0 border-r border-border/60 bg-background/80 lg:flex',
                  outlineOpen ? 'w-56' : 'w-11'
                )}
              >
                {outlineOpen ? (
                  <div className="flex min-h-0 w-full flex-col px-3 py-3">
                    <div className="mb-3 flex items-center justify-between">
                      <span className="text-xs font-semibold text-foreground">
                        Document outline
                      </span>
                      <button
                        type="button"
                        className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                        onClick={() => setOutlineOpen(false)}
                        aria-label="Collapse document outline"
                      >
                        <PanelLeftClose className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="mb-3 flex items-center gap-2 rounded-full bg-primary/10 px-3 py-2 text-xs font-medium text-primary">
                      <FileText className="h-3.5 w-3.5" />
                      <span className="truncate">Page 1</span>
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto">
                      <DocumentOutline
                        items={outline}
                        onNavigate={(_, item, occurrence) =>
                          navigateToOutlineItem(editor, item, occurrence)
                        }
                      />
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="mx-auto mt-3 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                    onClick={() => setOutlineOpen(true)}
                    aria-label="Expand document outline"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                )}
              </aside>
              <div className="document-editor-scroll min-w-0 flex-1 overflow-y-auto">
                <div className="document-ruler-sticky sticky top-0 z-20 mx-auto">
                  <div className="document-ruler" aria-hidden="true">
                    <ChevronLeft className="document-ruler-margin document-ruler-margin-left h-3 w-3 fill-primary text-primary" />
                    {[1, 2, 3, 4, 5, 6, 7].map((mark) => (
                      <span key={mark} style={{ left: `${(mark / 8) * 100}%` }}>
                        {mark}
                      </span>
                    ))}
                    <ChevronRight className="document-ruler-margin document-ruler-margin-right h-3 w-3 fill-primary text-primary" />
                  </div>
                </div>
                <div className="document-editor-frame pb-8 pt-3">
                  <div
                    className="document-editor-themed mx-auto"
                    style={themeStyle}
                    data-doc-theme={documentTheme}
                    data-style={documentStyle === 'chatgpt' ? 'chatgpt' : undefined}
                    data-page-size={pageSettings?.pageSize}
                    data-orientation={pageSettings?.orientation}
                    data-heading-style={pageSettings?.headingStyle}
                    data-page-border={pageSettings?.pageBorder}
                    data-paragraph-spacing={pageSettings?.paragraphSpacing}
                  >
                    {(headerText || showPageNumbers) && (
                      <div className="doc-running-header">
                        <span>{headerText || snippetContext?.title || 'Document'}</span>
                        {showPageNumbers && <span className="tabular-nums">Page 1</span>}
                      </div>
                    )}
                    <DocumentEditorContextMenu
                      editor={editor}
                      editable={editable}
                      onAddComment={onAddComment}
                    >
                      <EditorContent editor={editor} className="tiptap max-w-none" />
                    </DocumentEditorContextMenu>
                    {(footerText || showPageNumbers) && (
                      <div className="doc-running-footer">
                        <span>{footerText || snippetContext?.projectName || ''}</span>
                        {showPageNumbers && <span className="tabular-nums">1</span>}
                      </div>
                    )}
                    <FloatingImageToolbar editor={editor} />
                    <FloatingSelectionToolbar
                      editor={editor}
                      onAIEditSelection={onAIEditSelection}
                      aiProcessing={aiProcessing}
                      onAddComment={onAddComment}
                    />
                    <SlashCommandMenu
                      editor={editor}
                      onAskAI={onAskAI}
                      snippetContext={snippetContext}
                    />
                    <InlineAskAIButton editor={editor} onAskAI={onAskAI} />
                  </div>
                </div>
              </div>
            </>
          ) : (
            <EditorContent
              editor={editor}
              className="tiptap prose prose-sm dark:prose-invert max-w-none"
            />
          )}
        </div>
      </div>
    )
  }
)
