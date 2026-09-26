export type ClipboardTransformAction = 'fix_grammar' | 'improve' | 'summarize'

export type ClipboardIntent =
  | { kind: 'transform'; action: ClipboardTransformAction }
  | { kind: 'ask_about'; question: string }
  | null

/** Detect Ok-Google-style clipboard commands from a spoken utterance. */
export function detectClipboardIntent(utterance: string): ClipboardIntent {
  const text = utterance.trim()
  if (!text) return null

  const mentionsClipboard =
    /\b(clipboard|last copy|copied text|what i copied|my copy|this copy|that copy)\b/i.test(text) ||
    /\b(last|my)\s+(copied|copy)\b/i.test(text)

  if (
    /\b(fix|correct|check)\b[\s\w]{0,24}\b(grammar|spelling|typos?)\b/i.test(text) ||
    /\b(grammar|spelling)\s+(fix|correct)\b/i.test(text)
  ) {
    return { kind: 'transform', action: 'fix_grammar' }
  }

  if (
    /\b(summarize|summary|sum\s*up|tl;?dr|make\s+(a\s+)?summary)\b/i.test(text) &&
    (mentionsClipboard || text.split(/\s+/).length <= 8)
  ) {
    return { kind: 'transform', action: 'summarize' }
  }

  if (
    /\b(improve|rewrite|polish|rephrase|make\s+better)\b/i.test(text) &&
    (mentionsClipboard ||
      /\b(it|this|text|writing|copy|clipboard)\b/i.test(text) ||
      text.split(/\s+/).length <= 6)
  ) {
    return { kind: 'transform', action: 'improve' }
  }

  if (mentionsClipboard) {
    return { kind: 'ask_about', question: text }
  }

  return null
}
