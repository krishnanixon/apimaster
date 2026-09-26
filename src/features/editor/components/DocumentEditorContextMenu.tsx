import type { Editor } from '@tiptap/react'
import {
  Bold,
  ClipboardPaste,
  Copy,
  Italic,
  Link2Off,
  MessageSquarePlus,
  Redo,
  RemoveFormatting,
  Scissors,
  Table as TableIcon,
  Trash2,
  Undo
} from 'lucide-react'
import { pastePlainFromClipboard } from '@/features/editor/lib/clipboard'
import { insertHtml, pageBreakSnippet } from '@/features/editor/lib/insert-snippets'
import {
  updateCurrentTableDesign,
  type TableDesignAttributes
} from '@/features/editor/extensions/styled-table'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger
} from '@/shared/components/ui/context-menu'

interface DocumentEditorContextMenuProps {
  editor: Editor
  editable: boolean
  onAddComment?: () => void
  children: React.ReactNode
}

async function copySelection(editor: Editor, cut = false): Promise<void> {
  const { from, to } = editor.state.selection
  if (from === to) return
  try {
    await navigator.clipboard.writeText(editor.state.doc.textBetween(from, to, '\n'))
    if (cut) editor.chain().focus().deleteSelection().run()
    else editor.commands.focus()
  } catch {
    window.alert('Could not access the clipboard.')
  }
}

