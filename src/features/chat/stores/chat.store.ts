import { create } from 'zustand'
import type { ChatContextAttachment, ChatStreamChunk, ContextPackSummary, Conversation, Message } from '@shared/types'
import { toast } from 'sonner'

let streamCleanup: (() => void) | null = null
let conversationUpdateCleanup: (() => void) | null = null

function clearStreamCleanup(): void {
  streamCleanup?.()
  streamCleanup = null
}

function handleStreamError(error: string): void {
  toast.error(error || 'Chat request failed')
  window.electronAPI.log.write({ level: 'error', message: error, context: 'ChatStore' })
}

function applyStreamChunk(
  chunk: ChatStreamChunk,
  accumulated: string,
  set: (partial: Partial<ChatState>) => void
): string {
  if (chunk.contextPack) {
    set({ lastContextPack: chunk.contextPack })
    return accumulated
  }
  const next = accumulated + chunk.content
  set({ streamingContent: next })
  return next
}

interface ChatState {
  conversations: Conversation[]
  currentConversation: Conversation | null
  messages: Message[]
  isStreaming: boolean
  streamingContent: string
  searchQuery: string
  isLoading: boolean
  contextAttachments: ChatContextAttachment[]
  linkedProjectId: string | null
  isGlobalMode: boolean
  lastContextPack: ContextPackSummary | null
  loadConversations: (projectId: string) => Promise<void>
  loadGlobalConversations: () => Promise<void>
  createConversation: (projectId: string) => Promise<Conversation | null>
  createGlobalConversation: () => Promise<Conversation | null>
  setLinkedProjectId: (projectId: string | null) => void
  selectConversation: (conversation: Conversation) => Promise<void>
  selectConversationById: (projectId: string, conversationId: string) => Promise<void>
  updateConversation: (id: string, data: Partial<Pick<Conversation, 'title' | 'isPinned'>>) => Promise<void>
  deleteConversation: (id: string) => Promise<void>
  duplicateConversation: (id: string) => Promise<Conversation | null>
  clearConversation: () => Promise<void>
  searchConversations: (projectId: string, query: string) => Promise<void>
  ensureConversation: (projectId?: string) => Promise<Conversation | null>
  sendMessage: (content: string) => Promise<void>
  stopStreaming: () => Promise<void>
  deleteMessage: (messageId: string) => Promise<void>
  regenerateResponse: () => Promise<void>
  editAndResend: (messageId: string, newContent: string) => Promise<void>
  setSearchQuery: (query: string) => void
  appendStreamingContent: (chunk: string) => void
  resetStreaming: () => void
  resetForProject: () => void
  resetForGlobal: () => void
  addContextAttachment: (attachment: ChatContextAttachment) => void
  removeContextAttachment: (id: string) => void
  clearContextAttachments: () => void
  initConversationListener: () => void
}

function bindRegenerateHandlers(
  conversationId: string,
  set: (partial: Partial<ChatState> | ((state: ChatState) => Partial<ChatState>)) => void
): void {
  let accumulated = ''

  clearStreamCleanup()
  streamCleanup = window.electronAPI.chat.regenerate(
    conversationId,
    (chunk) => {
      accumulated = applyStreamChunk(chunk, accumulated, set)
    },
    async () => {
      clearStreamCleanup()
      set({ isStreaming: false, streamingContent: '' })
      const result = await window.electronAPI.messages.list(conversationId)
      if (result.success && result.data) {
        set({ messages: result.data })
      }
    },
    (error) => {
      clearStreamCleanup()
      set({ isStreaming: false, streamingContent: '' })
      handleStreamError(error)
    }
  )
}

