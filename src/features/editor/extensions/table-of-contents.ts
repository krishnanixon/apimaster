import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { TocNodeView } from '@/features/editor/components/TocNodeView'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    tableOfContents: {
      insertTableOfContents: () => ReturnType
    }
  }
}

export const TableOfContents = Node.create({
  name: 'tableOfContents',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  parseHTML() {
    return [{ tag: 'nav[data-type="table-of-contents"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'nav',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'table-of-contents',
        class: 'doc-toc'
      })
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer(TocNodeView)
  },

  addCommands() {
    return {
      insertTableOfContents:
        () =>
        ({ commands }) =>
          commands.insertContent({ type: this.name })
    }
  }
})