export function DocumentEditorContextMenu({
  editor,
  editable,
  onAddComment,
  children
}: DocumentEditorContextMenuProps) {
  const hasSelection = !editor.state.selection.empty
  const inTable = editor.isActive('table')
  const inLink = editor.isActive('link')

  const setTableAttribute = (
    name: keyof TableDesignAttributes,
    value: TableDesignAttributes[keyof TableDesignAttributes]
  ) => {
    updateCurrentTableDesign(editor, { [name]: value })
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className="contents">{children}</div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-60 rounded-lg p-1">
        <ContextMenuLabel className="py-1 text-[10px] uppercase tracking-wide">
          {inTable ? 'Table tools' : hasSelection ? 'Selection tools' : 'Document tools'}
        </ContextMenuLabel>

        <ContextMenuItem
          disabled={!editable || !hasSelection}
          onSelect={() => void copySelection(editor, true)}
        >
          <Scissors className="h-3.5 w-3.5" /> Cut
          <ContextMenuShortcut>⌘X</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem disabled={!hasSelection} onSelect={() => void copySelection(editor)}>
          <Copy className="h-3.5 w-3.5" /> Copy
          <ContextMenuShortcut>⌘C</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem disabled={!editable} onSelect={() => void pastePlainFromClipboard(editor)}>
          <ClipboardPaste className="h-3.5 w-3.5" /> Paste as text
          <ContextMenuShortcut>⌘⇧V</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => editor.chain().focus().selectAll().run()}>
          Select all
          <ContextMenuShortcut>⌘A</ContextMenuShortcut>
        </ContextMenuItem>

        {editable && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem onSelect={() => editor.chain().focus().toggleBold().run()}>
              <Bold className="h-3.5 w-3.5" /> Bold
              <ContextMenuShortcut>⌘B</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => editor.chain().focus().toggleItalic().run()}>
              <Italic className="h-3.5 w-3.5" /> Italic
              <ContextMenuShortcut>⌘I</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuItem
              disabled={!hasSelection || !onAddComment}
              onSelect={() => onAddComment?.()}
            >
              <MessageSquarePlus className="h-3.5 w-3.5" /> Add comment
            </ContextMenuItem>
            {inLink && (
              <ContextMenuItem onSelect={() => editor.chain().focus().unsetLink().run()}>
                <Link2Off className="h-3.5 w-3.5" /> Remove link
              </ContextMenuItem>
            )}
          </>
        )}

        {editable && inTable && (
          <>
            <ContextMenuSeparator />
            <ContextMenuSub>
              <ContextMenuSubTrigger className="py-1.5 text-sm">
                <TableIcon className="h-3.5 w-3.5" /> Table style
              </ContextMenuSubTrigger>
              <ContextMenuSubContent className="w-44 rounded-lg">
                <ContextMenuItem onSelect={() => setTableAttribute('tableStyle', 'grid')}>
                  Grid
                </ContextMenuItem>
                <ContextMenuItem onSelect={() => setTableAttribute('tableStyle', 'striped')}>
                  Striped rows
                </ContextMenuItem>
                <ContextMenuItem onSelect={() => setTableAttribute('tableStyle', 'bordered')}>
                  Strong borders
                </ContextMenuItem>
                <ContextMenuItem onSelect={() => setTableAttribute('tableStyle', 'minimal')}>
                  Minimal
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem onSelect={() => setTableAttribute('tableSize', 'compact')}>
                  Compact cells
                </ContextMenuItem>
                <ContextMenuItem onSelect={() => setTableAttribute('tableSize', 'normal')}>
                  Normal cells
                </ContextMenuItem>
                <ContextMenuItem onSelect={() => setTableAttribute('tableSize', 'spacious')}>
                  Spacious cells
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem onSelect={() => setTableAttribute('tableWidth', 'full')}>
                  Full width
                </ContextMenuItem>
                <ContextMenuItem onSelect={() => setTableAttribute('tableWidth', 'auto')}>
                  Fit to content
                </ContextMenuItem>
              </ContextMenuSubContent>
            </ContextMenuSub>
            <ContextMenuSub>
              <ContextMenuSubTrigger className="py-1.5 text-sm">Insert</ContextMenuSubTrigger>
              <ContextMenuSubContent className="w-44 rounded-lg">
                <ContextMenuItem onSelect={() => editor.chain().focus().addRowBefore().run()}>
                  Row above
                </ContextMenuItem>
                <ContextMenuItem onSelect={() => editor.chain().focus().addRowAfter().run()}>
                  Row below
                </ContextMenuItem>
                <ContextMenuItem onSelect={() => editor.chain().focus().addColumnBefore().run()}>
                  Column left
                </ContextMenuItem>
                <ContextMenuItem onSelect={() => editor.chain().focus().addColumnAfter().run()}>
                  Column right
                </ContextMenuItem>
              </ContextMenuSubContent>
            </ContextMenuSub>
            <ContextMenuItem
              disabled={!editor.can().mergeCells()}
              onSelect={() => editor.chain().focus().mergeCells().run()}
            >
              Merge selected cells
            </ContextMenuItem>
            <ContextMenuItem
              disabled={!editor.can().splitCell()}
              onSelect={() => editor.chain().focus().splitCell().run()}
            >
              Split cell
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => editor.chain().focus().toggleHeaderRow().run()}>
              Toggle header row
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => editor.chain().focus().toggleHeaderColumn().run()}>
              Toggle header column
            </ContextMenuItem>
            <ContextMenuSub>
              <ContextMenuSubTrigger className="py-1.5 text-sm text-destructive">
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </ContextMenuSubTrigger>
              <ContextMenuSubContent className="w-40 rounded-lg">
                <ContextMenuItem
                  className="text-destructive"
                  onSelect={() => editor.chain().focus().deleteRow().run()}
                >
                  Delete row
                </ContextMenuItem>
                <ContextMenuItem
                  className="text-destructive"
                  onSelect={() => editor.chain().focus().deleteColumn().run()}
                >
                  Delete column
                </ContextMenuItem>
                <ContextMenuItem
                  className="text-destructive"
                  onSelect={() => editor.chain().focus().deleteTable().run()}
                >
                  Delete table
                </ContextMenuItem>
              </ContextMenuSubContent>
            </ContextMenuSub>
          </>
        )}

        {editable && !inTable && (
          <>
            <ContextMenuSeparator />
            <ContextMenuSub>
              <ContextMenuSubTrigger className="py-1.5 text-sm">Insert</ContextMenuSubTrigger>
              <ContextMenuSubContent className="w-44 rounded-lg">
                <ContextMenuItem
                  onSelect={() =>
                    editor
                      .chain()
                      .focus()
                      .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
                      .run()
                  }
                >
                  <TableIcon className="h-3.5 w-3.5" /> 3 × 3 table
                </ContextMenuItem>
                <ContextMenuItem onSelect={() => editor.chain().focus().setHorizontalRule().run()}>
                  Horizontal line
                </ContextMenuItem>
                <ContextMenuItem onSelect={() => insertHtml(editor, pageBreakSnippet())}>
                  Page break
                </ContextMenuItem>
              </ContextMenuSubContent>
            </ContextMenuSub>
            <ContextMenuItem
              onSelect={() => editor.chain().focus().clearNodes().unsetAllMarks().run()}
            >
              <RemoveFormatting className="h-3.5 w-3.5" /> Clear formatting
            </ContextMenuItem>
          </>
        )}

        <ContextMenuSeparator />
        <ContextMenuItem
          disabled={!editable || !editor.can().undo()}
          onSelect={() => editor.chain().focus().undo().run()}
        >
          <Undo className="h-3.5 w-3.5" /> Undo
          <ContextMenuShortcut>⌘Z</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem
          disabled={!editable || !editor.can().redo()}
          onSelect={() => editor.chain().focus().redo().run()}
        >
          <Redo className="h-3.5 w-3.5" /> Redo
          <ContextMenuShortcut>⌘⇧Z</ContextMenuShortcut>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
