import { stripAssistantAddress } from '@shared/constants/product'

export type NoteIntent =
  | { kind: 'save_note'; title?: string; useClipboard: boolean; spokenBody?: string }
  | null

/** Detect "save note" / "keep this note" style commands. */
export function detectNoteIntent(utterance: string): NoteIntent {
  const text = utterance.trim()
  if (!text) return null

  const wantsNote =
    /\b(save|keep|create|write|add)\b[\s\w]{0,20}\b(note|notes)\b/i.test(text) ||
    /\b(note|notes)\b[\s\w]{0,12}\b(save|keep|create)\b/i.test(text) ||
    /\bwrite\s+(this|it)\s+down\b/i.test(text)

  if (!wantsNote) return null

  const useClipboard =
    /\b(clipboard|last copy|copied text|my copy|this copy)\b/i.test(text) ||
    /\b(last|my)\s+(copied|copy)\b/i.test(text)

  const titled = text.match(/\b(?:titled|called|named)\s+["']?([^"'.!?]+)["']?/i)
  const title = titled?.[1]?.trim()

  const spokenBody = stripAssistantAddress(
    text
      .replace(/\b(please\s+)?(save|keep|create|write|add)\b[\s\w]{0,20}\b(note|notes)\b/gi, '')
      .replace(/\bwrite\s+(this|it)\s+down\b/gi, '')
      .replace(/\b(titled|called|named)\s+["']?[^"'.!?]+["']?/gi, '')
      .replace(/\b(from\s+)?(clipboard|last copy|copied text|my copy)\b/gi, '')
  )

  return { kind: 'save_note', title, useClipboard, spokenBody: spokenBody || undefined }
}

export type NoteLookupIntent = { action: 'list' } | { action: 'search'; query: string } | { action: 'read'; query: string }

/** Detect "read my notes" / "what notes do I have" / "read the note about X". */
export function detectNoteLookupIntent(utterance: string): NoteLookupIntent | null {
  const text = utterance.trim()
  if (!text || detectNoteIntent(text)) return null

  const about = text.match(/\b(?:about|called|named|titled)\s+(.+)/i)
  if (/\b(read|open|show)\b[\s\w]{0,16}\bnotes?\b/i.test(text) && about?.[1]) {
    return { action: 'read', query: stripAssistantAddress(about[1]) }
  }
  if (
    /\b(list|show|read|what(?:'s| is)?)\b[\s\w]{0,24}\bnotes?\b/i.test(text) ||
    /\bmy notes\b/i.test(text)
  ) {
    return { action: 'list' }
  }
  return null
}
