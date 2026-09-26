import { useEffect } from 'react'
import { toast } from 'sonner'
import { noteService } from '@/modules/notepad/services/note.service'
import { useNotepadStore } from '@/modules/notepad/stores/notepad.store'
import type { Note } from '@/modules/notepad/types/note.types'
import { ASSISTANT_NAME } from '@shared/constants/product'

function plainText(content: string): string {
  return content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function toView(note: Note, includeContent = false) {
  const text = plainText(note.content)
  return {
    id: note.id,
    title: note.title || 'Untitled',
    preview: text.slice(0, 180),
    content: includeContent ? note.content : undefined,
    updatedAt: note.updatedAt
  }
}

/** Bridges Tess note create/list/read requests into the Notepad store. */
export function NotepadVoiceBridge() {
  useEffect(() => {
    const api = window.electronAPI?.notepad
    if (!api?.onCreateRequest || !api.replyCreate) return

    return api.onCreateRequest((payload) => {
      void (async () => {
        try {
          await noteService.init()
          const note = await noteService.createNote({
            title: payload.title || `${ASSISTANT_NAME} note`,
            content: payload.content || '',
            format: 'markdown',
            tags: ['tess']
          })
          await useNotepadStore.getState().refreshFromStorage()
          api.replyCreate({
            requestId: payload.requestId,
            ok: true,
            id: note.id,
            title: note.title
          })
          toast.success(`Note saved: ${note.title}`)
        } catch (error) {
          api.replyCreate({
            requestId: payload.requestId,
            ok: false,
            error: error instanceof Error ? error.message : 'Failed to save note'
          })
        }
      })()
    })
  }, [])

  useEffect(() => {
    const api = window.electronAPI?.notepad
    if (!api?.onQueryRequest || !api.replyQuery) return

    return api.onQueryRequest((payload) => {
      void (async () => {
        try {
          await noteService.init()
          const notes = await noteService.getAllNotes()
          if (payload.action === 'list') {
            api.replyQuery({
              requestId: payload.requestId,
              ok: true,
              notes: notes
                .sort((a, b) => b.updatedAt - a.updatedAt)
                .slice(0, 40)
                .map((note) => toView(note))
            })
            return
          }
          if (payload.action === 'get') {
            const note = notes.find((item) => item.id === payload.id)
            api.replyQuery({
              requestId: payload.requestId,
              ok: true,
              notes: note ? [toView(note, true)] : []
            })
            return
          }
          const query = (payload.query ?? '').trim().toLowerCase()
          const matches = notes.filter((note) => {
            if (!query) return true
            return (
              note.title.toLowerCase().includes(query) ||
              plainText(note.content).toLowerCase().includes(query)
            )
          })
          api.replyQuery({
            requestId: payload.requestId,
            ok: true,
            notes: matches
              .sort((a, b) => b.updatedAt - a.updatedAt)
              .slice(0, 20)
              .map((note) => toView(note, true))
          })
        } catch (error) {
          api.replyQuery({
            requestId: payload.requestId,
            ok: false,
            error: error instanceof Error ? error.message : 'Failed to read notes'
          })
        }
      })()
    })
  }, [])

  return null
}
