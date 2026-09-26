import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { ASSISTANT_NAME } from '@shared/constants/product'
import { sanitizeFileName } from '@shared/lib/voice-path-safety'
import type { AssistantTool } from '../types'
import { createNotepadNote } from '../../notepadBridge'

export function voiceNotesRoot(): string {
  const dir = join(app.getPath('userData'), 'voice-assistant', 'notes')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

export const createNoteTool: AssistantTool = {
  name: 'create_note',
  description:
    'Save a note into the app Notepad section. Use when the user says save note, keep this note, or write this down.',
  riskLevel: 'write',
  inputSchema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Note title' },
      content: { type: 'string', description: 'Note body' }
    },
    required: ['title'],
    additionalProperties: false
  },
  async execute(input) {
    const { title, content } = input as { title: string; content?: string }
    const safeTitle = title.trim() || `${ASSISTANT_NAME} note`
    const body = (content ?? '').trim()

    try {
      const saved = await createNotepadNote(safeTitle, body)
      return {
        ok: true,
        output: `Saved note “${saved.title}” in Notepad.`
      }
    } catch (error) {
      // Fallback: keep a markdown copy under voice notes if Notepad bridge is unavailable.
      const fileName = `${sanitizeFileName(safeTitle)}.md`
      const path = join(voiceNotesRoot(), fileName)
      writeFileSync(path, `# ${safeTitle}\n\n${body}\n`, 'utf-8')
      const reason = error instanceof Error ? error.message : 'Notepad unavailable'
      return {
        ok: true,
        output: `Saved a backup note file (${reason}). Path: ${path}`
      }
    }
  }
}
