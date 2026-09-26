import { Mark, mergeAttributes } from '@tiptap/core'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    comment: {
      setComment: (commentId: string) => ReturnType
      unsetComment: (commentId?: string) => ReturnType
    }
  }
}

export const CommentMark = Mark.create({
  name: 'comment',
  excludes: '',
  inclusive: false,
  spanning: true,

  addAttributes() {
    return {
      commentId: {
        default: null,
        parseHTML: (element) => (element as HTMLElement).getAttribute('data-comment-id'),
        renderHTML: (attributes) => {
          if (!attributes.commentId) return {}
          return { 'data-comment-id': attributes.commentId }
        }
      }
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-comment-id]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { class: 'doc-comment-mark' }), 0]
  },

  addCommands() {
    return {
      setComment:
        (commentId: string) =>
        ({ commands }) =>
          commands.setMark(this.name, { commentId }),
      unsetComment:
        (commentId?: string) =>
        ({ tr, state, dispatch }) => {
          const { from, to } = state.selection
          const markType = state.schema.marks.comment
          if (!markType) return false
          if (commentId) {
            state.doc.nodesBetween(0, state.doc.content.size, (node, pos) => {
              const mark = node.marks.find((m) => m.type === markType && m.attrs.commentId === commentId)
              if (mark) {
                tr.removeMark(pos, pos + node.nodeSize, markType)
              }
            })
          } else {
            tr.removeMark(from, to, markType)
          }
          dispatch?.(tr)
          return true
        }
    }
  }
})
