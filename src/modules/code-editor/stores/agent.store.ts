import { create } from 'zustand'
import { waitForDesktopApi } from '@/shared/lib/desktop-api'
import {
  agentConversationTitle,
  compactAgentConversationItems,
  deriveChecklist,
  formatToolActivity,
  formatToolDone
} from '@shared/lib/agent-activity'
import type {
  AgentEvent,
  AgentFileRef,
  AgentHistoryTurn,
  AgentMode,
  AgentPatchRecord,
  AgentPendingConfirmation,
  AgentReviewFinding,
  AgentRunSnapshot,
  PersistedAgentThreadItem
} from '@shared/types/agent'
import { useAIStore } from '@/features/ai/stores/ai.store'
import { useProjectStore } from '@/shared/stores/project.store'
import { useProblemsStore } from './problems.store'

export type AgentThreadItem =
  | PersistedAgentThreadItem
  | {
      id: string
      kind: 'patch'
      record: AgentPatchRecord
    }
  | {
      id: string
      kind: 'review'
      findings: AgentReviewFinding[]
    }

export interface AgentChat {
  id: string
  title: string
  mode: AgentMode
  draft: string
  run: AgentRunSnapshot | null
  pending: AgentPendingConfirmation | null
  thread: AgentThreadItem[]
  toolsUsed: string[]
  currentTool: string | null
  attached: AgentFileRef[]
  createdAt: string
  updatedAt: string
}

interface AgentState {
  chats: AgentChat[]
  activeChatId: string
  patches: AgentPatchRecord[]
  conversationRestoredFor: string | null
  setMode: (mode: AgentMode) => void
  setDraft: (draft: string) => void
  /** @deprecated use setDraft — kept for inline AI actions */
  setGoal: (goal: string) => void
  attachFiles: (files: AgentFileRef[]) => void
  detachFile: (path: string) => void
  restoreConversation: (rootPath: string) => Promise<void>
  newChat: () => void
  selectChat: (id: string) => void
  closeChat: (id: string) => Promise<void>
  closeAllChats: () => Promise<void>
  start: (override?: { goal?: string; mode?: AgentMode }) => Promise<void>
  cancel: () => Promise<void>
  pause: () => Promise<void>
  resume: () => Promise<void>
  confirm: (approved: boolean) => Promise<void>
  revertLast: () => Promise<boolean>
  revertPatch: (id: string) => Promise<boolean>
  acceptPatch: (id: string) => Promise<boolean>
  acceptHunk: (id: string, hunkIndex: number) => Promise<boolean>
  rejectHunk: (id: string, hunkIndex: number) => Promise<boolean>
  acceptAllPatches: () => Promise<number>
  restoreCheckpoint: (runId: string) => Promise<number>
  subscribe: () => () => void
}

let seq = 0

function nextId(): string {
  return `${Date.now()}-${seq++}`
}

function createChat(mode: AgentMode = 'agent'): AgentChat {
  const now = new Date().toISOString()
  return {
    id: nextId(),
    title: 'New chat',
    mode,
    draft: '',
    run: null,
    pending: null,
    thread: [],
    toolsUsed: [],
    currentTool: null,
    attached: [],
    createdAt: now,
    updatedAt: now
  }
}

function updateChat(
  chats: AgentChat[],
  id: string,
  updater: (chat: AgentChat) => Partial<AgentChat>
): AgentChat[] {
  return chats.map((chat) =>
    chat.id === id
      ? { ...chat, ...updater(chat), updatedAt: new Date().toISOString() }
      : chat
  )
}

function activeChat(state: Pick<AgentState, 'chats' | 'activeChatId'>): AgentChat | undefined {
  return state.chats.find((chat) => chat.id === state.activeChatId)
}

function updateAllThreads(
  chats: AgentChat[],
  updater: (thread: AgentThreadItem[]) => AgentThreadItem[]
): AgentChat[] {
  return chats.map((chat) => {
    const thread = updater(chat.thread)
    return thread === chat.thread
      ? chat
      : { ...chat, thread, updatedAt: new Date().toISOString() }
  })
}

function upsertAssistantText(
  thread: AgentThreadItem[],
  text: string,
  append: boolean
): AgentThreadItem[] {
  const last = thread[thread.length - 1]
  if (last?.kind === 'assistant') {
    return [...thread.slice(0, -1), { ...last, text: append ? last.text + text : text }]
  }
  return [...thread, { id: nextId(), kind: 'assistant', text }]
}

