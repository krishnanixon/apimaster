import { useCallback, useEffect, useState } from 'react'
import type { Editor } from '@tiptap/react'
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  List,
  ListOrdered,
  ListChecks,
  Quote,
  Undo,
  Redo,
  Table as TableIcon,
  Image as ImageIcon,
  Link as LinkIcon,
  Unlink,
  Highlighter,
  Minus,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Subscript,
  Superscript,
  RemoveFormatting,
  Pilcrow,
  Code2,
  Trash2,
  ChevronDown,
  Type,
  IndentIncrease,
  IndentDecrease,
  CaseSensitive,
  CornerDownLeft,
  Search,
  ListTree,
  ShieldAlert,
  BookMarked,
  MessageSquareText,
  Scale,
  CircleHelp,
  BookOpen,
  GitCommitHorizontal,
  ClipboardList,
  Hash,
  FileText,
  SplitSquareHorizontal,
  ClipboardPaste,
  Clipboard,
  Scissors,
  Copy,
  MessageSquarePlus,
  MessageSquare,
  AlertTriangle,
  Info
} from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { ColorPickerMenu } from '@/features/editor/components/ColorPickerMenu'
import { ToolbarPopover } from '@/features/editor/components/ToolbarPopover'
import { InsertLinkDialog } from '@/features/editor/components/InsertLinkDialog'
import { InsertImageDialog } from '@/features/editor/components/InsertImageDialog'
import {
  TEXT_COLORS,
  HIGHLIGHT_COLORS,
  FONT_FAMILIES,
  FONT_SIZES,
  LINE_HEIGHTS
} from '@/features/editor/lib/editor-colors'
import { removeEditorLink } from '@/features/editor/lib/insert-media'
import { pastePlainFromClipboard } from '@/features/editor/lib/clipboard'
import {
  acceptanceCriteriaSnippet,
  approvalTableSnippet,
  assumptionTableSnippet,
  changeLogSnippet,
  coverHeaderSnippet,
  decisionLogSnippet,
  documentControlSnippet,
  findNextPlaceholder,
  glossarySnippet,
  insertHtml,
  nextRequirementId,
  nfrTableSnippet,
  numberHeadings,
  openQuestionsSnippet,
  pageBreakSnippet,
  requirementSnippet,
  riskTableSnippet,
  traceabilitySnippet,
  userStorySnippet
} from '@/features/editor/lib/insert-snippets'
import { FindReplaceBar } from '@/features/editor/components/FindReplaceBar'
import { WordScreenTip } from '@/features/editor/components/WordScreenTip'
import { cn } from '@/shared/lib/utils'
import {
  getCurrentTableDesign,
  updateCurrentTableDesign,
  type TableSize,
  type TableStyle,
  type TableWidth
} from '@/features/editor/extensions/styled-table'

function ToolbarButton({
  onClick,
  isActive,
  disabled,
  children,
  label,
  shortcut,
  description,
  title
}: {
  onClick: () => void
  isActive?: boolean
  disabled?: boolean
  children: React.ReactNode
  label?: string
  shortcut?: string
  description?: string
  title?: string
}) {
  const name = label ?? title ?? ''
  return (
    <WordScreenTip label={name} shortcut={shortcut} description={description}>
      <span className={cn('inline-flex', disabled && 'cursor-not-allowed')}>
        <Button
          type="button"
          variant={isActive ? 'secondary' : 'ghost'}
          size="icon"
          className={cn(
            'word-ribbon-control h-6 w-6 shrink-0 rounded-[3px] text-muted-foreground transition-colors',
            isActive && 'is-active'
          )}
          onClick={onClick}
          disabled={disabled}
          aria-label={shortcut ? `${name} (${shortcut})` : name}
        >
          {children}
        </Button>
      </span>
    </WordScreenTip>
  )
}

function RibbonGroup({ children }: { children: React.ReactNode }) {
  return (
    <div className="word-ribbon-group flex shrink-0 items-center gap-px px-1 first:pl-0">
      {children}
    </div>
  )
}

