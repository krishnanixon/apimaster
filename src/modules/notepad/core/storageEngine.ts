import type { Note, NoteVersion, Tag } from '../types/note.types'
import type { Folder } from '../types/folder.types'

const DB_NAME = 'ai-studio-notepad'
const DB_VERSION = 1

const STORES = {
  notes: 'notes',
  folders: 'folders',
  tags: 'tags',
  versions: 'versions',
  meta: 'meta'
} as const

type StoreName = (typeof STORES)[keyof typeof STORES]

export type StorageBackend = 'indexeddb' | 'filesystem'

export interface StorageEngine {
  init(): Promise<void>
  getBackend(): StorageBackend
  getAllNotes(): Promise<Note[]>
  getNotesByFolder(folderId: string | null): Promise<Note[]>
  getNote(id: string): Promise<Note | null>
  saveNote(note: Note): Promise<void>
  deleteNote(id: string): Promise<void>
  getAllFolders(): Promise<Folder[]>
  getFolder(id: string): Promise<Folder | null>
  saveFolder(folder: Folder): Promise<void>
  deleteFolder(id: string): Promise<void>
  getAllTags(): Promise<Tag[]>
  getTag(id: string): Promise<Tag | null>
  saveTag(tag: Tag): Promise<void>
  deleteTag(id: string): Promise<void>
  getVersions(noteId: string): Promise<NoteVersion[]>
  saveVersion(version: NoteVersion): Promise<void>
  deleteVersion(id: string): Promise<void>
  deleteVersionsForNote(noteId: string): Promise<void>
  batchSave(notes: Note[], folders: Folder[], tags: Tag[]): Promise<void>
}

class IndexedDBStorageEngine implements StorageEngine {
  private db: IDBDatabase | null = null

  async init(): Promise<void> {
    if (this.db) return
    this.db = await this.openDatabase()
  }

  getBackend(): StorageBackend {
    return 'indexeddb'
  }

