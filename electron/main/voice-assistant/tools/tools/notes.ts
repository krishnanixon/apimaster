import type { AssistantTool } from '../types'
import { createNotepadNote, queryNotepadNotes } from '../../notepadBridge'

function formatList(
  notes: Array<{ id: string; title: string; preview: string; content?: string }>
): string {
  if (notes.length === 0) return 'No notes in the Notes section.'
  return notes
    .map((note, index) => {
      const body = note.content?.trim() || note.preview
      return `${index + 1}. ${note.title} (id: ${note.id})${body ? ` — ${body.slice(0, 220)}` : ''}`
    })
    .join('\n')
}

export const listNotesTool: AssistantTool = {
  name: 'list_notes',
  description: 'List notes from the app Notes section. Use when the user asks what notes they have.',
  riskLevel: 'read',
  inputSchema: {
    type: 'object',
    properties: {},
    additionalProperties: false
  },
  async execute() {
    try {
      const notes = await queryNotepadNotes({ action: 'list' })
      return { ok: true, output: formatList(notes.slice(0, 30)) }
    } catch (error) {
      return { ok: false, output: error instanceof Error ? error.message : 'Could not list notes.' }
    }
  }
}

export const searchNotesTool: AssistantTool = {
  name: 'search_notes',
  description: 'Search the Notes section by title or content.',
  riskLevel: 'read',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search text' }
    },
    required: ['query'],
    additionalProperties: false
  },
  async execute(input) {
    const query = String((input as { query: string }).query ?? '').trim()
    if (!query) return { ok: false, output: 'Query is required.' }
    try {
      const notes = await queryNotepadNotes({ action: 'search', query })
      if (notes.length === 0) return { ok: true, output: `No notes matched “${query}”.` }
      return { ok: true, output: formatList(notes.slice(0, 20)) }
    } catch (error) {
      return { ok: false, output: error instanceof Error ? error.message : 'Could not search notes.' }
    }
  }
}

export const readNoteTool: AssistantTool = {
  name: 'read_note',
  description: 'Read one note from the Notes section by id or title.',
  riskLevel: 'read',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Note id from list_notes' },
      title: { type: 'string', description: 'Note title if id is unknown' }
    },
    additionalProperties: false
  },
  async execute(input) {
    const { id, title } = input as { id?: string; title?: string }
    try {
      if (id?.trim()) {
        const notes = await queryNotepadNotes({ action: 'get', id: id.trim() })
        const note = notes[0]
        if (!note) return { ok: false, output: 'Note not found.' }
        return {
          ok: true,
          output: `${note.title}\n\n${note.content || note.preview || '(empty)'}`
        }
      }
      const query = title?.trim()
      if (!query) return { ok: false, output: 'Provide a note id or title.' }
      const matches = await queryNotepadNotes({ action: 'search', query })
      const exact = matches.find((n) => n.title.toLowerCase() === query.toLowerCase()) ?? matches[0]
      if (!exact) return { ok: true, output: `No note titled “${query}”.` }
      const full = await queryNotepadNotes({ action: 'get', id: exact.id })
      const note = full[0] ?? exact
      return {
        ok: true,
        output: `${note.title}\n\n${note.content || note.preview || '(empty)'}`
      }
    } catch (error) {
      return { ok: false, output: error instanceof Error ? error.message : 'Could not read the note.' }
    }
  }
}

export { createNotepadNote }
