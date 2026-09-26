import type { Editor } from '@tiptap/react'

export interface OutlineItem {
  id: string
  level: number
  text: string
  pos: number
}

export function extractOutlineFromEditor(editor: Editor): OutlineItem[] {
  const items: OutlineItem[] = []
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== 'heading') return
    const level = Number(node.attrs.level) || 1
    items.push({
      id: `heading-${pos}`,
      level,
      text: node.textContent.trim() || 'Untitled section',
      pos
    })
  })
  return items
}

export function extractOutline(html: string): OutlineItem[] {
  if (!html) return []
  const items: OutlineItem[] = []
  const re = /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi
  let match: RegExpExecArray | null
  let index = 0
  while ((match = re.exec(html))) {
    const text = match[2]
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    items.push({
      id: `heading-${index}`,
      level: Number(match[1]),
      text: text || 'Untitled section',
      pos: index
    })
    index += 1
  }
  return items
}

export function outlineOccurrenceIndex(
  items: Array<{ text: string }>,
  itemIndex: number
): number {
  const target = items[itemIndex]?.text.trim().toLowerCase()
  if (!target) return 0
  let occurrence = 0
  for (let index = 0; index < itemIndex; index += 1) {
    if (items[index]?.text.trim().toLowerCase() === target) occurrence += 1
  }
  return occurrence
}

export function navigateToOutlineItem(
  editor: Editor,
  item: { text: string; pos?: number },
  occurrence = 0
): boolean {
  if (typeof item.pos === 'number' && item.pos >= 0) {
    const node = editor.state.doc.nodeAt(item.pos)
    if (node?.type.name === 'heading') {
      editor.chain().focus().setTextSelection(item.pos + 1).scrollIntoView().run()
      return true
    }
  }
  const target = item.text.trim().toLowerCase()
  let seen = 0
  let found = false
  editor.state.doc.descendants((node, pos) => {
    if (found) return false
    if (node.type.name === 'heading' && node.textContent.trim().toLowerCase() === target) {
      if (seen === occurrence) {
        editor.chain().focus().setTextSelection(pos + 1).scrollIntoView().run()
        found = true
        return false
      }
      seen += 1
    }
    return true
  })
  return found
}