function historyFromThread(thread: AgentThreadItem[]): AgentHistoryTurn[] {
  return thread
    .filter((item): item is Extract<AgentThreadItem, { kind: 'user' | 'assistant' }> => {
      return item.kind === 'user' || item.kind === 'assistant'
    })
    .map((item) => ({ role: item.kind, content: item.text }))
    .slice(-12)
}

const initialChat = createChat()

export const useAgentStore = create<AgentState>((set, get) => ({
  chats: [initialChat],
  activeChatId: initialChat.id,
  patches: [],
  conversationRestoredFor: null,

  setMode: (mode) =>
    set((state) => ({ chats: updateChat(state.chats, state.activeChatId, () => ({ mode })) })),
  setDraft: (draft) =>
    set((state) => ({ chats: updateChat(state.chats, state.activeChatId, () => ({ draft })) })),
  setGoal: (goal) =>
    set((state) => ({ chats: updateChat(state.chats, state.activeChatId, () => ({ draft: goal })) })),

  attachFiles: (files) =>
    set((state) => {
      const chat = activeChat(state)
      if (!chat) return state
      const next = [...chat.attached]
      for (const file of files) {
        if (!file.path || next.some((item) => item.path === file.path)) continue
        next.push(file)
      }
      return {
        chats: updateChat(state.chats, chat.id, () => ({ attached: next.slice(0, 40) }))
      }
    }),
  detachFile: (path) =>
    set((state) => ({
      chats: updateChat(state.chats, state.activeChatId, (chat) => ({
        attached: chat.attached.filter((file) => file.path !== path)
      }))
    })),

  restoreConversation: async (rootPath) => {
    const api = await waitForDesktopApi()
    if (!api?.codeEditor?.getWorkspaceState || get().conversationRestoredFor === rootPath) return
    const result = await api.codeEditor.getWorkspaceState()
    const saved = result.success ? result.data?.agentConversation : null
    const patchesResult = await api?.agent?.listPatches?.()
    const livePatches = patchesResult?.success ? patchesResult.data ?? [] : []
    const restoredPatches =
      livePatches.length > 0
        ? livePatches.filter((item) => item.status === 'pending' || item.status === 'applied')
        : Array.isArray(saved?.pendingPatches)
          ? saved.pendingPatches.filter((item) => item.status === 'pending')
          : []
    if (saved?.workspaceRoot === rootPath) {
      const persisted = Array.isArray(saved.conversations) ? saved.conversations : []
      const restored: AgentChat[] = persisted
        .slice(0, 50)
        .filter((chat) => chat && typeof chat.id === 'string')
        .map((chat) => {
          const thread = Array.isArray(chat.thread) ? chat.thread.slice(-80) : []
          return {
            id: chat.id,
            title: chat.title || 'New chat',
            mode: chat.mode ?? 'agent',
            draft: typeof chat.draft === 'string' ? chat.draft.slice(0, 10_000) : '',
            run: null,
            pending: null,
            thread,
            toolsUsed: thread.flatMap((item) =>
              item.kind === 'tool' && item.status === 'ok' ? [item.name] : []
            ),
            currentTool: null,
            attached: Array.isArray(chat.attached) ? chat.attached.slice(0, 20) : [],
            createdAt: chat.createdAt || saved.updatedAt,
            updatedAt: chat.updatedAt || saved.updatedAt
          }
        })
      if (restored.length === 0 && saved.mode && Array.isArray(saved.thread)) {
        const migrated = createChat(saved.mode)
        migrated.title =
          saved.thread.find((item) => item.kind === 'user')?.text
            ? agentConversationTitle(saved.thread.find((item) => item.kind === 'user')?.text ?? '')
            : 'Previous chat'
        migrated.thread = saved.thread
        migrated.attached = Array.isArray(saved.attached) ? saved.attached : []
        migrated.toolsUsed = saved.thread.flatMap((item) =>
          item.kind === 'tool' && item.status === 'ok' ? [item.name] : []
        )
        migrated.updatedAt = saved.updatedAt
        restored.push(migrated)
      }
      const chats = restored.length > 0 ? restored : [createChat()]
      const requestedActive = saved.activeConversationId
      set({
        chats,
        activeChatId: chats.some((chat) => chat.id === requestedActive)
          ? (requestedActive as string)
          : chats[0]!.id,
        conversationRestoredFor: rootPath,
        patches: restoredPatches
      })
    } else {
      const chat = createChat()
      set({
        chats: [chat],
        activeChatId: chat.id,
        patches: restoredPatches,
        conversationRestoredFor: rootPath
      })
    }
  },

  newChat: () =>
    set((state) => {
      const chat = createChat(activeChat(state)?.mode ?? 'agent')
      return { chats: [chat, ...state.chats].slice(0, 50), activeChatId: chat.id }
    }),

  selectChat: (id) =>
    set((state) => (state.chats.some((chat) => chat.id === id) ? { activeChatId: id } : state)),

  closeChat: async (id) => {
    const chat = get().chats.find((item) => item.id === id)
    if (!chat) return
    if (chat.run && ['planning', 'running', 'waiting', 'paused'].includes(chat.run.status)) {
      const api = await waitForDesktopApi()
      await api?.agent?.cancel?.(chat.run.runId)
    }
    set((state) => {
      const remaining = state.chats.filter((item) => item.id !== id)
      if (remaining.length > 0) {
        return {
          chats: remaining,
          activeChatId: state.activeChatId === id ? remaining[0]!.id : state.activeChatId
        }
      }
      const replacement = createChat(chat.mode)
      return { chats: [replacement], activeChatId: replacement.id }
    })
  },

  closeAllChats: async () => {
    const running = get().chats
      .map((chat) => chat.run)
      .filter(
        (run): run is AgentRunSnapshot =>
          Boolean(run && ['planning', 'running', 'waiting', 'paused'].includes(run.status))
      )
    const api = running.length > 0 ? await waitForDesktopApi() : null
    await Promise.all(running.map((run) => api?.agent?.cancel?.(run.runId)))
    const replacement = createChat(activeChat(get())?.mode ?? 'agent')
    set({ chats: [replacement], activeChatId: replacement.id })
  },

  start: async (override) => {
    const api = await waitForDesktopApi()
    if (!api?.agent?.run) return
    const chat = activeChat(get())
    if (!chat) return
    const chatId = chat.id
    const status = chat.run?.status
    if (status === 'running' || status === 'planning' || status === 'waiting' || status === 'paused') return
    const goal = (override?.goal ?? chat.draft).trim()
    const mode = override?.mode ?? chat.mode
    if (!goal) return
    const history = historyFromThread(chat.thread)
    const model = useAIStore.getState().activeModel ?? undefined
    const projectId = useProjectStore.getState().currentProject?.id ?? null
    const files = chat.attached
    set((state) => ({
      chats: updateChat(state.chats, chatId, (current) => ({
        pending: null,
        currentTool: null,
        toolsUsed: [],
        draft: '',
        mode,
        title: current.thread.length === 0 ? agentConversationTitle(goal) : current.title,
        thread: [...current.thread, { id: nextId(), kind: 'user', text: goal }]
      }))
    }))
    const result = await api.agent.run({ goal, mode, model, history, files, projectId })
    if (result.success && result.data) {
      set((state) => ({
        chats: updateChat(state.chats, chatId, () => ({ run: result.data ?? null }))
      }))
    } else if (!result.success) {
      set((state) => ({
        chats: updateChat(state.chats, chatId, (current) => ({
          thread: [
            ...current.thread,
            { id: nextId(), kind: 'assistant', text: result.error ?? 'Agent failed to start.' }
          ]
        }))
      }))
    }
  },

  cancel: async () => {
    const api = await waitForDesktopApi()
    const runId = activeChat(get())?.run?.runId
    if (!api?.agent?.cancel || !runId) return
    await api.agent.cancel(runId)
  },

  pause: async () => {
    const api = await waitForDesktopApi()
    const runId = activeChat(get())?.run?.runId
    if (!api?.agent?.pause || !runId) return
    await api.agent.pause(runId)
  },

  resume: async () => {
    const api = await waitForDesktopApi()
    const runId = activeChat(get())?.run?.runId
    if (!api?.agent?.resume || !runId) return
    await api.agent.resume(runId)
  },

  confirm: async (approved) => {
    const api = await waitForDesktopApi()
    const pending = activeChat(get())?.pending
    if (!api?.agent?.confirm || !pending) return
    await api.agent.confirm(pending.requestId, approved)
    set((state) => ({
      chats: updateChat(state.chats, state.activeChatId, () => ({ pending: null }))
    }))
  },

  revertLast: async () => {
    const api = await waitForDesktopApi()
    if (!api?.agent?.revertLast) return false
    const result = await api.agent.revertLast()
    if (result.success && result.data) {
      const record = result.data
      set((state) => ({
        patches: state.patches.filter((patch) => patch.id !== record.id),
        chats: updateAllThreads(state.chats, (thread) =>
          thread.some((item) => item.kind === 'patch' && item.record.id === record.id)
            ? thread.filter((item) => !(item.kind === 'patch' && item.record.id === record.id))
            : thread
        )
      }))
      void import('./codeEditor.store').then(({ useCodeEditorStore }) => {
        useCodeEditorStore.getState().applyAgentContent(record.path, record.previous)
      })
      return true
    }
    return false
  },

  revertPatch: async (id) => {
    const api = await waitForDesktopApi()
    if (!api?.agent?.revertPatch) return false
    const result = await api.agent.revertPatch(id)
    if (result.success && result.data) {
      const record = result.data
      set((state) => ({
        patches: state.patches.filter((patch) => patch.id !== id),
        chats: updateAllThreads(state.chats, (thread) =>
          thread.some((item) => item.kind === 'patch' && item.record.id === id)
            ? thread.filter((item) => !(item.kind === 'patch' && item.record.id === id))
            : thread
        )
      }))
      void import('./codeEditor.store').then(({ useCodeEditorStore }) => {
        useCodeEditorStore.getState().applyAgentContent(record.path, record.previous)
      })
      return true
    }
    return false
  },

  acceptPatch: async (id) => {
    const api = await waitForDesktopApi()
    if (!api?.agent?.acceptPatch) return false
    const result = await api.agent.acceptPatch(id)
    if (result.success && result.data) {
      const record = result.data
      set((state) => ({
        patches: state.patches.map((patch) => (patch.id === id ? record : patch)),
        chats: updateAllThreads(state.chats, (thread) =>
          thread.some((item) => item.kind === 'patch' && item.record.id === id)
            ? thread.map((item) =>
                item.kind === 'patch' && item.record.id === id ? { ...item, record } : item
              )
            : thread
        )
      }))
      void import('./codeEditor.store').then(({ useCodeEditorStore }) => {
        const editor = useCodeEditorStore.getState()
        if (record.deleted) {
          const absolute = editor.rootPath ? `${editor.rootPath}/${record.path}` : record.path
          editor.closeTab(absolute)
          void editor.refreshOpenDirectories()
        } else {
          editor.applyAgentContent(record.path, record.next)
        }
      })
      return true
    }
    return false
  },

  acceptHunk: async (id, hunkIndex) => {
    const api = await waitForDesktopApi()
    if (!api?.agent?.acceptHunk) return false
    const result = await api.agent.acceptHunk(id, hunkIndex)
    if (!result.success || !result.data) return false
    const record = result.data
    set((state) => ({
      patches:
        record.status === 'rejected'
          ? state.patches.filter((patch) => patch.id !== id)
          : state.patches.map((patch) => (patch.id === id ? record : patch)),
      chats: updateAllThreads(state.chats, (thread) =>
        thread.map((item) =>
          item.kind === 'patch' && item.record.id === id ? { ...item, record } : item
        )
      )
    }))
    void import('./codeEditor.store').then(({ useCodeEditorStore }) => {
      useCodeEditorStore.getState().applyAgentContent(record.path, record.previous)
    })
    return true
  },

  rejectHunk: async (id, hunkIndex) => {
    const api = await waitForDesktopApi()
    if (!api?.agent?.rejectHunk) return false
    const result = await api.agent.rejectHunk(id, hunkIndex)
    if (!result.success || !result.data) return false
    const record = result.data
    set((state) => ({
      patches:
        record.status === 'rejected'
          ? state.patches.filter((patch) => patch.id !== id)
          : state.patches.map((patch) => (patch.id === id ? record : patch)),
      chats: updateAllThreads(state.chats, (thread) =>
        record.status === 'rejected'
          ? thread.filter((item) => !(item.kind === 'patch' && item.record.id === id))
          : thread.map((item) =>
              item.kind === 'patch' && item.record.id === id ? { ...item, record } : item
            )
      )
    }))
    void import('./codeEditor.store').then(({ useCodeEditorStore }) => {
      if (record.status !== 'rejected') {
        useCodeEditorStore.getState().applyAgentContent(record.path, record.next)
      } else {
        useCodeEditorStore.getState().applyAgentContent(record.path, record.previous)
      }
    })
    return true
  },

  acceptAllPatches: async () => {
    const api = await waitForDesktopApi()
    if (!api?.agent?.acceptAllPatches) return 0
    const result = await api.agent.acceptAllPatches()
    const records = result.success ? result.data ?? [] : []
    if (records.length === 0) return 0
    set((state) => ({
      patches: state.patches.map((patch) => records.find((item) => item.id === patch.id) ?? patch),
      chats: updateAllThreads(state.chats, (thread) => {
        const affected = thread.some(
          (item) => item.kind === 'patch' && records.some((record) => record.id === item.record.id)
        )
        if (!affected) return thread
        return thread.map((item) => {
          if (item.kind !== 'patch') return item
          const next = records.find((record) => record.id === item.record.id)
          return next ? { ...item, record: next } : item
        })
      })
    }))
    void import('./codeEditor.store').then(({ useCodeEditorStore }) => {
      const editor = useCodeEditorStore.getState()
      for (const record of records) editor.applyAgentContent(record.path, record.next)
    })
    return records.length
  },

  restoreCheckpoint: async (runId) => {
    const api = await waitForDesktopApi()
    if (!api?.agent?.restoreCheckpoint) return 0
    const result = await api.agent.restoreCheckpoint(runId)
    const restored = result.success ? result.data?.restored ?? [] : []
    if (restored.length === 0) return 0
    const restoredIds = new Set(restored.map((record) => record.id))
    set((state) => ({
      patches: state.patches.filter((record) => !restoredIds.has(record.id)),
      chats: updateAllThreads(state.chats, (thread) =>
        thread.some((item) => item.kind === 'patch' && restoredIds.has(item.record.id))
          ? thread.filter((item) => item.kind !== 'patch' || !restoredIds.has(item.record.id))
          : thread
      )
    }))
    void import('./codeEditor.store').then(({ useCodeEditorStore }) => {
      const editor = useCodeEditorStore.getState()
      for (const record of restored) {
        if (record.created) {
          const absolute = editor.rootPath ? `${editor.rootPath}/${record.path}` : record.path
          editor.closeTab(absolute)
        } else {
          editor.applyAgentContent(record.path, record.previous)
        }
      }
      void editor.refreshOpenDirectories()
    })
    return restored.length
  },

  subscribe: () => {
    const api = window.electronAPI
    if (!api?.agent?.onEvent) return () => undefined
    return api.agent.onEvent((event: AgentEvent) => {
      set((state) => {
        const target = state.chats.find((chat) => chat.run?.runId === event.runId)
        if (!target) return state
        const chatId = target.id
        if (event.type === 'status') {
          return {
            chats: updateChat(state.chats, chatId, (chat) => ({
              run: chat.run ? { ...chat.run, status: event.status } : chat.run
            }))
          }
        }
        if (event.type === 'context') {
          const fileCount = event.summary.files.length
          const text = `Using ${event.summary.chunkCount} context chunk${event.summary.chunkCount === 1 ? '' : 's'} across ${fileCount} file${fileCount === 1 ? '' : 's'}`
          return {
            chats: updateChat(state.chats, chatId, (chat) => ({
              thread: [
                ...chat.thread,
                { id: nextId(), kind: 'context', text, summary: event.summary }
              ]
            }))
          }
        }
        if (event.type === 'text') {
          return {
            chats: updateChat(state.chats, chatId, (chat) => ({
              currentTool: null,
              thread: upsertAssistantText(chat.thread, event.text, false)
            }))
          }
        }
        if (event.type === 'text_delta') {
          return {
            chats: updateChat(state.chats, chatId, (chat) => ({
              currentTool: null,
              thread: upsertAssistantText(chat.thread, event.text, true)
            }))
          }
        }
        if (event.type === 'tool') {
          return {
            chats: updateChat(state.chats, chatId, (chat) => ({
              currentTool: event.name,
              toolsUsed: chat.toolsUsed.includes(event.name)
                ? chat.toolsUsed
                : [...chat.toolsUsed, event.name],
              thread: [
                ...chat.thread,
                {
                  id: nextId(),
                  kind: 'tool',
                  name: event.name,
                  input: event.input,
                  label: formatToolActivity(event.name, event.input),
                  status: 'running'
                }
              ]
            }))
          }
        }
        if (event.type === 'tool_result') {
          if (['get_diagnostics', 'run_linter', 'run_test'].includes(event.name)) {
            useProblemsStore.getState().ingestOutput(event.output)
          }
          const next = [...target.thread]
          for (let i = next.length - 1; i >= 0; i--) {
            const item = next[i]
            if (item?.kind === 'tool' && item.name === event.name && item.status === 'running') {
              next[i] = {
                ...item,
                status: event.ok ? 'ok' : 'failed',
                label: formatToolDone(event.name, item.input, event.ok),
                output: event.output.slice(0, 4_000)
              }
              break
            }
          }
          return {
            chats: updateChat(state.chats, chatId, () => ({ currentTool: null, thread: next }))
          }
        }
        if (event.type === 'patch') {
          if (event.record.status === 'applied') {
            void import('./codeEditor.store').then(({ useCodeEditorStore }) => {
              const editor = useCodeEditorStore.getState()
              if (event.record.deleted) {
                const absolute = editor.rootPath
                  ? `${editor.rootPath}/${event.record.path}`
                  : event.record.path
                editor.closeTab(absolute)
                void editor.refreshOpenDirectories()
              } else {
                editor.applyAgentContent(event.record.path, event.record.next)
              }
            })
          } else if (event.record.deleted) {
            void import('./codeEditor.store').then(({ useCodeEditorStore }) => {
              useCodeEditorStore.getState().applyAgentContent(event.record.path, '')
            })
          }
          void import('./workbench.store').then(({ useWorkbenchLayoutStore }) => {
            useWorkbenchLayoutStore.getState().openChanges()
          })
          const existing = target.thread.find(
            (item) => item.kind === 'patch' && item.record.id === event.record.id
          )
          return {
            patches: [event.record, ...state.patches.filter((patch) => patch.id !== event.record.id)].slice(0, 24),
            chats: updateChat(state.chats, chatId, (chat) => ({
              thread: existing
                ? chat.thread.map((item) =>
                    item.kind === 'patch' && item.record.id === event.record.id
                      ? { ...item, record: event.record }
                      : item
                  )
                : [...chat.thread, { id: nextId(), kind: 'patch', record: event.record }]
            }))
          }
        }
        if (event.type === 'review_findings') {
          return {
            chats: updateChat(state.chats, chatId, (chat) => ({
              thread: [
                ...chat.thread,
                { id: nextId(), kind: 'review', findings: event.findings }
              ]
            }))
          }
        }
        if (event.type === 'pending') {
          return {
            chats: updateChat(state.chats, chatId, (chat) => ({
              pending: event.pending,
              run: chat.run ? { ...chat.run, status: 'waiting' } : chat.run
            }))
          }
        }
        if (event.type === 'done') {
          return {
            chats: updateChat(state.chats, chatId, () => ({
              run: event.snapshot,
              pending: null,
              currentTool: null
            }))
          }
        }
        if (event.type === 'error') {
          return {
            chats: updateChat(state.chats, chatId, (chat) => ({
              run: chat.run ? { ...chat.run, status: 'error', error: event.error } : chat.run,
              currentTool: null,
              thread: [...chat.thread, { id: nextId(), kind: 'assistant', text: event.error }]
            }))
          }
        }
        return state
      })
    })
  }
}))