export function EditorToolbar({
  editor,
  snippetContext,
  onAddComment,
  onOpenCommentsPanel,
  openCommentCount = 0
}: {
  editor: Editor
  snippetContext?: { title?: string; projectName?: string; typeLabel?: string; status?: string }
  onAddComment?: () => void
  onOpenCommentsPanel?: () => void
  openCommentCount?: number
}) {
  const [activeRibbon, setActiveRibbon] = useState<'home' | 'review' | 'table'>('home')
  const [tableMenuOpen, setTableMenuOpen] = useState(false)
  const [clipboardMenuOpen, setClipboardMenuOpen] = useState(false)
  const [caseMenuOpen, setCaseMenuOpen] = useState(false)
  const [symbolMenuOpen, setSymbolMenuOpen] = useState(false)
  const [styleMenuOpen, setStyleMenuOpen] = useState(false)
  const [linkOpen, setLinkOpen] = useState(false)
  const [imageOpen, setImageOpen] = useState(false)
  const [snippetOpen, setSnippetOpen] = useState(false)
  const [findOpen, setFindOpen] = useState(false)

  const currentTextColor = (editor.getAttributes('textStyle').color as string) || ''
  const currentHighlight = (editor.getAttributes('highlight').color as string) || ''
  const currentFontFamily = (editor.getAttributes('textStyle').fontFamily as string) || ''
  const currentFontSize = (editor.getAttributes('textStyle').fontSize as string) || ''
  const currentLineHeight =
    (editor.getAttributes('paragraph').lineHeight as string) ||
    (editor.getAttributes('heading').lineHeight as string) ||
    ''
  const currentTable = getCurrentTableDesign(editor)

  useEffect(() => {
    let wasInTable = editor.isActive('table')

    const syncContextualRibbon = () => {
      const isInTable = editor.isActive('table')
      if (isInTable && !wasInTable) setActiveRibbon('table')
      if (!isInTable && wasInTable) {
        setActiveRibbon((current) => (current === 'table' ? 'home' : current))
      }
      wasInTable = isInTable
    }

    syncContextualRibbon()
    editor.on('selectionUpdate', syncContextualRibbon)
    return () => editor.off('selectionUpdate', syncContextualRibbon)
  }, [editor])

  const currentStyleLabel = editor.isActive('heading', { level: 1 })
    ? 'Heading 1'
    : editor.isActive('heading', { level: 2 })
      ? 'Heading 2'
      : editor.isActive('heading', { level: 3 })
        ? 'Heading 3'
        : editor.isActive('heading', { level: 4 })
          ? 'Heading 4'
          : editor.isActive('heading', { level: 5 })
            ? 'Heading 5'
            : editor.isActive('heading', { level: 6 })
              ? 'Heading 6'
              : 'Paragraph'

  const transformCase = useCallback(
    (mode: 'upper' | 'lower' | 'title' | 'sentence') => {
      const { from, to } = editor.state.selection
      if (from === to) return
      const text = editor.state.doc.textBetween(from, to, ' ')
      let next = text
      if (mode === 'upper') next = text.toUpperCase()
      else if (mode === 'lower') next = text.toLowerCase()
      else if (mode === 'title') next = text.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
      else next = text.toLowerCase().replace(/(^\s*\w|[.!?]\s+\w)/g, (c) => c.toUpperCase())
      editor.chain().focus().insertContentAt({ from, to }, next).run()
    },
    [editor]
  )

  const copySelection = useCallback(async () => {
    const { from, to } = editor.state.selection
    if (from === to) return
    await navigator.clipboard.writeText(editor.state.doc.textBetween(from, to, '\n'))
    editor.commands.focus()
  }, [editor])

  const cutSelection = useCallback(async () => {
    const { from, to } = editor.state.selection
    if (from === to) return
    await navigator.clipboard.writeText(editor.state.doc.textBetween(from, to, '\n'))
    editor.chain().focus().deleteSelection().run()
  }, [editor])

  const changeFontSize = useCallback(
    (delta: number) => {
      const numeric = Number.parseInt(currentFontSize || '16', 10)
      const next = Math.min(72, Math.max(8, (Number.isFinite(numeric) ? numeric : 16) + delta))
      editor.chain().focus().setFontSize(`${next}px`).run()
    },
    [currentFontSize, editor]
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        setActiveRibbon('review')
        setFindOpen(true)
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'h') {
        e.preventDefault()
        setActiveRibbon('review')
        setFindOpen(true)
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setLinkOpen(true)
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'v') {
        e.preventDefault()
        void pastePlainFromClipboard(editor)
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'p') {
        e.preventDefault()
        findNextPlaceholder(editor)
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === '.') {
        e.preventDefault()
        changeFontSize(1)
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === ',') {
        e.preventDefault()
        changeFontSize(-1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [changeFontSize, editor])

  const insertSnippets = [
    {
      label: 'Requirement',
      tip: 'Insert a numbered functional requirement.',
      icon: BookMarked,
      run: () => insertHtml(editor, requirementSnippet(nextRequirementId(editor.getHTML())))
    },
    {
      label: 'User story',
      tip: 'Insert a user story with role, goal, and benefit.',
      icon: MessageSquareText,
      run: () => insertHtml(editor, userStorySnippet())
    },
    {
      label: 'Acceptance criteria',
      tip: 'Insert a Given / When / Then acceptance list.',
      icon: ListChecks,
      run: () => insertHtml(editor, acceptanceCriteriaSnippet())
    },
    {
      label: 'NFR table',
      tip: 'Insert a non-functional requirements table.',
      icon: ShieldAlert,
      run: () => insertHtml(editor, nfrTableSnippet())
    },
    {
      label: 'Risk table',
      tip: 'Insert a risk register table.',
      icon: ShieldAlert,
      run: () => insertHtml(editor, riskTableSnippet())
    },
    {
      label: 'Assumptions',
      tip: 'Insert an assumptions and constraints table.',
      icon: ClipboardList,
      run: () => insertHtml(editor, assumptionTableSnippet())
    },
    {
      label: 'Decision log',
      tip: 'Insert a decision log table.',
      icon: Scale,
      run: () => insertHtml(editor, decisionLogSnippet())
    },
    {
      label: 'Glossary',
      tip: 'Insert a glossary of terms.',
      icon: BookOpen,
      run: () => insertHtml(editor, glossarySnippet())
    },
    {
      label: 'Change log',
      tip: 'Insert a document change history.',
      icon: GitCommitHorizontal,
      run: () => insertHtml(editor, changeLogSnippet())
    },
    {
      label: 'Open questions',
      tip: 'Insert a list of open questions.',
      icon: CircleHelp,
      run: () => insertHtml(editor, openQuestionsSnippet())
    },
    {
      label: 'Note / callout',
      tip: 'Insert a note callout box.',
      icon: Quote,
      run: () => editor.chain().focus().setCallout('note').run()
    },
    {
      label: 'Warning callout',
      tip: 'Insert a warning callout box.',
      icon: AlertTriangle,
      run: () => editor.chain().focus().setCallout('warning').run()
    },
    {
      label: 'Info callout',
      tip: 'Insert an info callout box.',
      icon: Info,
      run: () => editor.chain().focus().setCallout('info').run()
    },
    {
      label: 'Cover / header',
      tip: 'Insert a cover page header with title and metadata.',
      icon: FileText,
      run: () => insertHtml(editor, coverHeaderSnippet(snippetContext ?? {}))
    },
    {
      label: 'Document control',
      tip: 'Insert document control fields.',
      icon: ClipboardList,
      run: () => insertHtml(editor, documentControlSnippet())
    },
    {
      label: 'Traceability',
      tip: 'Insert a requirements traceability table.',
      icon: Hash,
      run: () => insertHtml(editor, traceabilitySnippet())
    },
    {
      label: 'Approval',
      tip: 'Insert an approval signature table.',
      icon: Scale,
      run: () => insertHtml(editor, approvalTableSnippet())
    },
    {
      label: 'Page break',
      tip: 'Start the next content on a new page.',
      icon: SplitSquareHorizontal,
      run: () => insertHtml(editor, pageBreakSnippet())
    },
    {
      label: 'Table of contents',
      tip: 'Insert a live table of contents from headings.',
      icon: ListTree,
      run: () => editor.chain().focus().insertTableOfContents().run()
    }
  ]

  return (
    <>
      <div className="editor-toolbar word-ribbon border-b border-border/70 bg-card">
        <div className="word-ribbon-tabs flex h-8 items-end gap-0.5 px-2 pt-1">
          {[
            {
              id: 'home',
              label: 'Home',
              description: 'Formatting, paragraph, insert, and layout tools.'
            },
            { id: 'review', label: 'Review', description: 'Find, comments, and proofing tools.' },
            ...(editor.isActive('table')
              ? [
                  {
                    id: 'table',
                    label: 'Table design',
                    description: 'Insert, delete, and format table rows and columns.'
                  }
                ]
              : [])
          ].map((tab) => (
            <WordScreenTip
              key={tab.id}
              label={tab.label}
              description={tab.description}
              side="bottom"
            >
              <button
                type="button"
                onClick={() => setActiveRibbon(tab.id as typeof activeRibbon)}
                className={cn(
                  'word-ribbon-tab relative h-7 rounded-t-[3px] px-3 text-xs font-medium transition-colors',
                  activeRibbon === tab.id &&
                    'is-active after:absolute after:inset-x-2 after:bottom-0 after:h-0.5'
                )}
              >
                {tab.label}
              </button>
            </WordScreenTip>
          ))}
        </div>
        <div className="word-ribbon-tools flex max-h-[60px] flex-wrap content-start items-center gap-0 overflow-y-auto px-2 py-1">
          {activeRibbon === 'home' && (
            <>
              <RibbonGroup>
                <ToolbarButton
                  onClick={() => editor.chain().focus().undo().run()}
                  disabled={!editor.can().undo()}
                  label="Undo"
                  shortcut="Ctrl+Z"
                  description="Reverse the last change you made."
                >
                  <Undo className="h-4 w-4" />
                </ToolbarButton>
                <ToolbarButton
                  onClick={() => editor.chain().focus().redo().run()}
                  disabled={!editor.can().redo()}
                  label="Redo"
                  shortcut="Ctrl+Y"
                  description="Restore the last change you undid."
                >
                  <Redo className="h-4 w-4" />
                </ToolbarButton>
              </RibbonGroup>

              <RibbonGroup>
                <ToolbarPopover
                  open={clipboardMenuOpen}
                  onOpenChange={setClipboardMenuOpen}
                  className="w-44 p-1"
                  trigger={
                    <WordScreenTip
                      label="Clipboard"
                      description="Cut, copy, paste, or select document content."
                      disabled={clipboardMenuOpen}
                    >
                      <button
                        type="button"
                        onClick={() => setClipboardMenuOpen(!clipboardMenuOpen)}
                        className="flex h-7 items-center gap-0.5 rounded-[3px] px-1.5 text-[11px] hover:bg-muted"
                      >
                        <Clipboard className="h-3.5 w-3.5" /> <ChevronDown className="h-3 w-3" />
                      </button>
                    </WordScreenTip>
                  }
                >
                  {[
                    {
                      label: 'Cut',
                      shortcut: 'Ctrl+X',
                      icon: Scissors,
                      disabled: editor.state.selection.empty,
                      run: () => void cutSelection()
                    },
                    {
                      label: 'Copy',
                      shortcut: 'Ctrl+C',
                      icon: Copy,
                      disabled: editor.state.selection.empty,
                      run: () => void copySelection()
                    },
                    {
                      label: 'Paste as text',
                      shortcut: 'Ctrl+Shift+V',
                      icon: ClipboardPaste,
                      disabled: false,
                      run: () => void pastePlainFromClipboard(editor)
                    },
                    {
                      label: 'Select all',
                      shortcut: 'Ctrl+A',
                      icon: FileText,
                      disabled: false,
                      run: () => editor.chain().focus().selectAll().run()
                    }
                  ].map(({ label, shortcut, icon: Icon, disabled, run }) => (
                    <button
                      key={label}
                      type="button"
                      disabled={disabled}
                      onClick={() => {
                        run()
                        setClipboardMenuOpen(false)
                      }}
                      className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-muted disabled:opacity-40"
                    >
                      <Icon className="h-3.5 w-3.5" />
                      <span>{label}</span>
                      <span className="ml-auto text-[10px] text-muted-foreground">{shortcut}</span>
                    </button>
                  ))}
                </ToolbarPopover>
              </RibbonGroup>

              <RibbonGroup>
                <ToolbarPopover
                  open={styleMenuOpen}
                  onOpenChange={setStyleMenuOpen}
                  className="w-44 p-1"
                  trigger={
                    <WordScreenTip
                      label="Styles"
                      shortcut="Ctrl+Alt+1"
                      description="Apply a paragraph style such as Heading 1 or Normal."
                      disabled={styleMenuOpen}
                    >
                      <button
                        type="button"
                        onClick={() => setStyleMenuOpen(!styleMenuOpen)}
                        className="flex h-7 min-w-[92px] items-center justify-between gap-1 rounded-md border border-border/70 bg-background px-1.5 text-[11px] shadow-sm transition-colors hover:bg-muted"
                      >
                        <span className="truncate">{currentStyleLabel}</span>
                        <ChevronDown className="h-3 w-3 shrink-0" />
                      </button>
                    </WordScreenTip>
                  }
                >
                  {[
                    {
                      label: 'Paragraph',
                      icon: Pilcrow,
                      action: () => editor.chain().focus().setParagraph().run()
                    },
                    {
                      label: 'Heading 1',
                      icon: Heading1,
                      action: () => editor.chain().focus().toggleHeading({ level: 1 }).run()
                    },
                    {
                      label: 'Heading 2',
                      icon: Heading2,
                      action: () => editor.chain().focus().toggleHeading({ level: 2 }).run()
                    },
                    {
                      label: 'Heading 3',
                      icon: Heading3,
                      action: () => editor.chain().focus().toggleHeading({ level: 3 }).run()
                    },
                    {
                      label: 'Heading 4',
                      icon: Heading4,
                      action: () => editor.chain().focus().toggleHeading({ level: 4 }).run()
                    },
                    {
                      label: 'Heading 5',
                      icon: Type,
                      action: () => editor.chain().focus().toggleHeading({ level: 5 }).run()
                    },
                    {
                      label: 'Heading 6',
                      icon: Type,
                      action: () => editor.chain().focus().toggleHeading({ level: 6 }).run()
                    }
                  ].map(({ label, icon: Icon, action }) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => {
                        action()
                        setStyleMenuOpen(false)
                      }}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-muted"
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {label}
                    </button>
                  ))}
                </ToolbarPopover>

                <WordScreenTip
                  label="Font"
                  description="Change the font face of the selected text."
                >
                  <select
                    aria-label="Font family"
                    className="h-7 max-w-[104px] rounded-md border border-border/70 bg-background px-1.5 text-[11px]"
                    value={currentFontFamily}
                    onChange={(e) => {
                      const value = e.target.value
                      if (!value) editor.chain().focus().unsetFontFamily().run()
                      else editor.chain().focus().setFontFamily(value).run()
                    }}
                  >
                    {(FONT_FAMILIES ?? []).map((font) => (
                      <option key={font.label} value={font.value}>
                        {font.label}
                      </option>
                    ))}
                  </select>
                </WordScreenTip>
                <WordScreenTip
                  label="Font size"
                  description="Change the size of the selected text."
                >
                  <select
                    aria-label="Font size"
                    className="h-7 w-[58px] rounded-md border border-border/70 bg-background px-1 text-[11px]"
                    value={currentFontSize}
                    onChange={(e) => {
                      const value = e.target.value
                      if (!value) editor.chain().focus().unsetFontSize().run()
                      else editor.chain().focus().setFontSize(value).run()
                    }}
                  >
                    <option value="">Size</option>
                    {(FONT_SIZES ?? []).map((size) => (
                      <option key={size} value={size}>
                        {size.replace('px', '')}
                      </option>
                    ))}
                  </select>
                </WordScreenTip>
                <ToolbarButton
                  onClick={() => changeFontSize(1)}
                  label="Grow font"
                  shortcut="Ctrl+Shift+>"
                  description="Increase the selected text size."
                >
                  <span className="text-[11px] font-semibold">A+</span>
                </ToolbarButton>
                <ToolbarButton
                  onClick={() => changeFontSize(-1)}
                  label="Shrink font"
                  shortcut="Ctrl+Shift+<"
                  description="Decrease the selected text size."
                >
                  <span className="text-[11px] font-semibold">A−</span>
                </ToolbarButton>
                <ToolbarPopover
                  open={caseMenuOpen}
                  onOpenChange={setCaseMenuOpen}
                  className="w-44 p-1"
                  trigger={
                    <WordScreenTip
                      label="Change case"
                      description="Change capitalization of the selected text."
                      disabled={caseMenuOpen}
                    >
                      <button
                        type="button"
                        onClick={() => setCaseMenuOpen(!caseMenuOpen)}
                        className="flex h-7 items-center gap-0.5 rounded-[3px] px-1.5 text-[11px] hover:bg-muted"
                      >
                        <CaseSensitive className="h-4 w-4" /> <ChevronDown className="h-3 w-3" />
                      </button>
                    </WordScreenTip>
                  }
                >
                  {[
                    { label: 'Sentence case', mode: 'sentence' as const },
                    { label: 'lowercase', mode: 'lower' as const },
                    { label: 'UPPERCASE', mode: 'upper' as const },
                    { label: 'Capitalize Each Word', mode: 'title' as const }
                  ].map(({ label, mode }) => (
                    <button
                      key={mode}
                      type="button"
                      disabled={editor.state.selection.empty}
                      onClick={() => {
                        transformCase(mode)
                        setCaseMenuOpen(false)
                      }}
                      className="flex w-full rounded-sm px-2 py-1.5 text-left text-xs hover:bg-muted disabled:opacity-40"
                    >
                      {label}
                    </button>
                  ))}
                </ToolbarPopover>
              </RibbonGroup>

              <RibbonGroup>
                <ToolbarButton
                  onClick={() => editor.chain().focus().toggleBold().run()}
                  isActive={editor.isActive('bold')}
                  label="Bold"
                  shortcut="Ctrl+B"
                  description="Make the selected text bold."
                >
                  <Bold className="h-4 w-4" />
                </ToolbarButton>
                <ToolbarButton
                  onClick={() => editor.chain().focus().toggleItalic().run()}
                  isActive={editor.isActive('italic')}
                  label="Italic"
                  shortcut="Ctrl+I"
                  description="Italicize the selected text."
                >
                  <Italic className="h-4 w-4" />
                </ToolbarButton>
                <ToolbarButton
                  onClick={() => editor.chain().focus().toggleUnderline().run()}
                  isActive={editor.isActive('underline')}
                  label="Underline"
                  shortcut="Ctrl+U"
                  description="Underline the selected text."
                >
                  <UnderlineIcon className="h-4 w-4" />
                </ToolbarButton>
                <ToolbarButton
                  onClick={() => editor.chain().focus().toggleStrike().run()}
                  isActive={editor.isActive('strike')}
                  label="Strikethrough"
                  description="Draw a line through the selected text."
                >
                  <Strikethrough className="h-4 w-4" />
                </ToolbarButton>
                <ToolbarButton
                  onClick={() => editor.chain().focus().toggleSubscript().run()}
                  isActive={editor.isActive('subscript')}
                  label="Subscript"
                  description="Create small letters below the text baseline."
                >
                  <Subscript className="h-4 w-4" />
                </ToolbarButton>
                <ToolbarButton
                  onClick={() => editor.chain().focus().toggleSuperscript().run()}
                  isActive={editor.isActive('superscript')}
                  label="Superscript"
                  description="Create small letters above the line of text."
                >
                  <Superscript className="h-4 w-4" />
                </ToolbarButton>
                <ToolbarButton
                  onClick={() => editor.chain().focus().toggleCode().run()}
                  isActive={editor.isActive('code')}
                  label="Inline code"
                  description="Format the selection as inline code."
                >
                  <Code className="h-4 w-4" />
                </ToolbarButton>
                <ToolbarButton
                  onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()}
                  label="Clear formatting"
                  description="Remove all formatting from the selected text."
                >
                  <RemoveFormatting className="h-4 w-4" />
                </ToolbarButton>
                <ToolbarButton
                  onClick={() => void pastePlainFromClipboard(editor)}
                  label="Paste without formatting"
                  shortcut="Ctrl+Shift+V"
                  description="Paste as plain text and match the surrounding style."
                >
                  <ClipboardPaste className="h-4 w-4" />
                </ToolbarButton>

                <ColorPickerMenu
                  label="Font color"
                  description="Change the color of the selected text."
                  icon={
                    <span className="flex flex-col items-center leading-none">
                      <Type className="h-3.5 w-3.5" />
                      <span
                        className="mt-0.5 h-1 w-4 rounded-full"
                        style={{ backgroundColor: currentTextColor || 'currentColor' }}
                      />
                    </span>
                  }
                  colors={TEXT_COLORS}
                  activeColor={currentTextColor}
                  onSelect={(color) => {
                    if (!color) editor.chain().focus().unsetColor().run()
                    else editor.chain().focus().setColor(color).run()
                  }}
                />
                <ColorPickerMenu
                  label="Text highlight color"
                  description="Make text look like it was marked with a highlighter pen."
                  icon={
                    <span className="relative">
                      <Highlighter className="h-4 w-4" />
                      {currentHighlight && (
                        <span
                          className="absolute -bottom-0.5 left-0 right-0 h-1 rounded-full"
                          style={{ backgroundColor: currentHighlight }}
                        />
                      )}
                    </span>
                  }
                  colors={HIGHLIGHT_COLORS}
                  activeColor={currentHighlight}
                  onSelect={(color) => {
                    if (!color) editor.chain().focus().unsetHighlight().run()
                    else editor.chain().focus().toggleHighlight({ color }).run()
                  }}
                />
              </RibbonGroup>
              <RibbonGroup>
                <ToolbarButton
                  onClick={() => setFindOpen(true)}
                  isActive={findOpen}
                  label="Find"
                  shortcut="Ctrl+F"
                  description="Find and replace text in the document."
                >
                  <Search className="h-4 w-4" />
                </ToolbarButton>
              </RibbonGroup>
            </>
          )}

          {activeRibbon === 'home' && (
            <>
              <RibbonGroup>
                <ToolbarButton
                  onClick={() => editor.chain().focus().setTextAlign('left').run()}
                  isActive={editor.isActive({ textAlign: 'left' })}
                  label="Align left"
                  shortcut="Ctrl+Shift+L"
                  description="Align text to the left."
                >
                  <AlignLeft className="h-4 w-4" />
                </ToolbarButton>
                <ToolbarButton
                  onClick={() => editor.chain().focus().setTextAlign('center').run()}
                  isActive={editor.isActive({ textAlign: 'center' })}
                  label="Center"
                  shortcut="Ctrl+Shift+E"
                  description="Center the selected text."
                >
                  <AlignCenter className="h-4 w-4" />
                </ToolbarButton>
                <ToolbarButton
                  onClick={() => editor.chain().focus().setTextAlign('right').run()}
                  isActive={editor.isActive({ textAlign: 'right' })}
                  label="Align right"
                  shortcut="Ctrl+Shift+R"
                  description="Align text to the right."
                >
                  <AlignRight className="h-4 w-4" />
                </ToolbarButton>
                <ToolbarButton
                  onClick={() => editor.chain().focus().setTextAlign('justify').run()}
                  isActive={editor.isActive({ textAlign: 'justify' })}
                  label="Justify"
                  description="Distribute text evenly between the margins."
                >
                  <AlignJustify className="h-4 w-4" />
                </ToolbarButton>
              </RibbonGroup>

              <RibbonGroup>
                <ToolbarButton
                  onClick={() => editor.chain().focus().toggleBulletList().run()}
                  isActive={editor.isActive('bulletList')}
                  label="Bullets"
                  shortcut="Ctrl+Shift+8"
                  description="Start a bulleted list."
                >
                  <List className="h-4 w-4" />
                </ToolbarButton>
                <ToolbarButton
                  onClick={() => editor.chain().focus().toggleOrderedList().run()}
                  isActive={editor.isActive('orderedList')}
                  label="Numbering"
                  shortcut="Ctrl+Shift+7"
                  description="Start a numbered list."
                >
                  <ListOrdered className="h-4 w-4" />
                </ToolbarButton>
                <ToolbarButton
                  onClick={() => editor.chain().focus().toggleTaskList().run()}
                  isActive={editor.isActive('taskList')}
                  label="Checklist"
                  shortcut="Ctrl+Shift+9"
                  description="Start a checklist of tasks."
                >
                  <ListChecks className="h-4 w-4" />
                </ToolbarButton>
                <ToolbarButton
                  onClick={() => editor.chain().focus().sinkListItem('listItem').run()}
                  disabled={!editor.can().sinkListItem('listItem')}
                  label="Increase indent"
                  description="Move the paragraph farther from the margin."
                >
                  <IndentIncrease className="h-4 w-4" />
                </ToolbarButton>
                <ToolbarButton
                  onClick={() => editor.chain().focus().liftListItem('listItem').run()}
                  disabled={!editor.can().liftListItem('listItem')}
                  label="Decrease indent"
                  description="Move the paragraph closer to the margin."
                >
                  <IndentDecrease className="h-4 w-4" />
                </ToolbarButton>
                <ToolbarButton
                  onClick={() => editor.chain().focus().toggleBlockquote().run()}
                  isActive={editor.isActive('blockquote')}
                  label="Quote"
                  description="Format the selection as a block quotation."
                >
                  <Quote className="h-4 w-4" />
                </ToolbarButton>
                <ToolbarButton
                  onClick={() => editor.chain().focus().setHorizontalRule().run()}
                  label="Horizontal line"
                  description="Insert a horizontal line across the page."
                >
                  <Minus className="h-4 w-4" />
                </ToolbarButton>
                <ToolbarButton
                  onClick={() => editor.chain().focus().toggleCodeBlock().run()}
                  isActive={editor.isActive('codeBlock')}
                  label="Code block"
                  description="Insert a formatted code block."
                >
                  <Code2 className="h-4 w-4" />
                </ToolbarButton>
                <WordScreenTip
                  label="Line and paragraph spacing"
                  description="Change the spacing between lines of text."
                >
                  <select
                    aria-label="Line spacing"
                    className="h-7 w-[76px] rounded-md border border-border/70 bg-background px-1 text-[11px]"
                    value={currentLineHeight}
                    onChange={(e) => {
                      const value = e.target.value
                      if (!value) editor.chain().focus().unsetLineHeight().run()
                      else editor.chain().focus().setLineHeight(value).run()
                    }}
                  >
                    <option value="">Spacing</option>
                    {(LINE_HEIGHTS ?? []).map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </WordScreenTip>
              </RibbonGroup>
            </>
          )}

          {activeRibbon === 'home' && (
            <>
              <RibbonGroup>
                <ToolbarButton
                  onClick={() =>
                    editor
                      .chain()
                      .focus()
                      .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
                      .run()
                  }
                  label="Table"
                  description="Insert a table into the document."
                >
                  <TableIcon className="h-4 w-4" />
                </ToolbarButton>

                {editor.isActive('table') && (
                  <ToolbarPopover
                    open={tableMenuOpen}
                    onOpenChange={setTableMenuOpen}
                    className="w-44 p-1"
                    trigger={
                      <WordScreenTip
                        label="Table tools"
                        description="Add, delete, merge, or split table rows and columns."
                        disabled={tableMenuOpen}
                      >
                        <button
                          type="button"
                          onClick={() => setTableMenuOpen(!tableMenuOpen)}
                          className="flex h-7 items-center gap-0.5 rounded-md px-1.5 text-[11px] hover:bg-muted"
                        >
                          <TableIcon className="h-3.5 w-3.5" /> <ChevronDown className="h-3 w-3" />
                        </button>
                      </WordScreenTip>
                    }
                  >
                    {[
                      {
                        label: 'Add row above',
                        action: () => editor.chain().focus().addRowBefore().run()
                      },
                      {
                        label: 'Add row below',
                        action: () => editor.chain().focus().addRowAfter().run()
                      },
                      {
                        label: 'Add column left',
                        action: () => editor.chain().focus().addColumnBefore().run()
                      },
                      {
                        label: 'Add column right',
                        action: () => editor.chain().focus().addColumnAfter().run()
                      },
                      {
                        label: 'Delete row',
                        action: () => editor.chain().focus().deleteRow().run(),
                        destructive: true
                      },
                      {
                        label: 'Delete column',
                        action: () => editor.chain().focus().deleteColumn().run(),
                        destructive: true
                      },
                      {
                        label: 'Merge cells',
                        action: () => editor.chain().focus().mergeCells().run()
                      },
                      {
                        label: 'Split cell',
                        action: () => editor.chain().focus().splitCell().run()
                      },
                      {
                        label: 'Toggle header row',
                        action: () => editor.chain().focus().toggleHeaderRow().run()
                      },
                      {
                        label: 'Delete table',
                        action: () => editor.chain().focus().deleteTable().run(),
                        destructive: true
                      }
                    ].map(({ label, action, destructive }) => (
                      <button
                        key={label}
                        type="button"
                        onClick={() => {
                          action()
                          setTableMenuOpen(false)
                        }}
                        className={cn(
                          'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-muted',
                          destructive && 'text-destructive'
                        )}
                      >
                        {destructive && <Trash2 className="h-3 w-3" />}
                        {label}
                      </button>
                    ))}
                  </ToolbarPopover>
                )}

                <ToolbarButton
                  onClick={() => setImageOpen(true)}
                  label="Pictures"
                  description="Insert a picture from your computer."
                >
                  <ImageIcon className="h-4 w-4" />
                </ToolbarButton>
                <ToolbarButton
                  onClick={() => editor.chain().focus().setHardBreak().run()}
                  label="Line break"
                  description="Insert a line break without starting a new paragraph."
                >
                  <CornerDownLeft className="h-4 w-4" />
                </ToolbarButton>
                <ToolbarButton
                  onClick={() => setLinkOpen(true)}
                  isActive={editor.isActive('link')}
                  label="Link"
                  shortcut="Ctrl+K"
                  description="Create a link to a web page, email, or heading."
                >
                  <LinkIcon className="h-4 w-4" />
                </ToolbarButton>
                <ToolbarButton
                  onClick={() => removeEditorLink(editor)}
                  disabled={!editor.isActive('link')}
                  label="Remove link"
                  description="Remove the hyperlink from the selected text."
                >
                  <Unlink className="h-4 w-4" />
                </ToolbarButton>
                <ToolbarPopover
                  open={symbolMenuOpen}
                  onOpenChange={setSymbolMenuOpen}
                  className="w-64 p-2"
                  trigger={
                    <WordScreenTip
                      label="Symbols and date"
                      description="Insert a symbol, current date, or current time."
                      disabled={symbolMenuOpen}
                    >
                      <button
                        type="button"
                        onClick={() => setSymbolMenuOpen(!symbolMenuOpen)}
                        className="flex h-7 items-center gap-0.5 rounded-[3px] px-1.5 text-sm hover:bg-muted"
                      >
                        Ω <ChevronDown className="h-3 w-3" />
                      </button>
                    </WordScreenTip>
                  }
                >
                  <p className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Symbols
                  </p>
                  <div className="grid grid-cols-8 gap-1">
                    {[
                      '©',
                      '®',
                      '™',
                      '°',
                      '±',
                      '×',
                      '÷',
                      '≤',
                      '≥',
                      '≠',
                      '≈',
                      '∞',
                      'µ',
                      '€',
                      '£',
                      '¥',
                      '₹',
                      '•',
                      '§',
                      '¶',
                      '→',
                      '←',
                      '✓',
                      '—'
                    ].map((symbol) => (
                      <button
                        key={symbol}
                        type="button"
                        className="flex h-7 items-center justify-center rounded-sm text-sm hover:bg-muted"
                        onClick={() => {
                          editor.chain().focus().insertContent(symbol).run()
                          setSymbolMenuOpen(false)
                        }}
                      >
                        {symbol}
                      </button>
                    ))}
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-1 border-t border-border/60 pt-2">
                    <button
                      type="button"
                      className="rounded-sm px-2 py-1.5 text-left text-xs hover:bg-muted"
                      onClick={() => {
                        editor.chain().focus().insertContent(new Date().toLocaleDateString()).run()
                        setSymbolMenuOpen(false)
                      }}
                    >
                      Insert date
                    </button>
                    <button
                      type="button"
                      className="rounded-sm px-2 py-1.5 text-left text-xs hover:bg-muted"
                      onClick={() => {
                        editor
                          .chain()
                          .focus()
                          .insertContent(
                            new Date().toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit'
                            })
                          )
                          .run()
                        setSymbolMenuOpen(false)
                      }}
                    >
                      Insert time
                    </button>
                  </div>
                </ToolbarPopover>
              </RibbonGroup>
              <RibbonGroup>
                <ToolbarPopover
                  open={snippetOpen}
                  onOpenChange={setSnippetOpen}
                  className="w-56 p-1"
                  trigger={
                    <WordScreenTip
                      label="Document tools"
                      description="Insert covers, requirements, tables, approvals, page breaks, and other structured document blocks."
                      disabled={snippetOpen}
                    >
                      <button
                        type="button"
                        onClick={() => setSnippetOpen(!snippetOpen)}
                        className="flex h-7 items-center gap-1 rounded-md px-1.5 text-[11px] hover:bg-muted"
                      >
                        <FileText className="h-3.5 w-3.5" /> <ChevronDown className="h-3 w-3" />
                      </button>
                    </WordScreenTip>
                  }
                >
                  {insertSnippets.map(({ label, icon: Icon, run }) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => {
                        run()
                        setSnippetOpen(false)
                      }}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-muted"
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {label}
                    </button>
                  ))}
                </ToolbarPopover>
              </RibbonGroup>
            </>
          )}

          {activeRibbon === 'review' && (
            <>
              <RibbonGroup>
                <ToolbarButton
                  onClick={() => transformCase('upper')}
                  label="Change case"
                  description="Change the selected text to UPPERCASE."
                >
                  <CaseSensitive className="h-4 w-4" />
                </ToolbarButton>
                <WordScreenTip
                  label="lowercase"
                  description="Change the selected text to lowercase."
                >
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => transformCase('lower')}
                  >
                    lowercase
                  </Button>
                </WordScreenTip>
                <WordScreenTip
                  label="Capitalize Each Word"
                  description="Capitalize the first letter of each word."
                >
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => transformCase('title')}
                  >
                    Title Case
                  </Button>
                </WordScreenTip>
              </RibbonGroup>
              <RibbonGroup>
                <ToolbarButton
                  onClick={() => setFindOpen(true)}
                  isActive={findOpen}
                  label="Find"
                  shortcut="Ctrl+F"
                  description="Find and replace text in the document."
                >
                  <Search className="h-4 w-4" />
                </ToolbarButton>
                {onAddComment && (
                  <ToolbarButton
                    onClick={onAddComment}
                    label="New comment"
                    description="Add a comment on the selected text."
                  >
                    <MessageSquarePlus className="h-4 w-4" />
                  </ToolbarButton>
                )}
                {onOpenCommentsPanel && (
                  <ToolbarButton
                    onClick={onOpenCommentsPanel}
                    label="View comments"
                    description="Open the review panel to read and reply to comments."
                  >
                    <MessageSquare className="h-4 w-4" />
                    {openCommentCount > 0 && (
                      <span className="ml-1 rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">
                        {openCommentCount}
                      </span>
                    )}
                  </ToolbarButton>
                )}
                <ToolbarButton
                  onClick={() => findNextPlaceholder(editor)}
                  label="Next placeholder"
                  shortcut="Ctrl+Shift+P"
                  description="Jump to the next TBD, TODO, or bracket placeholder."
                >
                  <CircleHelp className="h-4 w-4" />
                </ToolbarButton>
                <WordScreenTip
                  label="Number headings"
                  description="Add sequential numbers to Heading 2 and Heading 3."
                >
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => numberHeadings(editor)}
                  >
                    Number headings
                  </Button>
                </WordScreenTip>
                <ToolbarButton
                  onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()}
                  label="Clear all formatting"
                  description="Remove all formatting from the selected text."
                >
                  <RemoveFormatting className="h-4 w-4" />
                </ToolbarButton>
              </RibbonGroup>
            </>
          )}

          {activeRibbon === 'table' && editor.isActive('table') && (
            <>
              <RibbonGroup>
                <WordScreenTip
                  label="Table style"
                  description="Choose the borders and row treatment for this table."
                >
                  <select
                    aria-label="Table style"
                    className="table-design-select w-[104px] border px-1 text-[10px]"
                    value={currentTable.tableStyle || 'grid'}
                    onChange={(event) =>
                      updateCurrentTableDesign(editor, {
                        tableStyle: event.target.value as TableStyle
                      })
                    }
                  >
                    <option value="grid">Grid style</option>
                    <option value="striped">Striped rows</option>
                    <option value="bordered">Strong borders</option>
                    <option value="minimal">Minimal lines</option>
                  </select>
                </WordScreenTip>
                <WordScreenTip
                  label="Table size"
                  description="Adjust cell padding and table text density."
                >
                  <select
                    aria-label="Table size"
                    className="table-design-select w-[92px] border px-1 text-[10px]"
                    value={currentTable.tableSize || 'compact'}
                    onChange={(event) =>
                      updateCurrentTableDesign(editor, {
                        tableSize: event.target.value as TableSize
                      })
                    }
                  >
                    <option value="compact">Compact cells</option>
                    <option value="normal">Normal cells</option>
                    <option value="spacious">Spacious cells</option>
                  </select>
                </WordScreenTip>
                <WordScreenTip
                  label="Table width"
                  description="Fit the table to its content or stretch it across the page."
                >
                  <select
                    aria-label="Table width"
                    className="table-design-select w-[88px] border px-1 text-[10px]"
                    value={currentTable.tableWidth || 'full'}
                    onChange={(event) =>
                      updateCurrentTableDesign(editor, {
                        tableWidth: event.target.value as TableWidth
                      })
                    }
                  >
                    <option value="full">Full width</option>
                    <option value="auto">Fit content</option>
                  </select>
                </WordScreenTip>
              </RibbonGroup>
              <RibbonGroup>
                <ToolbarButton
                  onClick={() => editor.chain().focus().addRowBefore().run()}
                  label="Row above"
                  description="Add a row above the current row."
                >
                  <span className="text-[10px] font-semibold">R↑</span>
                </ToolbarButton>
                <ToolbarButton
                  onClick={() => editor.chain().focus().addRowAfter().run()}
                  label="Row below"
                  description="Add a row below the current row."
                >
                  <span className="text-[10px] font-semibold">R↓</span>
                </ToolbarButton>
                <ToolbarButton
                  onClick={() => editor.chain().focus().addColumnBefore().run()}
                  label="Column left"
                  description="Add a column to the left."
                >
                  <span className="text-[10px] font-semibold">C←</span>
                </ToolbarButton>
                <ToolbarButton
                  onClick={() => editor.chain().focus().addColumnAfter().run()}
                  label="Column right"
                  description="Add a column to the right."
                >
                  <span className="text-[10px] font-semibold">C→</span>
                </ToolbarButton>
                <ToolbarButton
                  onClick={() => editor.chain().focus().mergeCells().run()}
                  disabled={!editor.can().mergeCells()}
                  label="Merge cells"
                  description="Combine the selected cells."
                >
                  <span className="text-[9px] font-semibold">Merge</span>
                </ToolbarButton>
                <ToolbarButton
                  onClick={() => editor.chain().focus().splitCell().run()}
                  disabled={!editor.can().splitCell()}
                  label="Split cell"
                  description="Split a merged cell."
                >
                  <SplitSquareHorizontal className="h-4 w-4" />
                </ToolbarButton>
              </RibbonGroup>
              <RibbonGroup>
                <ToolbarButton
                  onClick={() => editor.chain().focus().setTextAlign('left').run()}
                  label="Align left"
                  description="Align cell contents to the left."
                >
                  <AlignLeft className="h-4 w-4" />
                </ToolbarButton>
                <ToolbarButton
                  onClick={() => editor.chain().focus().setTextAlign('center').run()}
                  label="Center"
                  description="Center cell contents."
                >
                  <AlignCenter className="h-4 w-4" />
                </ToolbarButton>
                <ToolbarButton
                  onClick={() => editor.chain().focus().setTextAlign('right').run()}
                  label="Align right"
                  description="Align cell contents to the right."
                >
                  <AlignRight className="h-4 w-4" />
                </ToolbarButton>
                <ToolbarButton
                  onClick={() => editor.chain().focus().setTextAlign('justify').run()}
                  label="Justify"
                  description="Justify cell contents."
                >
                  <AlignJustify className="h-4 w-4" />
                </ToolbarButton>
                <WordScreenTip
                  label="Vertical alignment"
                  description="Align content to the top, middle, or bottom of the cell."
                >
                  <select
                    aria-label="Cell vertical alignment"
                    className="w-[72px] border px-1 text-[10px]"
                    value={
                      (editor.getAttributes('tableCell').verticalAlign as string) ||
                      (editor.getAttributes('tableHeader').verticalAlign as string) ||
                      ''
                    }
                    onChange={(event) =>
                      editor
                        .chain()
                        .focus()
                        .setCellAttribute('verticalAlign', event.target.value || null)
                        .run()
                    }
                  >
                    <option value="">Vertical</option>
                    <option value="top">Top</option>
                    <option value="middle">Middle</option>
                    <option value="bottom">Bottom</option>
                  </select>
                </WordScreenTip>
                <ColorPickerMenu
                  label="Shading"
                  description="Change the background color of the selected cells."
                  icon={<span className="h-3.5 w-3.5 rounded-sm border border-border bg-muted" />}
                  colors={HIGHLIGHT_COLORS}
                  activeColor=""
                  onSelect={(color) => {
                    editor
                      .chain()
                      .focus()
                      .setCellAttribute('backgroundColor', color || '')
                      .run()
                  }}
                />
                <ColorPickerMenu
                  label="Borders"
                  description="Change the border color of the selected cells."
                  icon={
                    <span className="h-3.5 w-3.5 rounded-sm border-2 border-foreground/60 bg-transparent" />
                  }
                  colors={TEXT_COLORS}
                  activeColor=""
                  onSelect={(color) => {
                    editor
                      .chain()
                      .focus()
                      .setCellAttribute('borderColor', color || '')
                      .run()
                  }}
                />
                <WordScreenTip
                  label="Header row"
                  description="Repeat the first row as a table header."
                >
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="px-1.5 text-[10px]"
                    onClick={() => editor.chain().focus().toggleHeaderRow().run()}
                  >
                    Header row
                  </Button>
                </WordScreenTip>
                <WordScreenTip
                  label="Header column"
                  description="Format the first column as a header."
                >
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="px-1.5 text-[10px]"
                    onClick={() => editor.chain().focus().toggleHeaderColumn().run()}
                  >
                    Header column
                  </Button>
                </WordScreenTip>
                <ToolbarButton
                  onClick={() => editor.chain().focus().deleteRow().run()}
                  label="Delete row"
                  description="Delete the current row."
                >
                  <span className="text-[9px] text-destructive">−R</span>
                </ToolbarButton>
                <ToolbarButton
                  onClick={() => editor.chain().focus().deleteColumn().run()}
                  label="Delete column"
                  description="Delete the current column."
                >
                  <span className="text-[9px] text-destructive">−C</span>
                </ToolbarButton>
                <ToolbarButton
                  onClick={() => editor.chain().focus().deleteTable().run()}
                  label="Delete table"
                  description="Remove the entire table."
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </ToolbarButton>
              </RibbonGroup>
            </>
          )}
        </div>
      </div>

      <FindReplaceBar editor={editor} open={findOpen} onClose={() => setFindOpen(false)} />

      <InsertLinkDialog editor={editor} open={linkOpen} onOpenChange={setLinkOpen} />
      <InsertImageDialog editor={editor} open={imageOpen} onOpenChange={setImageOpen} />
    </>
  )
}
