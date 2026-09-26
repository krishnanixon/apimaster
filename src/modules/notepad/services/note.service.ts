import { noteManager } from '../core/noteManager'
import { getStorageEngine } from '../core/storageEngine'
import type { CreateNoteInput, Note, UpdateNoteInput } from '../types/note.types'

export const noteService = {
  async init(): Promise<void> {
    await getStorageEngine()
  },

  createNote(input?: CreateNoteInput): Promise<Note> {
    return noteManager.createNote(input)
  },

  updateNote(id: string, input: UpdateNoteInput): Promise<Note> {
    return noteManager.updateNote(id, input)
  },

  deleteNote(id: string): Promise<void> {
    return noteManager.deleteNote(id)
  },

  getNote(id: string): Promise<Note | null> {
    return noteManager.getNote(id)
  },

  getNotesByFolder(folderId: string | null): Promise<Note[]> {
    return noteManager.getNotesByFolder(folderId)
  },

  getAllNotes(): Promise<Note[]> {
    return noteManager.getAllNotes()
  },

  pinNote(id: string): Promise<Note> {
    return noteManager.pinNote(id)
  },

  unpinNote(id: string): Promise<Note> {
    return noteManager.unpinNote(id)
  },

  moveNoteToFolder(noteId: string, folderId: string | null): Promise<Note> {
    return noteManager.moveNoteToFolder(noteId, folderId)
  }
}
