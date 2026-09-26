import { v4 as uuidv4 } from 'uuid'
import { getStorageEngine } from '../core/storageEngine'
import { searchEngine } from '../core/searchEngine'
import { noteManager } from '../core/noteManager'
import type { Tag } from '../types/note.types'

const TAG_COLORS = [
  '#6366f1',
  '#8b5cf6',
  '#ec4899',
  '#f43f5e',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#14b8a6',
  '#0ea5e9',
  '#64748b'
]

export const tagService = {
  async createTag(name: string, color?: string): Promise<Tag> {
    const storage = await getStorageEngine()
    const existing = (await storage.getAllTags()).find(
      (t) => t.name.toLowerCase() === name.trim().toLowerCase()
    )
    if (existing) return existing

    const tag: Tag = {
      id: uuidv4(),
      name: name.trim(),
      color: color ?? TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)]
    }

    await storage.saveTag(tag)
    return tag
  },

  async updateTag(id: string, updates: Partial<Pick<Tag, 'name' | 'color'>>): Promise<Tag> {
    const storage = await getStorageEngine()
    const existing = await storage.getTag(id)
    if (!existing) throw new Error(`Tag not found: ${id}`)

    const updated: Tag = { ...existing, ...updates }
    await storage.saveTag(updated)
    return updated
  },

  async deleteTag(id: string): Promise<void> {
    const storage = await getStorageEngine()
    const notes = await storage.getAllNotes()

    for (const note of notes) {
      if (note.tags.includes(id)) {
        await noteManager.updateNote(note.id, {
          tags: note.tags.filter((t) => t !== id)
        })
      }
    }

    await storage.deleteTag(id)
  },

  async getAllTags(): Promise<Tag[]> {
    const storage = await getStorageEngine()
    return storage.getAllTags()
  },

  async addTagToNote(noteId: string, tagId: string): Promise<void> {
    const note = await noteManager.getNote(noteId)
    if (!note || note.tags.includes(tagId)) return
    await noteManager.updateNote(noteId, { tags: [...note.tags, tagId] })
  },

  async removeTagFromNote(noteId: string, tagId: string): Promise<void> {
    const note = await noteManager.getNote(noteId)
    if (!note) return
    await noteManager.updateNote(noteId, { tags: note.tags.filter((t) => t !== tagId) })
  },

  async getNotesByTag(tagId: string) {
    const storage = await getStorageEngine()
    const notes = await storage.getAllNotes()
    return notes.filter((n) => n.tags.includes(tagId))
  },

  suggestTags(query: string, limit = 5): Promise<Tag[]> {
    return tagService.getAllTags().then((tags) => searchEngine.suggestTags(query, tags, limit))
  }
}
