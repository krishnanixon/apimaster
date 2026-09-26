import { Extension } from '@tiptap/core'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    lineHeight: {
      setLineHeight: (lineHeight: string) => ReturnType
      unsetLineHeight: () => ReturnType
    }
  }
}

export const LineHeight = Extension.create({
  name: 'lineHeight',

  addGlobalAttributes() {
    return [
      {
        types: ['paragraph', 'heading'],
        attributes: {
          lineHeight: {
            default: null,
            parseHTML: (element) => (element as HTMLElement).style?.lineHeight || null,
            renderHTML: (attributes) => {
              if (!attributes.lineHeight) return {}
              return { style: `line-height: ${attributes.lineHeight}` }
            }
          }
        }
      }
    ]
  },

  addCommands() {
    return {
      setLineHeight:
        (lineHeight: string) =>
        ({ commands, editor }) => {
          if (editor.isActive('heading')) return commands.updateAttributes('heading', { lineHeight })
          return commands.updateAttributes('paragraph', { lineHeight })
        },
      unsetLineHeight:
        () =>
        ({ commands, editor }) => {
          if (editor.isActive('heading')) return commands.resetAttributes('heading', 'lineHeight')
          return commands.resetAttributes('paragraph', 'lineHeight')
        }
    }
  }
})
