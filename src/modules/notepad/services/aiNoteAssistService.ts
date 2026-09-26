import type { Note } from '../types/note.types'

export interface AiAssistResult {
  success: boolean
  data?: string
  error?: string
}

export interface AiNoteAssistService {
  summarizeNote(note: Note): Promise<AiAssistResult>
  improveWriting(note: Note): Promise<AiAssistResult>
  extractTasks(note: Note): Promise<AiAssistResult>
  generateTitle(note: Note): Promise<AiAssistResult>
}

class AiNoteAssistServiceStub implements AiNoteAssistService {
  async summarizeNote(_note: Note): Promise<AiAssistResult> {
    return { success: false, error: 'AI assist not yet implemented' }
  }

  async improveWriting(_note: Note): Promise<AiAssistResult> {
    return { success: false, error: 'AI assist not yet implemented' }
  }

  async extractTasks(_note: Note): Promise<AiAssistResult> {
    return { success: false, error: 'AI assist not yet implemented' }
  }

  async generateTitle(_note: Note): Promise<AiAssistResult> {
    return { success: false, error: 'AI assist not yet implemented' }
  }
}

export const aiNoteAssistService: AiNoteAssistService = new AiNoteAssistServiceStub()