export function agentChecklist(state: Pick<AgentChat, 'toolsUsed' | 'currentTool' | 'run'>) {
  const running = state.run?.status === 'running' || state.run?.status === 'planning' || state.run?.status === 'paused'
  return deriveChecklist(state.toolsUsed, running, state.currentTool ?? undefined)
}

let conversationPersistTimer: ReturnType<typeof setTimeout> | null = null

useAgentStore.subscribe((state, previous) => {
  const rootPath = state.conversationRestoredFor
  if (!rootPath) return
  if (
    state.chats === previous.chats &&
    state.activeChatId === previous.activeChatId &&
    state.patches === previous.patches
  ) {
    return
  }
  if (conversationPersistTimer) clearTimeout(conversationPersistTimer)
  conversationPersistTimer = setTimeout(() => {
    conversationPersistTimer = null
    void waitForDesktopApi().then((api) =>
      api?.codeEditor?.saveWorkspaceState?.({
        agentConversation: {
          workspaceRoot: rootPath,
          activeConversationId: state.activeChatId,
          conversations: state.chats.slice(0, 50).map((chat) => ({
            id: chat.id,
            title: chat.title,
            mode: chat.mode,
            draft: chat.draft.slice(0, 10_000),
            thread: compactAgentConversationItems(chat.thread),
            attached: chat.attached.slice(0, 20),
            createdAt: chat.createdAt,
            updatedAt: chat.updatedAt
          })),
          pendingPatches: state.patches
            .filter((patch) => patch.status === 'pending')
            .slice(0, 100)
            .map((patch) => ({ ...patch })),
          updatedAt: new Date().toISOString()
        }
      })
    )
  }, 350)
})
