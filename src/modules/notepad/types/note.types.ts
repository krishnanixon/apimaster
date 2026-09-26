export type NoteFormat = 'plain' | 'markdown' | 'richtext'

export interface Note {
  id: string
  title: string
  content: string
  format: NoteFormat
  folderId: string | null
  tags: string[]
  createdAt: number
  updatedAt: number
  isPinned: boolean
  version: number
}

export interface NoteVersion {
  id: string
  noteId: string
  title: string
  content: string
  format: NoteFormat
  version: number
  savedAt: number
}

export interface Tag {
  id: string
  name: string
  color: string
}

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

export interface NoteSearchResult {
  note: Note
  score: number
  matchedFields: Array<'title' | 'content' | 'tags'>
  highlights: {
    title?: string
    content?: string
  }
}

export interface NoteSearchFilters {
  query?: string
  folderId?: string | null
  tagIds?: string[]
  searchIn?: Array<'title' | 'content' | 'tags'>
}

export interface CreateNoteInput {
  title?: string
  content?: string
  format?: NoteFormat
  folderId?: string | null
  tags?: string[]
}

export interface UpdateNoteInput {
  title?: string
  content?: string
  format?: NoteFormat
  folderId?: string | null
  tags?: string[]
  isPinned?: boolean
}
