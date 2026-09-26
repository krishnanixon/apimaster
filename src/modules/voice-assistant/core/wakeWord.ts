import { ASSISTANT_NAME } from '@shared/constants/product'

export { ASSISTANT_NAME }

const NAME = ASSISTANT_NAME.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const CANONICAL = ASSISTANT_NAME.toLowerCase()

/** Distinctive spellings — accepted anywhere in an utterance ("what time is it, Tess"). */
const STRONG_ALIASES = new Set([CANONICAL, 'tessa'])
/** STT misspellings that are also real words — only accepted as the first word. */
const WEAK_ALIASES = new Set(['tese', 'tesst', 'test', 'tes'])
const GREETINGS = new Set(['hey', 'hi', 'ok', 'okay', 'yo'])
/** Real words one edit away from the name that should never wake the assistant. */
const COMMON_WORDS = new Set(['tests', 'text', 'toss', 'less', 'mess', 'yes', 'dress'])

export type WakeWordMatch = {
  heard: boolean
  /** Transcript with the wake phrase removed; empty if only the wake word was said. */
  command: string
}

function normalizeWakeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function editDistance(a: string, b: string): number {
  if (a === b) return 0
  const m = a.length
  const n = b.length
  if (Math.abs(m - n) > 2) return 99
  const prev = Array.from({ length: n + 1 }, (_, i) => i)
  const cur = new Array<number>(n + 1)
  for (let i = 1; i <= m; i++) {
    cur[0] = i
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
    }
    for (let j = 0; j <= n; j++) prev[j] = cur[j]
  }
  return prev[n]
}

function isLeadingWake(word: string, strict: boolean): boolean {
  if (STRONG_ALIASES.has(word)) return true
  if (strict) return false
  if (WEAK_ALIASES.has(word)) return true
  return (
    word.length >= 3 &&
    word.length <= 6 &&
    word[0] === CANONICAL[0] &&
    !COMMON_WORDS.has(word) &&
    editDistance(word, CANONICAL) <= 1
  )
}

function joinWords(words: string[]): string {
  return words
    .join(' ')
    .replace(/^[\s,.\-–—:;!?]+/, '')
    .replace(/[\s,\-–—:;]+$/, '')
    .trim()
}

/**
 * Detects "Tess" / "Hey Tess" / common STT misspellings and strips it from the command.
 * The command keeps the user's original wording and punctuation.
 * With `leadingOnly`, only an exact name at the start counts (used once the assistant is
 * already awake, so commands like "test the login flow" are left alone).
 */
export function matchWakeWord(
  transcript: string,
  options: { leadingOnly?: boolean } = {}
): WakeWordMatch {
  const raw = transcript.trim()
  if (!raw) return { heard: false, command: '' }

  const words = raw.split(/\s+/)
  const keys = words.map((word) => normalizeWakeText(word).replace(/\s+/g, ''))
  if (!keys.some(Boolean)) return { heard: false, command: '' }

  let first = 0
  while (first < keys.length && (!keys[first] || GREETINGS.has(keys[first])) && first < 3) first++
  if (first < keys.length && isLeadingWake(keys[first], Boolean(options.leadingOnly))) {
    return { heard: true, command: joinWords(words.slice(first + 1)) }
  }
  if (options.leadingOnly) return { heard: false, command: raw }

  const at = keys.findIndex((key) => STRONG_ALIASES.has(key))
  if (at >= 0) {
    let beforeEnd = at
    while (beforeEnd > 0 && GREETINGS.has(keys[beforeEnd - 1])) beforeEnd--
    const after = joinWords(words.slice(at + 1))
    return { heard: true, command: after || joinWords(words.slice(0, beforeEnd)) }
  }

  return { heard: false, command: raw }
}

export function isReadyPrompt(text: string): boolean {
  return new RegExp(`${NAME} is ready`, 'i').test(text.trim())
}

export const WAKE_ACK = "Yes? I'm listening."
export const READY_LINE = `${ASSISTANT_NAME} is ready. Say ${ASSISTANT_NAME} when you need me.`
