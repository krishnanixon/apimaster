import { Node, mergeAttributes } from '@tiptap/core'

export type CalloutVariant = 'note' | 'info' | 'warning' | 'tip'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    callout: {
      setCallout: (variant?: CalloutVariant) => ReturnType
      toggleCallout: (variant?: CalloutVariant) => ReturnType
    }
  }
}

export const Callout = Node.create({
  name: 'callout',
  group: 'block',
  content: 'block+',
  defining: true,

  addAttributes() {
    return {
      variant: {
        default: 'note' as CalloutVariant,
        parseHTML: (element) =>
          ((element as HTMLElement).getAttribute('data-variant') as CalloutVariant) || 'note',
        renderHTML: (attributes) => ({ 'data-variant': attributes.variant })
      }
    }
  },

  parseHTML() {
    return [{ tag: 'aside[data-type="callout"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['aside', mergeAttributes(HTMLAttributes, { 'data-type': 'callout', class: 'doc-callout' }), 0]
  },

  addCommands() {
    return {
      setCallout:
        (variant: CalloutVariant = 'note') =>
        ({ commands }) =>
          commands.wrapIn(this.name, { variant }),
      toggleCallout:
        (variant: CalloutVariant = 'note') =>
        ({ commands }) =>
          commands.toggleWrap(this.name, { variant })
    }
  }
})
