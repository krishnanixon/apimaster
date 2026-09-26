import Image from '@tiptap/extension-image'
import { mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { ImageNodeView } from '@/features/editor/components/image/ImageNodeView'

export type ImageAlign = 'left' | 'center' | 'right'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    resizableImage: {
      updateImageAttributes: (attrs: {
        align?: ImageAlign
        width?: string | null
        alt?: string
      }) => ReturnType
    }
  }
}

export const ResizableImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      align: {
        default: 'center' as ImageAlign,
        parseHTML: (element) => {
          const el = element as HTMLElement
          const fromWrapper = el.getAttribute('data-align') || el.closest('[data-align]')?.getAttribute('data-align')
          return (fromWrapper as ImageAlign) || 'center'
        },
        renderHTML: (attributes) => ({
          'data-align': attributes.align
        })
      },
      width: {
        default: null,
        parseHTML: (element) => {
          const el = element as HTMLElement
          const img = el.tagName === 'IMG' ? el : el.querySelector('img')
          if (!img) return null
          return img.getAttribute('width') || img.style.width || null
        },
        renderHTML: (attributes) => {
          if (!attributes.width) return {}
          return { style: `width: ${attributes.width}` }
        }
      }
    }
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="image-block"]',
        getAttrs: (dom) => {
          const element = dom as HTMLElement
          const img = element.querySelector('img')
          if (!img?.getAttribute('src')) return false
          return {
            src: img.getAttribute('src'),
            alt: img.getAttribute('alt'),
            title: img.getAttribute('title'),
            align: element.getAttribute('data-align') || 'center',
            width: img.style.width || img.getAttribute('width')
          }
        }
      },
      {
        tag: this.options.allowBase64 ? 'img[src]' : 'img[src]:not([src^="data:"])',
        getAttrs: (dom) => {
          const img = dom as HTMLImageElement
          return {
            src: img.getAttribute('src'),
            alt: img.getAttribute('alt'),
            title: img.getAttribute('title'),
            align: 'center',
            width: img.style.width || img.getAttribute('width')
          }
        }
      }
    ]
  },

  renderHTML({ node, HTMLAttributes }) {
    const align = (node.attrs.align as ImageAlign) || 'center'
    const width = node.attrs.width as string | null
    const imgAttrs = mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
      ...(width ? { style: `width: ${width}` } : {})
    })

    return [
      'div',
      {
        'data-type': 'image-block',
        'data-align': align,
        class: `image-block image-align-${align}`
      },
      ['img', imgAttrs]
    ]
  },

  addCommands() {
    return {
      ...this.parent?.(),
      updateImageAttributes:
        (attrs) =>
        ({ commands }) =>
          commands.updateAttributes(this.name, attrs)
    }
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageNodeView)
  }
})