function bindEditHandlers(
  conversationId: string,
  messageId: string,
  newContent: string,
  set: (partial: Partial<ChatState> | ((state: ChatState) => Partial<ChatState>)) => void
): void {
  let accumulated = ''

  clearStreamCleanup()
  streamCleanup = window.electronAPI.chat.editMessage(
    conversationId,
    messageId,
    newContent,
    (chunk) => {
      accumulated = applyStreamChunk(chunk, accumulated, set)
    },
    async () => {
      clearStreamCleanup()
      set({ isStreaming: false, streamingContent: '' })
      const result = await window.electronAPI.messages.list(conversationId)
      if (result.success && result.data) {
        set({ messages: result.data })
      }
    },
    (error) => {
      clearStreamCleanup()
      set({ isStreaming: false, streamingContent: '' })
      handleStreamError(error)
    }
  )
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  currentConversation: null,
  messages: [],
  isStreaming: false,
  streamingContent: '',
  searchQuery: '',
  isLoading: false,
  contextAttachments: [],
  linkedProjectId: null,
  isGlobalMode: false,
  lastContextPack: null,

  setLinkedProjectId: (projectId) => set({ linkedProjectId: projectId, contextAttachments: [] }),

  initConversationListener: () => {
    if (conversationUpdateCleanup) return
    conversationUpdateCleanup = window.electronAPI.events.onConversationUpdate(
      ({ id, title }) => {
        set((state) => ({
          conversations: state.conversations.map((c) => (c.id === id ? { ...c, title } : c)),
          currentConversation:
            state.currentConversation?.id === id
              ? { ...state.currentConversation, title }
              : state.currentConversation
        }))
      }
    )
  },

  loadConversations: async (projectId) => {
    set({ isLoading: true, isGlobalMode: false, linkedProjectId: null })
    const result = await window.electronAPI.conversations.list(projectId)
    if (result.success && result.data) {
      set({ conversations: result.data, isLoading: false })
    } else {
      set({ isLoading: false })
    }
  },

  loadGlobalConversations: async () => {
    set({ isLoading: true, isGlobalMode: true })
    const result = await window.electronAPI.conversations.listGlobal()
    if (result.success && result.data) {
      set({ conversations: result.data, isLoading: false })
    } else {
      set({ isLoading: false })
    }
  },

  createGlobalConversation: async () => {
    const result = await window.electronAPI.conversations.createGlobal()
    if (result.success && result.data) {
      set((state) => ({
        conversations: [result.data!, ...state.conversations],
        isGlobalMode: true
      }))
      return result.data
    }
    return null
  },

  createConversation: async (projectId) => {
    const result = await window.electronAPI.conversations.create(projectId)
    if (result.success && result.data) {
      set((state) => ({
        conversations: [result.data!, ...state.conversations]
      }))
      return result.data
    }
    return null
  },

  selectConversation: async (conversation) => {
    clearStreamCleanup()
    set({
      currentConversation: conversation,
      messages: [],
      isLoading: true,
      isStreaming: false,
      streamingContent: ''
    })
    const result = await window.electronAPI.messages.list(conversation.id)
    if (result.success && result.data) {
      set({ messages: result.data, isLoading: false })
    } else {
      set({ isLoading: false })
    }
  },

  selectConversationById: async (projectId, conversationId) => {
    const { conversations } = get()
    let conv = conversations.find((c) => c.id === conversationId)
    if (!conv) {
      const res = await window.electronAPI.conversations.get(conversationId)
      if (res.success && res.data) conv = res.data
    }
    if (conv) await get().selectConversation(conv)
    else await get().loadConversations(projectId)
  },

  updateConversation: async (id, data) => {
    const result = await window.electronAPI.conversations.update(id, data)
    if (result.success && result.data) {
      set((state) => ({
        conversations: state.conversations.map((c) => (c.id === id ? result.data! : c)),
        currentConversation:
          state.currentConversation?.id === id ? result.data! : state.currentConversation
      }))
    }
  },

  deleteConversation: async (id) => {
    const result = await window.electronAPI.conversations.delete(id)
    if (result.success) {
      set((state) => ({
        conversations: state.conversations.filter((c) => c.id !== id),
        currentConversation: state.currentConversation?.id === id ? null : state.currentConversation,
        messages: state.currentConversation?.id === id ? [] : state.messages
      }))
    }
  },

  duplicateConversation: async (id) => {
    const result = await window.electronAPI.conversations.duplicate(id)
    if (result.success && result.data) {
      set((state) => ({
        conversations: [result.data!, ...state.conversations]
      }))
      return result.data
    }
    return null
  },

  clearConversation: async () => {
    const { currentConversation } = get()
    if (!currentConversation) return

    const result = await window.electronAPI.conversations.clearMessages(currentConversation.id)
    if (result.success) {
      set({ messages: [], streamingContent: '', isStreaming: false })
    }
  },

  searchConversations: async (projectId, query) => {
    if (!query.trim()) {
      await get().loadConversations(projectId)
      return
    }
    const result = await window.electronAPI.conversations.search(projectId, query)
    if (result.success && result.data) {
      set({ conversations: result.data })
    }
  },

  addContextAttachment: (attachment) => {
    set((state) => {
      if (state.contextAttachments.some((a) => a.type === attachment.type && a.id === attachment.id)) {
        return state
      }
      return { contextAttachments: [...state.contextAttachments, attachment] }
    })
  },

  removeContextAttachment: (id) => {
    set((state) => ({
      contextAttachments: state.contextAttachments.filter((a) => a.id !== id)
    }))
  },

  clearContextAttachments: () => set({ contextAttachments: [] }),

  ensureConversation: async (projectId?: string) => {
    const existing = get().currentConversation
    if (existing) return existing

    const conv = get().isGlobalMode
      ? await get().createGlobalConversation()
      : projectId
        ? await get().createConversation(projectId)
        : null
    if (!conv) return null
    await get().selectConversation(conv)
    return conv
  },

  sendMessage: async (content) => {
    const { currentConversation, contextAttachments, linkedProjectId, isGlobalMode } = get()
    if (!currentConversation) return

    const conversationId = currentConversation.id
    const context = contextAttachments.length > 0 ? [...contextAttachments] : undefined
    const streamOptions =
      isGlobalMode || currentConversation.scope === 'GLOBAL'
        ? { context, linkedProjectId }
        : context
          ? { context }
          : undefined

    const userMessage: Message = {
      id: `temp-${Date.now()}`,
      conversationId,
      role: 'user',
      content,
      createdAt: new Date().toISOString()
    }

    set((state) => ({
      messages: [...state.messages, userMessage],
      isStreaming: true,
      streamingContent: '',
      contextAttachments: []
    }))

    let accumulated = ''
    clearStreamCleanup()
    streamCleanup = window.electronAPI.chat.stream(
      conversationId,
      content,
      (chunk) => {
        accumulated = applyStreamChunk(chunk, accumulated, set)
      },
      async () => {
        clearStreamCleanup()
        set({ isStreaming: false, streamingContent: '' })
        const result = await window.electronAPI.messages.list(conversationId)
        if (result.success && result.data) {
          set({ messages: result.data })
        }
      },
      (error) => {
        clearStreamCleanup()
        set({ isStreaming: false, streamingContent: '' })
        handleStreamError(error)
      },
      streamOptions
    )
  },

  stopStreaming: async () => {
    const { currentConversation } = get()
    if (!currentConversation) return

    await window.electronAPI.chat.abort(currentConversation.id)
    clearStreamCleanup()
    set({ isStreaming: false, streamingContent: '' })

    const result = await window.electronAPI.messages.list(currentConversation.id)
    if (result.success && result.data) {
      set({ messages: result.data })
    }
  },

  deleteMessage: async (messageId) => {
    const result = await window.electronAPI.messages.delete(messageId)
    if (result.success) {
      set((state) => ({
        messages: state.messages.filter((m) => m.id !== messageId)
      }))
    }
  },

  regenerateResponse: async () => {
    const { currentConversation, messages, isStreaming } = get()
    if (!currentConversation || isStreaming) return

    const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant')
    if (!lastAssistant) return

    set({
      messages: messages.filter((m) => m.id !== lastAssistant.id),
      isStreaming: true,
      streamingContent: ''
    })

    bindRegenerateHandlers(currentConversation.id, set)
  },

  editAndResend: async (messageId, newContent) => {
    const { currentConversation, messages, isStreaming } = get()
    if (!currentConversation || isStreaming) return

    const trimmed = newContent.trim()
    if (!trimmed) return

    const targetIdx = messages.findIndex((m) => m.id === messageId)
    if (targetIdx === -1) return

    const kept = messages.slice(0, targetIdx + 1).map((m) =>
      m.id === messageId ? { ...m, content: trimmed } : m
    )

    set({
      messages: kept,
      isStreaming: true,
      streamingContent: ''
    })

    bindEditHandlers(currentConversation.id, messageId, trimmed, set)
  },

  setSearchQuery: (query) => set({ searchQuery: query }),

  appendStreamingContent: (chunk) =>
    set((state) => ({ streamingContent: state.streamingContent + chunk })),

  resetStreaming: () => {
    clearStreamCleanup()
    set({ isStreaming: false, streamingContent: '' })
  },

  resetForProject: () => {
    clearStreamCleanup()
    set({
      conversations: [],
      currentConversation: null,
      messages: [],
      isStreaming: false,
      streamingContent: '',
      searchQuery: '',
      isLoading: false,
      contextAttachments: [],
      linkedProjectId: null,
      isGlobalMode: false,
      lastContextPack: null
    })
  },

  resetForGlobal: () => {
    clearStreamCleanup()
    set({
      conversations: [],
      currentConversation: null,
      messages: [],
      isStreaming: false,
      streamingContent: '',
      searchQuery: '',
      isLoading: false,
      contextAttachments: [],
      linkedProjectId: null,
      isGlobalMode: true,
      lastContextPack: null
    })
  }
}))
