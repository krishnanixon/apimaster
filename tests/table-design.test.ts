import { describe, expect, it, vi } from 'vitest'
import type { Editor } from '@tiptap/react'
import {
  getCurrentTableDesign,
  updateCurrentTableDesign
} from '../src/features/editor/extensions/styled-table'

function editorInsideTable(attributes: Record<string, unknown>) {
  const tableNode = { type: { name: 'table' }, attrs: attributes }
  const transaction = {
    setNodeMarkup: vi.fn().mockReturnThis()
  }
  const dispatch = vi.fn()
  const focus = vi.fn(() => true)
  const editor = {
    state: {
      selection: {
        $from: {
          depth: 3,
          node: (depth: number) =>
            depth === 1 ? tableNode : { type: { name: depth === 2 ? 'tableCell' : 'paragraph' } },
          before: (depth: number) => (depth === 1 ? 7 : 0)
        }
      },
      tr: transaction
    },
    view: { dispatch },
    commands: { focus }
  } as unknown as Editor

  return { editor, transaction, dispatch, focus }
}

describe('table design controls', () => {
  it('reads design attributes from the table containing a collapsed cell selection', () => {
    const { editor } = editorInsideTable({
      tableStyle: 'striped',
      tableSize: 'spacious',
      tableWidth: 'auto'
    })

    expect(getCurrentTableDesign(editor)).toEqual({
      tableStyle: 'striped',
      tableSize: 'spacious',
      tableWidth: 'auto'
    })
  })

  it('updates the ancestor table node while preserving its other attributes', () => {
    const { editor, transaction, dispatch, focus } = editorInsideTable({
      tableStyle: 'grid',
      tableSize: 'compact',
      tableWidth: 'full',
      colwidth: [120, 160]
    })

    expect(updateCurrentTableDesign(editor, { tableStyle: 'minimal' })).toBe(true)
    expect(transaction.setNodeMarkup).toHaveBeenCalledWith(7, undefined, {
      tableStyle: 'minimal',
      tableSize: 'compact',
      tableWidth: 'full',
      colwidth: [120, 160]
    })
    expect(dispatch).toHaveBeenCalledWith(transaction)
    expect(focus).toHaveBeenCalledOnce()
  })
})
