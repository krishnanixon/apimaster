import Table from '@tiptap/extension-table'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import type { Editor } from '@tiptap/react'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { NodeSelection } from '@tiptap/pm/state'

export type TableStyle = 'grid' | 'striped' | 'bordered' | 'minimal'
export type TableSize = 'compact' | 'normal' | 'spacious'
export type TableWidth = 'auto' | 'full'

export interface TableDesignAttributes {
  tableStyle?: TableStyle
  tableSize?: TableSize
  tableWidth?: TableWidth
}

function currentTableNode(editor: Editor): { node: ProseMirrorNode; pos: number } | null {
  const { selection } = editor.state

  if (selection instanceof NodeSelection && selection.node.type.name === 'table') {
    return { node: selection.node, pos: selection.from }
  }

  const { $from } = selection
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth)
    if (node.type.name === 'table') {
      return { node, pos: $from.before(depth) }
    }
  }

  return null
}

export function getCurrentTableDesign(editor: Editor): TableDesignAttributes {
  const table = currentTableNode(editor)
  if (!table) return {}
  return {
    tableStyle: (table.node.attrs.tableStyle as TableStyle | undefined) ?? 'grid',
    tableSize: (table.node.attrs.tableSize as TableSize | undefined) ?? 'compact',
    tableWidth: (table.node.attrs.tableWidth as TableWidth | undefined) ?? 'full'
  }
}

/** Update the table containing the current selection, including when the
 * selection is collapsed inside a cell. */
export function updateCurrentTableDesign(
  editor: Editor,
  attributes: TableDesignAttributes
): boolean {
  const table = currentTableNode(editor)
  if (!table) return false

  const transaction = editor.state.tr.setNodeMarkup(table.pos, undefined, {
    ...table.node.attrs,
    ...attributes
  })
  editor.view.dispatch(transaction)
  editor.commands.focus()
  return true
}

export const StyledTable = Table.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      tableStyle: {
        default: 'grid' satisfies TableStyle,
        parseHTML: (element: HTMLElement) => element.getAttribute('data-table-style') || 'grid',
        renderHTML: (attributes: { tableStyle?: TableStyle }) => ({
          'data-table-style': attributes.tableStyle || 'grid'
        })
      },
      tableSize: {
        default: 'compact' satisfies TableSize,
        parseHTML: (element: HTMLElement) => element.getAttribute('data-table-size') || 'compact',
        renderHTML: (attributes: { tableSize?: TableSize }) => ({
          'data-table-size': attributes.tableSize || 'compact'
        })
      },
      tableWidth: {
        default: 'full' satisfies TableWidth,
        parseHTML: (element: HTMLElement) => element.getAttribute('data-table-width') || 'full',
        renderHTML: (attributes: { tableWidth?: TableWidth }) => ({
          'data-table-width': attributes.tableWidth || 'full'
        })
      }
    }
  }
})

function extraCellAttributes() {
  return {
    backgroundColor: {
      default: null as string | null,
      parseHTML: (element: HTMLElement) =>
        element.getAttribute?.('data-bg') || element.style?.backgroundColor || null,
      renderHTML: (attributes: { backgroundColor?: string | null }) => {
        if (!attributes.backgroundColor) return {}
        return {
          'data-bg': attributes.backgroundColor,
          style: `background-color: ${attributes.backgroundColor}`
        }
      }
    },
    verticalAlign: {
      default: null as string | null,
      parseHTML: (element: HTMLElement) =>
        element.getAttribute?.('data-valign') || element.style?.verticalAlign || null,
      renderHTML: (attributes: { verticalAlign?: string | null }) => {
        if (!attributes.verticalAlign) return {}
        return { 'data-valign': attributes.verticalAlign }
      }
    },
    borderColor: {
      default: null as string | null,
      parseHTML: (element: HTMLElement) =>
        element.getAttribute?.('data-border-color') || element.style?.borderColor || null,
      renderHTML: (attributes: { borderColor?: string | null }) => {
        if (!attributes.borderColor) return {}
        return {
          'data-border-color': attributes.borderColor,
          style: `border-color: ${attributes.borderColor}`
        }
      }
    }
  }
}

export const StyledTableCell = TableCell.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      ...extraCellAttributes()
    }
  }
})

export const StyledTableHeader = TableHeader.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      ...extraCellAttributes()
    }
  }
})
