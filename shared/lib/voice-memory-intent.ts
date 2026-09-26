import { stripAssistantAddress } from '@shared/constants/product'

export type RememberIntent = { fact: string } | null

/** Detect "remember that …" / "keep in mind …" / "don't forget …". */
export function detectRememberIntent(utterance: string): RememberIntent {
  const text = utterance.trim()
  if (!text) return null

  const match = text.match(
    /\b(?:please\s+)?(?:remember|keep in mind|keep that in mind|don't forget|do not forget)\s+(?:that\s+)?(.+)/i
  )
  const fact = match?.[1]
    ? stripAssistantAddress(match[1].replace(/^[,.\-–—:]+/, ''))
    : ''
  if (!fact || fact.length < 3) return null
  if (/\b(what|do you)\b/i.test(text) && /\bremember\b/i.test(text)) return null
  return { fact }
}
