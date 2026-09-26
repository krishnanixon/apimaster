/** Helpers for in-editor AI (Cmd+K rewrite, Tab completions, next-edit, @ mentions). */

export type EditorAiKind = 'inline-edit' | 'inline-ask' | 'completion' | 'next-edit'

export interface EditorAiChatMessage {
  role: 'system' | 'user'
  content: string
}

export interface MentionQuery {
  start: number
  query: string
}

export const SPECIAL_MENTIONS = [
  { id: 'codebase', label: '@codebase', hint: 'Search the workspace index' },
  { id: 'git', label: '@git', hint: 'Changed files and diffs' },
  { id: 'selection', label: '@selection', hint: 'Highlighted editor code' },
  { id: 'problems', label: '@problems', hint: 'Current diagnostics and Problems panel' },
  { id: 'rules', label: '@rules', hint: 'Project instructions and conventions' }
] as const

const EXT_LANGUAGE: Record<string, string> = {
  ts: 'typescript',
  tsx: 'tsx',
  js: 'javascript',
  jsx: 'jsx',
  mjs: 'javascript',
  cjs: 'javascript',
  py: 'python',
  rs: 'rust',
  go: 'go',
  java: 'java',
  kt: 'kotlin',
  cs: 'csharp',
  cpp: 'cpp',
  cc: 'cpp',
  cxx: 'cpp',
  h: 'c',
  hpp: 'cpp',
  c: 'c',
  rb: 'ruby',
  php: 'php',
  swift: 'swift',
  json: 'json',
  md: 'markdown',
  css: 'css',
  scss: 'scss',
  html: 'html',
  vue: 'vue',
  svelte: 'svelte',
  sql: 'sql',
  sh: 'bash',
  bash: 'bash',
  yml: 'yaml',
  yaml: 'yaml'
}

export function languageFromPath(filePath: string): string {
  const base = filePath.replace(/\\/g, '/').split('/').pop() ?? ''
  const dot = base.lastIndexOf('.')
  if (dot < 0) return ''
  return EXT_LANGUAGE[base.slice(dot + 1).toLowerCase()] ?? base.slice(dot + 1).toLowerCase()
}

export function windowAround(
  doc: string,
  from: number,
  to: number,
  prefixMax = 6_000,
  suffixMax = 4_000
): { prefix: string; suffix: string } {
  const start = Math.max(0, from - prefixMax)
  const end = Math.min(doc.length, to + suffixMax)
  return { prefix: doc.slice(start, from), suffix: doc.slice(to, end) }
}

/**
 * Show only the code the model intends to insert, stripping markdown fences
 * even while the stream is still incomplete.
 */
