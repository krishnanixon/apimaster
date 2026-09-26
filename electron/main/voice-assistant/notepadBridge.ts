import { randomUUID } from 'crypto'
import { BrowserWindow, ipcMain } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc/channels'
import { ASSISTANT_NAME } from '@shared/constants/product'
import { logger } from '../infra/logger.service'

export interface NotepadNoteView {
  id: string
  title: string
  preview: string
  content?: string
  updatedAt: number
}

type CreateResult = {
  requestId: string
  ok: boolean
  id?: string
  title?: string
  error?: string
}

type QueryResult = {
  requestId: string
  ok: boolean
  notes?: NotepadNoteView[]
  error?: string
}

const createPending = new Map<
  string,
  {
    resolve: (value: { id: string; title: string }) => void
    reject: (error: Error) => void
    timer: ReturnType<typeof setTimeout>
  }
>()

const queryPending = new Map<
  string,
  {
    resolve: (value: NotepadNoteView[]) => void
    reject: (error: Error) => void
    timer: ReturnType<typeof setTimeout>
  }
>()

let registered = false

function targetWindow(): BrowserWindow | null {
  const windows = BrowserWindow.getAllWindows().filter((win) => !win.isDestroyed())
  const focused = BrowserWindow.getFocusedWindow()
  if (focused && !focused.isDestroyed()) return focused
  return windows[0] ?? null
}

export function registerNotepadBridge(): void {
  if (registered) return
  registered = true
  ipcMain.on(IPC_CHANNELS.NOTEPAD_CREATE_RESULT, (_event, payload: CreateResult) => {
    const entry = createPending.get(payload.requestId)
    if (!entry) return
    clearTimeout(entry.timer)
    createPending.delete(payload.requestId)
    if (payload.ok && payload.id) {
      entry.resolve({ id: payload.id, title: payload.title || 'Untitled' })
      return
    }
    entry.reject(new Error(payload.error || 'Could not save note to Notepad'))
  })
  ipcMain.on(IPC_CHANNELS.NOTEPAD_QUERY_RESULT, (_event, payload: QueryResult) => {
    const entry = queryPending.get(payload.requestId)
    if (!entry) return
    clearTimeout(entry.timer)
    queryPending.delete(payload.requestId)
    if (payload.ok) {
      entry.resolve(payload.notes ?? [])
      return
    }
    entry.reject(new Error(payload.error || 'Could not read Notepad'))
  })
}

/** Creates a note in the app Notepad (IndexedDB) via the renderer bridge. */
export function createNotepadNote(title: string, content: string): Promise<{ id: string; title: string }> {
  registerNotepadBridge()
  return new Promise((resolve, reject) => {
    const requestId = randomUUID()
    const timer = setTimeout(() => {
      createPending.delete(requestId)
      reject(new Error('Timed out saving note to Notepad. Keep the app open and try again.'))
    }, 10_000)

    createPending.set(requestId, { resolve, reject, timer })

    const target = targetWindow()
    if (!target) {
      clearTimeout(timer)
      createPending.delete(requestId)
      reject(new Error('No app window available to save the note.'))
      return
    }

    target.webContents.send(IPC_CHANNELS.NOTEPAD_CREATE_REQUEST, {
      requestId,
      title: title.trim() || `${ASSISTANT_NAME} note`,
      content: content.trim()
    })
    logger.info(`Notepad create requested from ${ASSISTANT_NAME}`, 'Voice')
  })
}

export function queryNotepadNotes(input: {
  action: 'list' | 'get' | 'search'
  id?: string
  query?: string
}): Promise<NotepadNoteView[]> {
  registerNotepadBridge()
  return new Promise((resolve, reject) => {
    const requestId = randomUUID()
    const timer = setTimeout(() => {
      queryPending.delete(requestId)
      reject(new Error('Timed out reading Notepad. Keep the app open and try again.'))
    }, 10_000)

    queryPending.set(requestId, { resolve, reject, timer })

    const target = targetWindow()
    if (!target) {
      clearTimeout(timer)
      queryPending.delete(requestId)
      reject(new Error('No app window available to read Notepad.'))
      return
    }

    target.webContents.send(IPC_CHANNELS.NOTEPAD_QUERY_REQUEST, {
      requestId,
      action: input.action,
      id: input.id,
      query: input.query
    })
  })
}
