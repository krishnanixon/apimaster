/**
 * Turns a displayed assistant reply into text that sounds natural when read aloud.
 * Code blocks, markdown syntax, and raw URLs are shown on screen but not spoken.
 */
export function toSpeakableText(text: string): string {
  let hadCode = false
  const spoken = text
    .replace(/```[\s\S]*?(```|$)/g, () => {
      hadCode = true
      return ' '
    })
    .replace(/`([^`\n]+)`/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, 'the link')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/^\s*(?:[-*+•]|\d+[.)])\s+/gm, '')
    .replace(/^\s*[-*_]{3,}\s*$/gm, '')
    .replace(/\|/g, ', ')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/(^|[^\w*])[*_]([^*_\n]+)[*_](?=[^\w*]|$)/g, '$1$2')
    .replace(/~~(.+?)~~/g, '$1')
    // Each line reads as its own sentence so headings and list items do not run together.
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => (/[.!?:;,]$/.test(line) ? line : `${line}.`))
    .join(' ')
    .replace(/\s+([.,!?;:])/g, '$1')
    .replace(/([.!?])\s*\.(\s|$)/g, '$1$2')
    .replace(/\s+/g, ' ')
    .trim()

  if (!hadCode) return spoken
  const note = 'I put the code on screen.'
  return spoken ? `${spoken} ${note}` : note
}

/**
 * Splits speech into sentence-sized chunks so playback can start before the whole
 * reply is synthesized, and so Chromium does not cut off long utterances.
 */
export function splitSpeechChunks(text: string, maxChars = 220): string[] {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (!clean) return []
  if (clean.length <= maxChars) return [clean]

  const sentences = clean.match(/[^.!?]+(?:[.!?]+["')\]]*|$)\s*/g) ?? [clean]
  const chunks: string[] = []
  let current = ''
  const push = () => {
    if (current.trim()) chunks.push(current.trim())
    current = ''
  }

  for (const sentence of sentences) {
    if (sentence.length > maxChars) {
      push()
      // Break very long sentences at commas or spaces.
      let rest = sentence.trim()
      while (rest.length > maxChars) {
        const window = rest.slice(0, maxChars)
        const cut = Math.max(window.lastIndexOf(', '), window.lastIndexOf('; '))
        const at = cut > maxChars * 0.4 ? cut + 1 : window.lastIndexOf(' ')
        const index = at > 0 ? at : maxChars
        chunks.push(rest.slice(0, index).trim())
        rest = rest.slice(index).trim()
      }
      current = rest ? `${rest} ` : ''
      continue
    }
    if (current.length + sentence.length > maxChars) push()
    current += sentence
  }
  push()
  return chunks
}
