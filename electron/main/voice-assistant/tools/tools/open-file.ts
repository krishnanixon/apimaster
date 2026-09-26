import { existsSync } from 'fs'
import { shell } from 'electron'
import { join } from 'path'
import { app } from 'electron'
import { assertSafePath } from '@shared/lib/voice-path-safety'
import type { AssistantTool } from '../types'
import { voiceNotesRoot } from './create-note'

function allowedRoots(): string[] {
  return [voiceNotesRoot(), join(app.getPath('userData'), 'voice-assistant')]
}

export const openFileTool: AssistantTool = {
  name: 'open_file',
  description: 'Open a note from the Voice Assistant notes folder in the default application.',
  riskLevel: 'read',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Relative path inside the notes folder' }
    },
    required: ['path'],
    additionalProperties: false
  },
  async execute(input) {
    const requested = String((input as { path: string }).path)
    try {
      const resolved = assertSafePath(requested, allowedRoots())
      if (!existsSync(resolved)) return { ok: false, output: 'File not found.' }
      const error = await shell.openPath(resolved)
      if (error) return { ok: false, output: error }
      return { ok: true, output: `Opened ${resolved}` }
    } catch (error) {
      return { ok: false, output: error instanceof Error ? error.message : 'Could not open file.' }
    }
  }
}
