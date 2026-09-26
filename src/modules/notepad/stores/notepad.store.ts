import { create } from 'zustand'
import { toast } from 'sonner'
import { noteService } from '../services/note.service'
import { folderService } from '../services/folder.service'
import { tagService } from '../services/tag.service'
import { searchEngine } from '../core/searchEngine'
import { autosaveService } from '../core/autosave.service'
import { versionControl } from '../core/versionControl'
import type { Note, NoteFormat, NoteSearchResult, SaveStatus, Tag } from '../types/note.types'
import type { FolderTreeNode } from '../types/folder.types'
import type { NoteVersion } from '../types/note.types'

interface NotepadState {
  initialized: boolean
  isLoading: boolean
  notes: Note[]
  folders: FolderTreeNode[]
  tags: Tag[]
  selectedNoteId: string | null
  selectedFolderId: string | null
  selectedTagId: string | null
  searchQuery: string
  searchResults: NoteSearchResult[]
  versions: NoteVersion[]
  saveStatus: SaveStatus
  isFullscreen: boolean

  init: () => Promise<void>
  loadNotes: (folderId?: string | null) => Promise<void>
  loadFolders: () => Promise<void>
  loadTags: () => Promise<void>
  refreshFromStorage: () => Promise<void>
  selectNote: (id: string | null) => Promise<void>
  selectFolder: (id: string | null) => void
  selectTag: (id: string | null) => void
  createNote: (folderId?: string | null) => Promise<Note>
  updateNoteLocal: (id: string, updates: Partial<Pick<Note, 'title' | 'content' | 'format'>>) => void
  scheduleSave: (id: string) => void
  deleteNote: (id: string) => Promise<void>
  togglePin: (id: string) => Promise<void>
  moveNoteToFolder: (noteId: string, folderId: string | null) => Promise<void>
  createFolder: (name: string, parentId?: string | null) => Promise<void>
  deleteFolder: (id: string) => Promise<void>
  addTagToNote: (noteId: string, tagName: string) => Promise<void>
  removeTagFromNote: (noteId: string, tagId: string) => Promise<void>
  setSearchQuery: (query: string) => void
  runSearch: () => void
  loadVersions: (noteId: string) => Promise<void>
  restoreVersion: (noteId: string, versionId: string) => Promise<void>
  setFullscreen: (value: boolean) => void
}

