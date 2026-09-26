import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { FlowBlockNodeView } from '@/features/editor/components/flow/FlowBlockNodeView'

export interface FlowBlockAttrs {
  flowId: string
  title: string
  height: number
  slotKey: string
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    flowBlock: {
      insertFlowBlock: (attrs: Partial<FlowBlockAttrs>) => ReturnType
      updateFlowBlock: (attrs: Partial<FlowBlockAttrs>) => ReturnType
    }
  }
}

export const FlowBlock = Node.create({
  name: 'flowBlock',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      flowId: {
        default: '',
        parseHTML: (element) => (element as HTMLElement).getAttribute('data-flow-id') || '',
        renderHTML: (attributes) => ({ 'data-flow-id': attributes.flowId || '' })
      },
      title: {
        default: 'Flowchart',
        parseHTML: (element) => (element as HTMLElement).getAttribute('data-title') || 'Flowchart',
        renderHTML: (attributes) => ({ 'data-title': attributes.title || 'Flowchart' })
      },
      height: {
        default: 360,
        parseHTML: (element) => {
          const raw = (element as HTMLElement).getAttribute('data-height')
          const n = raw ? Number(raw) : 360
          return Number.isFinite(n) ? n : 360
        },
        renderHTML: (attributes) => ({ 'data-height': String(attributes.height ?? 360) })
      },
      slotKey: {
        default: '',
        parseHTML: (element) => (element as HTMLElement).getAttribute('data-slot-key') || '',
        renderHTML: (attributes) =>
          attributes.slotKey ? { 'data-slot-key': attributes.slotKey } : {}
      }
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="flow-block"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'flow-block',
        class: 'doc-flow-block'
      })
    ]
  },

  addCommands() {
    return {
      insertFlowBlock:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: {
              flowId: attrs.flowId ?? '',
              title: attrs.title ?? 'Flowchart',
              height: attrs.height ?? 360,
              slotKey: attrs.slotKey ?? ''
            }
          }),
      updateFlowBlock:
        (attrs) =>
        ({ commands }) =>
          commands.updateAttributes(this.name, attrs)
    }
  },

  addNodeView() {
    return ReactNodeViewRenderer(FlowBlockNodeView)
  }
})
