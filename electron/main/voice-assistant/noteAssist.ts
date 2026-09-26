import { detectNoteIntent, detectNoteLookupIntent, type NoteIntent, type NoteLookupIntent } from '@shared/lib/voice-note-intent'
import { ASSISTANT_NAME } from '@shared/constants/product'
import { readClipboardText } from './clipboardAssist'
import { createNotepadNote, queryNotepadNotes } from './notepadBridge'

export { detectNoteIntent, detectNoteLookupIntent }
export type { NoteIntent, NoteLookupIntent }

export async function runSaveNoteTurn(intent: Exclude<NoteIntent, null>): Promise<{ spoken: string }> {
  const clip = readClipboardText()
  const body =
    intent.useClipboard || !intent.spokenBody
      ? clip || intent.spokenBody || ''
      : intent.spokenBody

  if (!body) {
    return {
      spoken: 'I do not have text to save. Copy something first, or tell me what to write in the note.'
    }
  }

  const title =
    intent.title?.trim() ||
    body.split(/\n/)[0]?.trim().slice(0, 48) ||
    `${ASSISTANT_NAME} note`

  const saved = await createNotepadNote(title, body)
  return { spoken: `Saved “${saved.title}” in your Notepad.` }
}

export async function runLookupNotesTurn(intent: NoteLookupIntent): Promise<{ spoken: string }> {
  if (intent.action === 'list') {
    const notes = await queryNotepadNotes({ action: 'list' })
    if (notes.length === 0) return { spoken: 'You do not have any notes yet.' }
    const names = notes.slice(0, 8).map((n) => n.title).join(', ')
    const extra = notes.length > 8 ? `, and ${notes.length - 8} more` : ''
    return { spoken: `You have ${notes.length} notes. ${names}${extra}.` }
  }

  const matches =
    intent.action === 'read'
      ? await queryNotepadNotes({ action: 'search', query: intent.query })
      : await queryNotepadNotes({ action: 'search', query: intent.query })
  const note = matches[0]
  if (!note) return { spoken: `I could not find a note about ${intent.query}.` }
  const full = await queryNotepadNotes({ action: 'get', id: note.id })
  const body = (full[0]?.content || note.preview || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  return { spoken: `${note.title}. ${body.slice(0, 400)}` }
}
