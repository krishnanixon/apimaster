import type { Editor } from '@tiptap/react'

export interface FindOptions {
  caseSensitive?: boolean
  wholeWord?: boolean
  regex?: boolean
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function buildFindPattern(query: string, options: FindOptions = {}): RegExp | null {
  const q = query.trim()
  if (!q) return null
  try {
    const source = options.regex ? q : escapeRegExp(q)
    const wrapped = options.wholeWord ? `\\b(?:${source})\\b` : source
    return new RegExp(wrapped, options.caseSensitive ? 'g' : 'gi')
  } catch {
    return null
  }
}

export function collectTextMatches(
  editor: Editor,
  query: string,
  options: FindOptions = {}
): { from: number; to: number }[] {
  const pattern = buildFindPattern(query, options)
  if (!pattern) return []
  const matches: { from: number; to: number }[] = []
  editor.state.doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return
    const re = new RegExp(pattern.source, pattern.flags)
    let match: RegExpExecArray | null
    while ((match = re.exec(node.text))) {
      if (match[0].length === 0) {
        re.lastIndex += 1
        continue
      }
      matches.push({ from: pos + match.index, to: pos + match.index + match[0].length })
    }
  })
  return matches
}

export function findNextInEditor(
  editor: Editor,
  query: string,
  options: FindOptions = {},
  direction: 'next' | 'previous' = 'next'
): boolean {
  const matches = collectTextMatches(editor, query, options)
  if (matches.length === 0) return false
  const cursor = direction === 'next' ? editor.state.selection.to : editor.state.selection.from
  const target =
    direction === 'next'
      ? (matches.find((m) => m.from >= cursor) ?? matches[0])
      : ([...matches].reverse().find((m) => m.to <= cursor) ?? matches[matches.length - 1])
  editor.chain().focus().setTextSelection(target).scrollIntoView().run()
  return true
}

export function replaceInEditor(
  editor: Editor,
  query: string,
  replacement: string,
  all: boolean,
  options: FindOptions = {}
): number {
  const q = query.trim()
  if (!q) return 0
  if (all) {
    const matches = collectTextMatches(editor, q, options)
    if (matches.length === 0) return 0
    let tr = editor.state.tr
    for (let i = matches.length - 1; i >= 0; i--) {
      tr = tr.insertText(replacement, matches[i].from, matches[i].to)
    }
    editor.view.dispatch(tr)
    return matches.length
  }
  const { from, to } = editor.state.selection
  const selected = editor.state.doc.textBetween(from, to)
  const pattern = buildFindPattern(q, { ...options, regex: false })
  const selectedMatches =
    options.regex || options.wholeWord
      ? Boolean(pattern && new RegExp(`^(?:${pattern.source})$`, pattern.flags.replace('g', '')).test(selected))
      : options.caseSensitive
        ? selected === q
        : selected.toLowerCase() === q.toLowerCase()
  if (from !== to && selectedMatches) {
    editor.chain().focus().insertContentAt({ from, to }, replacement).run()
    return 1
  }
  if (!findNextInEditor(editor, q, options, 'next')) return 0
  const sel = editor.state.selection
  editor.chain().focus().insertContentAt({ from: sel.from, to: sel.to }, replacement).run()
  return 1
}
