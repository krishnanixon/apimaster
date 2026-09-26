import type { Editor } from '@tiptap/react'

export function insertImageFromFile(editor: Editor): void {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/png,image/jpeg,image/gif,image/webp,image/svg+xml'
  input.onchange = () => {
    const file = input.files?.[0]
    if (!file) return
    if (file.size > 8 * 1024 * 1024) {
      window.alert('Image must be smaller than 8 MB.')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const src = reader.result as string
      editor.chain().focus().setImage({ src, alt: file.name }).run()
    }
    reader.onerror = () => window.alert('Failed to read image file.')
    reader.readAsDataURL(file)
  }
  input.click()
}

export function insertImageFromUrl(editor: Editor, url: string): void {
  const trimmed = url.trim()
  if (!trimmed) return
  editor.chain().focus().setImage({ src: trimmed }).run()
}

export function setEditorLink(editor: Editor, url: string, text?: string): void {
  const trimmed = url.trim()
  if (!trimmed) {
    editor.chain().focus().extendMarkRange('link').unsetLink().run()
    return
  }

  const href = normalizeLinkHref(trimmed)
  const { empty } = editor.state.selection

  if (!empty) {
    editor.chain().focus().extendMarkRange('link').setLink({ href }).run()
    return
  }

  const label = (text?.trim() || trimmed).replace(/</g, '&lt;').replace(/>/g, '&gt;')
  editor.chain().focus().insertContent(`<a href="${href}">${label}</a>`).run()
}

export function normalizeLinkHref(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return trimmed
  if (/^(https?:\/\/|mailto:|tel:|#|\/)/i.test(trimmed)) return trimmed
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return `mailto:${trimmed}`
  return `https://${trimmed}`
}

export function removeEditorLink(editor: Editor): void {
  editor.chain().focus().extendMarkRange('link').unsetLink().run()
}
