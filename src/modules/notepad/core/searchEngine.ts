import type { Note, NoteSearchFilters, NoteSearchResult } from '../types/note.types'
import type { Tag } from '../types/note.types'

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function highlightText(text: string, query: string): string {
  if (!query.trim()) return text
  const regex = new RegExp(`(${escapeRegex(query)})`, 'gi')
  return text.replace(regex, '<mark class="bg-yellow-200/60 dark:bg-yellow-500/30 rounded px-0.5">$1</mark>')
}

function scoreMatch(text: string, query: string): number {
  const lower = text.toLowerCase()
  const q = query.toLowerCase()
  if (lower === q) return 100
  if (lower.startsWith(q)) return 80
  if (lower.includes(q)) return 50
  return 0
}

export class SearchEngine {
  private index: Map<string, Note> = new Map()
  private tagsById: Map<string, Tag> = new Map()

  rebuildIndex(notes: Note[], tags: Tag[]): void {
    this.index.clear()
    this.tagsById.clear()
    for (const tag of tags) this.tagsById.set(tag.id, tag)
    for (const note of notes) this.index.set(note.id, note)
  }

  addNote(note: Note): void {
    this.index.set(note.id, note)
  }

  removeNote(noteId: string): void {
    this.index.delete(noteId)
  }

  search(filters: NoteSearchFilters): NoteSearchResult[] {
    const query = filters.query?.trim() ?? ''
    const searchIn = filters.searchIn ?? ['title', 'content', 'tags']
    const results: NoteSearchResult[] = []

    for (const note of this.index.values()) {
      if (filters.folderId !== undefined && note.folderId !== filters.folderId) continue

      if (filters.tagIds?.length) {
        const hasTag = filters.tagIds.some((id) => note.tags.includes(id))
        if (!hasTag) continue
      }

      if (!query) {
        results.push({
          note,
          score: note.isPinned ? 10 : 0,
          matchedFields: [],
          highlights: {}
        })
        continue
      }

      const matchedFields: Array<'title' | 'content' | 'tags'> = []
      let score = 0

      if (searchIn.includes('title')) {
        const s = scoreMatch(note.title, query)
        if (s > 0) {
          matchedFields.push('title')
          score += s * 2
        }
      }

      if (searchIn.includes('content')) {
        const s = scoreMatch(note.content, query)
        if (s > 0) {
          matchedFields.push('content')
          score += s
        }
      }

      if (searchIn.includes('tags')) {
        const tagNames = note.tags
          .map((id) => this.tagsById.get(id)?.name ?? '')
          .join(' ')
        const s = scoreMatch(tagNames, query)
        if (s > 0) {
          matchedFields.push('tags')
          score += s * 1.5
        }
      }

      if (score > 0 || matchedFields.length > 0) {
        results.push({
          note,
          score: score + (note.isPinned ? 10 : 0),
          matchedFields,
          highlights: {
            title: searchIn.includes('title') ? highlightText(note.title, query) : undefined,
            content: searchIn.includes('content')
              ? highlightText(note.content.slice(0, 200), query)
              : undefined
          }
        })
      }
    }

    return results.sort((a, b) => b.score - a.score)
  }

  suggestTags(query: string, allTags: Tag[], limit = 5): Tag[] {
    const q = query.toLowerCase().trim()
    if (!q) return allTags.slice(0, limit)

    return allTags
      .filter((t) => t.name.toLowerCase().includes(q))
      .slice(0, limit)
  }
}

export const searchEngine = new SearchEngine()
