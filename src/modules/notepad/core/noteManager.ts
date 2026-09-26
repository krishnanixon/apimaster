import { v4 as uuidv4 } from 'uuid'
import { getStorageEngine } from './storageEngine'
import { versionControl } from './versionControl'
import type { CreateNoteInput, Note, UpdateNoteInput } from '../types/note.types'

export class NoteManager {
  async createNote(input: CreateNoteInput = {}): Promise<Note> {
    const storage = await getStorageEngine()
    const now = Date.now()

    const note: Note = {
      id: uuidv4(),
      title: input.title ?? 'Untitled Note',
      content: input.content ?? '',
      format: input.format ?? 'plain',
      folderId: input.folderId ?? null,
      tags: input.tags ?? [],
      createdAt: now,
      updatedAt: now,
      isPinned: false,
      version: 1
    }

    await storage.saveNote(note)
    return note
  }

  async updateNote(id: string, input: UpdateNoteInput): Promise<Note> {
    const storage = await getStorageEngine()
    const existing = await storage.getNote(id)
    if (!existing) throw new Error(`Note not found: ${id}`)

    await versionControl.createSnapshot(existing)

    const updated: Note = {
      ...existing,
      ...input,
      updatedAt: Date.now(),
      version: existing.version + 1
    }

    await storage.saveNote(updated)
    return updated
  }

  async deleteNote(id: string): Promise<void> {
    const storage = await getStorageEngine()
    await storage.deleteNote(id)
    await versionControl.clearVersions(id)
  }

  async getNote(id: string): Promise<Note | null> {
    const storage = await getStorageEngine()
    return storage.getNote(id)
  }

  async getNotesByFolder(folderId: string | null): Promise<Note[]> {
    const storage = await getStorageEngine()
    const notes = await storage.getNotesByFolder(folderId)
    return this.sortNotes(notes)
  }

  async getAllNotes(): Promise<Note[]> {
    const storage = await getStorageEngine()
    const notes = await storage.getAllNotes()
    return this.sortNotes(notes)
  }

  async pinNote(id: string): Promise<Note> {
    return this.updateNote(id, { isPinned: true })
  }

  async unpinNote(id: string): Promise<Note> {
    return this.updateNote(id, { isPinned: false })
  }

  async moveNoteToFolder(noteId: string, folderId: string | null): Promise<Note> {
    return this.updateNote(noteId, { folderId })
  }

  private sortNotes(notes: Note[]): Note[] {
    return [...notes].sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1
      return b.updatedAt - a.updatedAt
    })
  }
}

export const noteManager = new NoteManager()