  private openDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)

      request.onerror = () => reject(request.error ?? new Error('Failed to open notepad database'))
      request.onsuccess = () => resolve(request.result)

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result

        if (!db.objectStoreNames.contains(STORES.notes)) {
          const notes = db.createObjectStore(STORES.notes, { keyPath: 'id' })
          notes.createIndex('folderId', 'folderId', { unique: false })
          notes.createIndex('updatedAt', 'updatedAt', { unique: false })
          notes.createIndex('isPinned', 'isPinned', { unique: false })
        }

        if (!db.objectStoreNames.contains(STORES.folders)) {
          const folders = db.createObjectStore(STORES.folders, { keyPath: 'id' })
          folders.createIndex('parentId', 'parentId', { unique: false })
        }

        if (!db.objectStoreNames.contains(STORES.tags)) {
          db.createObjectStore(STORES.tags, { keyPath: 'id' })
        }

        if (!db.objectStoreNames.contains(STORES.versions)) {
          const versions = db.createObjectStore(STORES.versions, { keyPath: 'id' })
          versions.createIndex('noteId', 'noteId', { unique: false })
          versions.createIndex('savedAt', 'savedAt', { unique: false })
        }

        if (!db.objectStoreNames.contains(STORES.meta)) {
          db.createObjectStore(STORES.meta, { keyPath: 'key' })
        }
      }
    })
  }

  private getStore(name: StoreName, mode: IDBTransactionMode = 'readonly'): IDBObjectStore {
    if (!this.db) throw new Error('Storage engine not initialized')
    return this.db.transaction(name, mode).objectStore(name)
  }

  private async getAll<T>(storeName: StoreName): Promise<T[]> {
    return new Promise((resolve, reject) => {
      const store = this.getStore(storeName)
      const request = store.getAll()
      request.onsuccess = () => resolve((request.result as T[]) ?? [])
      request.onerror = () => reject(request.error ?? new Error(`Failed to read ${storeName}`))
    })
  }

  private async getOne<T>(storeName: StoreName, id: string): Promise<T | null> {
    return new Promise((resolve, reject) => {
      const store = this.getStore(storeName)
      const request = store.get(id)
      request.onsuccess = () => resolve((request.result as T | undefined) ?? null)
      request.onerror = () => reject(request.error ?? new Error(`Failed to read ${storeName}/${id}`))
    })
  }

  private async put<T>(storeName: StoreName, value: T): Promise<void> {
    return new Promise((resolve, reject) => {
      const store = this.getStore(storeName, 'readwrite')
      const request = store.put(value)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error ?? new Error(`Failed to save to ${storeName}`))
    })
  }

  private async delete(storeName: StoreName, id: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const store = this.getStore(storeName, 'readwrite')
      const request = store.delete(id)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error ?? new Error(`Failed to delete from ${storeName}`))
    })
  }

  private async getByIndex<T>(storeName: StoreName, indexName: string, value: IDBValidKey): Promise<T[]> {
    return new Promise((resolve, reject) => {
      const store = this.getStore(storeName)
      const index = store.index(indexName)
      const request = index.getAll(value)
      request.onsuccess = () => resolve((request.result as T[]) ?? [])
      request.onerror = () => reject(request.error ?? new Error(`Failed to query ${storeName}/${indexName}`))
    })
  }

  async getAllNotes(): Promise<Note[]> {
    return this.getAll<Note>(STORES.notes)
  }

  async getNotesByFolder(folderId: string | null): Promise<Note[]> {
    const all = await this.getAll<Note>(STORES.notes)
    return all.filter((n) => n.folderId === folderId)
  }

  async getNote(id: string): Promise<Note | null> {
    return this.getOne<Note>(STORES.notes, id)
  }

  async saveNote(note: Note): Promise<void> {
    await this.put(STORES.notes, note)
  }

  async deleteNote(id: string): Promise<void> {
    await this.delete(STORES.notes, id)
  }

  async getAllFolders(): Promise<Folder[]> {
    return this.getAll<Folder>(STORES.folders)
  }

  async getFolder(id: string): Promise<Folder | null> {
    return this.getOne<Folder>(STORES.folders, id)
  }

  async saveFolder(folder: Folder): Promise<void> {
    await this.put(STORES.folders, folder)
  }

  async deleteFolder(id: string): Promise<void> {
    await this.delete(STORES.folders, id)
  }

  async getAllTags(): Promise<Tag[]> {
    return this.getAll<Tag>(STORES.tags)
  }

  async getTag(id: string): Promise<Tag | null> {
    return this.getOne<Tag>(STORES.tags, id)
  }

  async saveTag(tag: Tag): Promise<void> {
    await this.put(STORES.tags, tag)
  }

  async deleteTag(id: string): Promise<void> {
    await this.delete(STORES.tags, id)
  }

  async getVersions(noteId: string): Promise<NoteVersion[]> {
    const versions = await this.getByIndex<NoteVersion>(STORES.versions, 'noteId', noteId)
    return versions.sort((a, b) => b.savedAt - a.savedAt)
  }

  async saveVersion(version: NoteVersion): Promise<void> {
    await this.put(STORES.versions, version)
  }

  async deleteVersion(id: string): Promise<void> {
    await this.delete(STORES.versions, id)
  }

  async deleteVersionsForNote(noteId: string): Promise<void> {
    const versions = await this.getVersions(noteId)
    await Promise.all(versions.map((v) => this.delete(STORES.versions, v.id)))
  }

  async batchSave(notes: Note[], folders: Folder[], tags: Tag[]): Promise<void> {
    if (!this.db) throw new Error('Storage engine not initialized')

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(
        [STORES.notes, STORES.folders, STORES.tags],
        'readwrite'
      )
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error ?? new Error('Batch save failed'))

      const notesStore = tx.objectStore(STORES.notes)
      const foldersStore = tx.objectStore(STORES.folders)
      const tagsStore = tx.objectStore(STORES.tags)

      for (const note of notes) notesStore.put(note)
      for (const folder of folders) foldersStore.put(folder)
      for (const tag of tags) tagsStore.put(tag)
    })
  }
}

let engineInstance: StorageEngine | null = null

export async function getStorageEngine(): Promise<StorageEngine> {
  if (!engineInstance) {
    engineInstance = new IndexedDBStorageEngine()
    await engineInstance.init()
  }
  return engineInstance
}

export function resetStorageEngine(): void {
  engineInstance = null
}