export const useNotepadStore = create<NotepadState>((set, get) => ({
  initialized: false,
  isLoading: false,
  notes: [],
  folders: [],
  tags: [],
  selectedNoteId: null,
  selectedFolderId: null,
  selectedTagId: null,
  searchQuery: '',
  searchResults: [],
  versions: [],
  saveStatus: 'idle',
  isFullscreen: false,

  init: async () => {
    if (get().initialized) return
    set({ isLoading: true })
    try {
      await noteService.init()
      await get().loadFolders()
      await get().loadTags()
      await get().loadNotes(null)
      set({ initialized: true })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to initialize notepad')
    } finally {
      set({ isLoading: false })
    }
  },

  loadNotes: async (folderId) => {
    const targetFolder = folderId !== undefined ? folderId : get().selectedFolderId

    let notes: Note[]
    if (get().searchQuery.trim() || get().selectedTagId) {
      notes = get().searchResults.map((r) => r.note)
    } else if (targetFolder === null) {
      notes = await noteService.getAllNotes()
    } else {
      notes = await noteService.getNotesByFolder(targetFolder)
    }

    const allNotes = await noteService.getAllNotes()
    const tags = get().tags.length ? get().tags : await tagService.getAllTags()
    searchEngine.rebuildIndex(allNotes, tags)

    set({ notes })
  },

  loadFolders: async () => {
    const folders = await folderService.getFolderTree()
    set({ folders })
  },

  loadTags: async () => {
    const tags = await tagService.getAllTags()
    set({ tags })
  },

  refreshFromStorage: async () => {
    if (!get().initialized) return

    const allNotes = await noteService.getAllNotes()
    const tags = await tagService.getAllTags()
    searchEngine.rebuildIndex(allNotes, tags)
    set({ tags })

    await get().loadFolders()

    const { searchQuery, selectedTagId } = get()
    if (searchQuery.trim() || selectedTagId) {
      get().runSearch()
      return
    }

    await get().loadNotes()
  },

  selectNote: async (id) => {
    await autosaveService.flushAll()
    set({ selectedNoteId: id, saveStatus: 'idle' })
    if (id) await get().loadVersions(id)
    else set({ versions: [] })
  },

  selectFolder: (id) => {
    set({ selectedFolderId: id, selectedTagId: null, searchQuery: '', searchResults: [] })
    void get().loadNotes(id)
  },

  selectTag: (id) => {
    set({ selectedTagId: id, selectedFolderId: null })
    get().runSearch()
  },

  createNote: async (folderId) => {
    const note = await noteService.createNote({
      folderId: folderId ?? get().selectedFolderId
    })
    await get().loadNotes()
    await get().loadFolders()
    set({ selectedNoteId: note.id })
    return note
  },

  updateNoteLocal: (id, updates) => {
    set((state) => ({
      notes: state.notes.map((n) => (n.id === id ? { ...n, ...updates } : n))
    }))
    get().scheduleSave(id)
  },

  scheduleSave: (id) => {
    autosaveService.schedule(id, async () => {
      const note = get().notes.find((n) => n.id === id)
      if (!note) return

      const updated = await noteService.updateNote(id, {
        title: note.title,
        content: note.content,
        format: note.format
      })

      set((state) => ({
        notes: state.notes.map((n) => (n.id === id ? updated : n)),
        saveStatus: 'saved'
      }))

      searchEngine.addNote(updated)
      if (get().selectedNoteId === id) {
        await get().loadVersions(id)
      }
    })
  },

  deleteNote: async (id) => {
    await noteService.deleteNote(id)
    searchEngine.removeNote(id)
    set((state) => ({
      notes: state.notes.filter((n) => n.id !== id),
      selectedNoteId: state.selectedNoteId === id ? null : state.selectedNoteId
    }))
    await get().loadFolders()
    toast.success('Note deleted')
  },

  togglePin: async (id) => {
    const note = get().notes.find((n) => n.id === id)
    if (!note) return
    const updated = note.isPinned ? await noteService.unpinNote(id) : await noteService.pinNote(id)
    set((state) => ({
      notes: state.notes.map((n) => (n.id === id ? updated : n))
    }))
    await get().loadNotes()
  },

  moveNoteToFolder: async (noteId, folderId) => {
    const updated = await noteService.moveNoteToFolder(noteId, folderId)
    set((state) => ({
      notes: state.notes.map((n) => (n.id === noteId ? updated : n))
    }))
    await get().loadFolders()
    await get().loadNotes()
    toast.success('Note moved')
  },

  createFolder: async (name, parentId) => {
    await folderService.createFolder({ name, parentId: parentId ?? get().selectedFolderId })
    await get().loadFolders()
    toast.success('Folder created')
  },

  deleteFolder: async (id) => {
    await folderService.deleteFolder(id)
    if (get().selectedFolderId === id) set({ selectedFolderId: null })
    await get().loadFolders()
    await get().loadNotes(null)
    toast.success('Folder deleted')
  },

  addTagToNote: async (noteId, tagName) => {
    const tag = await tagService.createTag(tagName)
    await tagService.addTagToNote(noteId, tag.id)
    await get().loadTags()
    await get().loadNotes()
    if (get().selectedNoteId === noteId) {
      const note = await noteService.getNote(noteId)
      if (note) {
        set((state) => ({
          notes: state.notes.map((n) => (n.id === noteId ? note : n))
        }))
      }
    }
  },

  removeTagFromNote: async (noteId, tagId) => {
    await tagService.removeTagFromNote(noteId, tagId)
    await get().loadNotes()
    const note = await noteService.getNote(noteId)
    if (note) {
      set((state) => ({
        notes: state.notes.map((n) => (n.id === noteId ? note : n))
      }))
    }
  },

  setSearchQuery: (query) => {
    set({ searchQuery: query })
  },

  runSearch: () => {
    const { searchQuery, selectedFolderId, selectedTagId, tags } = get()
    const results = searchEngine.search({
      query: searchQuery,
      folderId: selectedTagId || selectedFolderId === null ? undefined : selectedFolderId,
      tagIds: selectedTagId ? [selectedTagId] : undefined
    })
    set({ searchResults: results, notes: results.map((r) => r.note) })

    if (!searchQuery.trim() && !selectedTagId) {
      void get().loadNotes()
    }

    if (tags.length === 0) void get().loadTags()
  },

  loadVersions: async (noteId) => {
    const versions = await versionControl.getVersions(noteId)
    set({ versions })
  },

  restoreVersion: async (noteId, versionId) => {
    const restored = await versionControl.restoreVersion(noteId, versionId)
    if (restored) {
      set((state) => ({
        notes: state.notes.map((n) => (n.id === noteId ? restored : n))
      }))
      await get().loadVersions(noteId)
      toast.success('Version restored')
    }
  },

  setFullscreen: (value) => set({ isFullscreen: value })
}))
