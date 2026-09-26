import type { EditorView } from '@tiptap/pm/view'
import type { Slice } from '@tiptap/pm/model'
import type { Editor } from '@tiptap/react'

const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml'])

function readImageFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (file.size > 8 * 1024 * 1024) {
      reject(new Error('Image must be smaller than 8 MB.'))
      return
    }
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Failed to read image file.'))
    reader.readAsDataURL(file)
  })
}

function insertImageAt(view: EditorView, src: string, event?: DragEvent): boolean {
  const imageType = view.state.schema.nodes.image
  if (!imageType) return false
  const pos = event
    ? view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos ?? view.state.selection.from
    : view.state.selection.from
  const node = imageType.create({ src })
  const tr = view.state.tr.insert(pos, node)
  view.dispatch(tr)
  return true
}

async function insertImages(view: EditorView, files: FileList | File[], event?: DragEvent): Promise<boolean> {
  const images = Array.from(files).filter((file) => IMAGE_TYPES.has(file.type) || file.type.startsWith('image/'))
  if (images.length === 0) return false
  try {
    for (const file of images) {
      const src = await readImageFile(file)
      insertImageAt(view, src, event)
    }
    return true
  } catch (error) {
    window.alert(error instanceof Error ? error.message : 'Could not insert image.')
    return true
  }
}

export function pastePlainText(editor: Editor, text: string): void {
  if (!text) return
  editor.chain().focus().insertContent(text.replace(/\r\n/g, '\n')).run()
}

export async function pastePlainFromClipboard(editor: Editor): Promise<void> {
  try {
    const text = await navigator.clipboard.readText()
    pastePlainText(editor, text)
  } catch {
    window.alert('Could not read clipboard.')
  }
}

export const handleEditorClipboard = {
  handlePaste(view: EditorView, event: ClipboardEvent, _slice: Slice): boolean {
    const files = event.clipboardData?.files
    if (files && files.length > 0) {
      const hasImage = Array.from(files).some((file) => file.type.startsWith('image/'))
      if (hasImage) {
        event.preventDefault()
        void insertImages(view, files)
        return true
      }
    }
    const items = event.clipboardData?.items
    if (items) {
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile()
          if (file) {
            event.preventDefault()
            void insertImages(view, [file])
            return true
          }
        }
      }
    }
    return false
  },

  handleDrop(view: EditorView, event: DragEvent, _slice: Slice, moved: boolean): boolean {
    if (moved) return false
    const files = event.dataTransfer?.files
    if (!files || files.length === 0) return false
    const hasImage = Array.from(files).some((file) => file.type.startsWith('image/'))
    if (!hasImage) return false
    event.preventDefault()
    void insertImages(view, files, event)
    return true
  }
}