export function visibleCodeFromStream(raw: string): string {
  let text = raw.replace(/^\uFEFF/, '')
  const open = text.match(/^```[a-zA-Z0-9_+\-]*\r?\n/)
  if (open) {
    text = text.slice(open[0].length)
  } else if (/^```[a-zA-Z0-9_+\-]*\s*$/.test(text) || text === '`' || text === '``' || text === '```') {
    return ''
  }
  const closeAt = text.search(/\r?\n```[ \t]*(?:\r?\n)?$/)
  if (closeAt >= 0) return text.slice(0, closeAt)
  if (text.endsWith('\n```')) return text.slice(0, -4)
  const trimmed = text.replace(/\s+$/, '')
  if (trimmed.endsWith('```') && trimmed !== '```') {
    const without = trimmed.slice(0, -3).replace(/\s+$/, '')
    if (without) return without
  }
  const lastNl = text.lastIndexOf('\n')
  const lastLine = lastNl >= 0 ? text.slice(lastNl + 1).trim() : text.trim()
  if (lastLine === '```') return lastNl >= 0 ? text.slice(0, lastNl) : ''
  return text
}

export function stripCompletedFences(raw: string): string {
  return visibleCodeFromStream(raw).replace(/\s+$/, '')
}

/**
 * Drop a completion that merely restates text already after the cursor.
 */
export function trimCompletionOverlap(suggestion: string, suffix: string): string {
  if (!suggestion) return ''
  let text = suggestion
  if (text.startsWith('\n') && suffix.startsWith('\n')) text = text.slice(1)
  const suffixLine = suffix.split(/\r?\n/, 1)[0] ?? ''
  if (suffixLine && text.startsWith(suffixLine)) {
    text = text.slice(suffixLine.length)
    if (text.startsWith('\n') && suffix.charAt(suffixLine.length) === '\n') text = text.slice(1)
  }
  if (!text.trim()) return ''
  const probe = suffix.slice(0, Math.min(text.length, suffix.length))
  if (probe && text.startsWith(probe)) return ''
  if (suffix.startsWith(text)) return ''
  return text
}

export function shouldTriggerCompletion(params: {
  docLength: number
  selectionEmpty: boolean
  typedChars: number
  inlineEditOpen: boolean
  completionsEnabled: boolean
}): boolean {
  if (!params.completionsEnabled || params.inlineEditOpen) return false
  if (!params.selectionEmpty) return false
  if (params.docLength > 250_000) return false
  if (params.typedChars <= 0 || params.typedChars > 80) return false
  return true
}

export function mentionQueryAt(text: string, cursor: number): MentionQuery | null {
  const pos = Math.max(0, Math.min(cursor, text.length))
  const before = text.slice(0, pos)
  const match = /@([^\s@]*)$/.exec(before)
  if (!match) return null
  const start = before.length - match[0].length
  if (start > 0 && /[\w.]/.test(text.charAt(start - 1))) return null
  return { start, query: match[1] ?? '' }
}

export function applyMention(
  text: string,
  mention: MentionQuery,
  insertion: string,
  cursor: number
): { text: string; cursor: number } {
  const token = insertion.startsWith('@') ? insertion : `@${insertion}`
  const withSpace = token.endsWith(' ') ? token : `${token} `
  const next = text.slice(0, mention.start) + withSpace + text.slice(Math.max(cursor, mention.start))
  return { text: next, cursor: mention.start + withSpace.length }
}

export function filterSpecialMentions(query: string): typeof SPECIAL_MENTIONS[number][] {
  const q = query.trim().toLowerCase()
  if (!q) return [...SPECIAL_MENTIONS]
  return SPECIAL_MENTIONS.filter((item) => item.id.includes(q) || item.label.toLowerCase().includes(q))
}

export function buildInlineEditMessages(input: {
  instruction: string
  filePath?: string
  language?: string
  prefix: string
  suffix: string
  selection: string
}): EditorAiChatMessage[] {
  const language = input.language || (input.filePath ? languageFromPath(input.filePath) : '')
  const where = input.filePath ? `File: ${input.filePath}${language ? ` (${language})` : ''}` : language
  const target = input.selection
    ? 'Rewrite ONLY the selection. Keep surrounding code untouched.'
    : 'The selection is empty — return code to insert at the cursor.'
  return [
    {
      role: 'system',
      content: `You are an in-editor code rewrite assistant.
Apply the user's instruction to the code between <SELECTION> tags.
${target}
Return ONLY the replacement code. No markdown fences, no commentary, no <SELECTION> tags.
Preserve the original indentation style and surrounding quotes/brackets.`
    },
    {
      role: 'user',
      content: `Instruction: ${input.instruction}

${where}

Code before:
${input.prefix}<SELECTION>
${input.selection}</SELECTION>
Code after:
${input.suffix}`
    }
  ]
}

export function buildInlineAskMessages(input: {
  instruction: string
  filePath?: string
  language?: string
  prefix: string
  suffix: string
  selection: string
}): EditorAiChatMessage[] {
  const language = input.language || (input.filePath ? languageFromPath(input.filePath) : '')
  const where = input.filePath ? `File: ${input.filePath}${language ? ` (${language})` : ''}` : language
  const focus = input.selection.trim()
    ? `The user highlighted this code:\n${input.selection}`
    : 'No selection — answer about the code around the cursor.'
  return [
    {
      role: 'system',
      content: `You are an in-editor coding assistant.
Answer the user's question about the code. Be concise and specific.
Do not rewrite the file unless they ask how to change it. Use markdown when helpful.`
    },
    {
      role: 'user',
      content: `Question: ${input.instruction}

${where}

${focus}

Code before cursor:
${input.prefix}
Code after cursor:
${input.suffix}`
    }
  ]
}

export function buildCompletionMessages(input: {
  filePath?: string
  language?: string
  prefix: string
  suffix: string
}): EditorAiChatMessage[] {
  const language = input.language || (input.filePath ? languageFromPath(input.filePath) : '')
  const where = input.filePath ? `File: ${input.filePath}${language ? ` (${language})` : ''}` : language
  return [
    {
      role: 'system',
      content: `You complete code at the cursor (fill-in-the-middle).
Return ONLY the text that should be inserted at <CURSOR>.
Do not repeat the prefix or suffix. No markdown fences, no quotes, no explanation.
Keep it short: usually the rest of the current line or a few lines, stopping at a natural boundary.`
    },
    {
      role: 'user',
      content: `${where}

${input.prefix}<CURSOR>${input.suffix}`
    }
  ]
}

/** After Tab/inline accept — predict the next nearby edit (Cursor-style NEP). */
export function buildNextEditMessages(input: {
  filePath?: string
  language?: string
  prefix: string
  suffix: string
  recentEdit: string
}): EditorAiChatMessage[] {
  const language = input.language || (input.filePath ? languageFromPath(input.filePath) : '')
  const where = input.filePath ? `File: ${input.filePath}${language ? ` (${language})` : ''}` : language
  const recent = input.recentEdit.trim().slice(0, 1_200)
  return [
    {
      role: 'system',
      content: `You predict the NEXT edit after the user just accepted a change at <CURSOR>.
Return ONLY the text to insert at <CURSOR> for the logical follow-up edit.
Do not repeat the prefix, suffix, or the recent edit. No markdown fences, no commentary.
Keep it short (often 1–6 lines). If no clear next edit exists, return an empty response.`
    },
    {
      role: 'user',
      content: `${where}

Recently accepted edit:
${recent || '(small edit)'}

${input.prefix}<CURSOR>${input.suffix}`
    }
  ]
}
