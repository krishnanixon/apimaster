import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Underline from '@tiptap/extension-underline'
import Link from '@tiptap/extension-link'
import Highlight from '@tiptap/extension-highlight'
import TextStyle from '@tiptap/extension-text-style'
import Color from '@tiptap/extension-color'
import TextAlign from '@tiptap/extension-text-align'
import Subscript from '@tiptap/extension-subscript'
import Superscript from '@tiptap/extension-superscript'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import TableRow from '@tiptap/extension-table-row'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import { common, createLowlight } from 'lowlight'
import { ResizableImage } from '@/features/editor/extensions/resizable-image'
import { FontSize } from '@/features/editor/extensions/font-size'
import { FontFamily } from '@/features/editor/extensions/font-family'
import { LineHeight } from '@/features/editor/extensions/line-height'
import { Callout } from '@/features/editor/extensions/callout'
import { PageBreak } from '@/features/editor/extensions/page-break'
import { TableOfContents } from '@/features/editor/extensions/table-of-contents'
import { FlowBlock } from '@/features/editor/extensions/flow-block'
import { CommentMark } from '@/features/editor/extensions/comment-mark'
import {
  StyledTable,
  StyledTableCell,
  StyledTableHeader
} from '@/features/editor/extensions/styled-table'
import { DocumentKeyboard } from '@/features/editor/extensions/document-keyboard'
import { handleEditorClipboard } from '@/features/editor/lib/clipboard'

const lowlight = createLowlight(common)

export function createDocumentExtensions(placeholder: string) {
  return [
    StarterKit.configure({
      codeBlock: false,
      heading: { levels: [1, 2, 3, 4, 5, 6] }
    }),
    Placeholder.configure({ placeholder }),
    Underline,
    TextStyle,
    Color,
    FontSize,
    FontFamily,
    LineHeight,
    Subscript,
    Superscript,
    TextAlign.configure({ types: ['heading', 'paragraph', 'tableCell', 'tableHeader'] }),
    Link.configure({
      openOnClick: false,
      autolink: true,
      linkOnPaste: true,
      HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' }
    }),
    ResizableImage.configure({ allowBase64: true, inline: false }),
    Highlight.configure({ multicolor: true }),
    TaskList,
    TaskItem.configure({ nested: true }),
    StyledTable.configure({ resizable: true }),
    TableRow,
    StyledTableHeader,
    StyledTableCell,
    CodeBlockLowlight.configure({ lowlight }),
    Callout,
    PageBreak,
    TableOfContents,
    FlowBlock,
    CommentMark,
    DocumentKeyboard
  ]
}

export function createDocumentEditorProps() {
  return {
    attributes: {
      class: 'tiptap max-w-none focus:outline-none'
    },
    handlePaste: handleEditorClipboard.handlePaste,
    handleDrop: handleEditorClipboard.handleDrop
  }
}
