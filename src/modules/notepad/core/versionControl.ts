import { v4 as uuidv4 } from 'uuid'
import { getStorageEngine } from './storageEngine'
import type { Note, NoteVersion } from '../types/note.types'

const MAX_VERSIONS = 10

export class VersionControl {
  async createSnapshot(note: Note): Promise<void> {
    const storage = await getStorageEngine()

    const snapshot: NoteVersion = {
      id: uuidv4(),
      noteId: note.id,
      title: note.title,
      content: note.content,
      format: note.format,
      version: note.version,
      savedAt: note.updatedAt
    }

    await storage.saveVersion(snapshot)
    await this.trimVersions(note.id)
  }

  async getVersions(noteId: string): Promise<NoteVersion[]> {
    const storage = await getStorageEngine()
    return storage.getVersions(noteId)
  }

  async restoreVersion(noteId: string, versionId: string): Promise<Note | null> {
    const storage = await getStorageEngine()
    const note = await storage.getNote(noteId)
    if (!note) return null

    const versions = await storage.getVersions(noteId)
    const target = versions.find((v) => v.id === versionId)
    if (!target) return null

    await this.createSnapshot(note)

    const restored: Note = {
      ...note,
      title: target.title,
      content: target.content,
      format: target.format,
      updatedAt: Date.now(),
      version: note.version + 1
    }

    await storage.saveNote(restored)
    return restored
  }

  async clearVersions(noteId: string): Promise<void> {
    const storage = await getStorageEngine()
    await storage.deleteVersionsForNote(noteId)
  }

  private async trimVersions(noteId: string): Promise<void> {
    const storage = await getStorageEngine()
    const versions = await storage.getVersions(noteId)

    if (versions.length <= MAX_VERSIONS) return

    const toRemove = versions.slice(MAX_VERSIONS)
    for (const version of toRemove) {
      await storage.deleteVersion(version.id)
    }
  }
}

export const versionControl = new VersionControl()
