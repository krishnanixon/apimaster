import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { v4 as uuidv4 } from 'uuid'
import type {
  VoiceConversation,
  VoiceConversationSummary,
  VoiceMessage,
  VoiceMessageRole
} from '@shared/types/voice-assistant'
import { voiceConversationDb } from './voice-db'
import { voiceSettingsStore } from './settings.store'

const STORE_FILE = 'voice-assistant-conversations.json'

interface ConversationFile {
  conversations: VoiceConversation[]
}

function storePath(): string {
  return join(app.getPath('userData'), STORE_FILE)
}

function loadFile(): ConversationFile {
  const path = storePath()
  if (!existsSync(path)) return { conversations: [] }
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as ConversationFile
    return { conversations: Array.isArray(parsed.conversations) ? parsed.conversations : [] }
  } catch {
    return { conversations: [] }
  }
}

function saveFile(data: ConversationFile): void {
  const dir = app.getPath('userData')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(storePath(), JSON.stringify(data, null, 2), 'utf-8')
}

function toSummary(conversation: VoiceConversation): VoiceConversationSummary {
  const lastUserOrAssistant = [...conversation.messages]
    .reverse()
    .find((m) => m.role === 'user' || m.role === 'assistant')
  return {
    id: conversation.id,
    title: conversation.title,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    preview: lastUserOrAssistant?.content.slice(0, 140) ?? '',
    messageCount: conversation.messages.length
  }
}

class VoiceConversationStore {
  private cache: ConversationFile | null = null
  private saved: ConversationFile | null = null
  /** IDs created while history was disabled; never write their earlier content later. */
  private transientConversationIds = new Set<string>()
  /** Messages added while history was disabled. */
  private transientMessageIds = new Set<string>()

  private data(): ConversationFile {
    if (!this.cache) {
      this.saved = loadFile()
      this.cache = structuredClone(this.saved)
    }
    return this.cache
  }

  private persist(conversation?: VoiceConversation): void {
    this.data()
    if (!conversation) return
    if (!voiceSettingsStore.get().privacy.storeConversations) {
      this.transientConversationIds.add(conversation.id)
      for (const message of conversation.messages) this.transientMessageIds.add(message.id)
      return
    }

    // Snapshot only the changed conversation. Content created while history was
    // disabled stays in memory, even if the user enables history again later.
    const snapshot = structuredClone(conversation)
    snapshot.messages = snapshot.messages.filter(
      (message) => !this.transientMessageIds.has(message.id)
    )
    if (snapshot.messages.length === 0) return
    const saved = this.saved!
    const previous = saved.conversations.find((item) => item.id === snapshot.id)
    if (this.transientConversationIds.has(snapshot.id)) {
      const firstSafeMessage = snapshot.messages.find((message) => message.role === 'user')
      snapshot.title = firstSafeMessage?.content.trim().slice(0, 48) || 'New conversation'
    } else if (previous) {
      snapshot.title = previous.title
    }
    saved.conversations = [
      snapshot,
      ...saved.conversations.filter((item) => item.id !== snapshot.id)
    ]
    saveFile(saved)
    void voiceConversationDb.upsert(snapshot)
  }

  list(): VoiceConversationSummary[] {
    return this.data()
      .conversations.map(toSummary)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  search(query: string): VoiceConversationSummary[] {
    const q = query.trim().toLowerCase()
    if (!q) return this.list()
    return this.data()
      .conversations.filter((c) => {
        if (c.title.toLowerCase().includes(q)) return true
        return c.messages.some((m) => m.content.toLowerCase().includes(q))
      })
      .map(toSummary)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  get(id: string): VoiceConversation | null {
    return this.data().conversations.find((c) => c.id === id) ?? null
  }

  create(title = 'New conversation'): VoiceConversation {
    const now = new Date().toISOString()
    const conversation: VoiceConversation = {
      id: uuidv4(),
      title,
      createdAt: now,
      updatedAt: now,
      messages: []
    }
    const file = this.data()
    file.conversations.unshift(conversation)
    this.persist(conversation)
    return conversation
  }

  rename(id: string, title: string): VoiceConversation | null {
    const file = this.data()
    const conversation = file.conversations.find((c) => c.id === id)
    if (!conversation) return null
    conversation.title = title.trim() || conversation.title
    conversation.updatedAt = new Date().toISOString()
    this.persist(conversation)
    return conversation
  }

  delete(id: string): boolean {
    const file = this.data()
    const next = file.conversations.filter((c) => c.id !== id)
    if (next.length === file.conversations.length) return false
    this.cache = { conversations: next }
    this.saved!.conversations = this.saved!.conversations.filter((item) => item.id !== id)
    saveFile(this.saved!)
    void voiceConversationDb.remove(id)
    return true
  }

  addMessage(
    conversationId: string,
    role: VoiceMessageRole,
    content: string,
    extra?: Partial<Pick<VoiceMessage, 'toolCalls' | 'toolResults' | 'metadata'>>
  ): VoiceMessage | null {
    const file = this.data()
    const conversation = file.conversations.find((c) => c.id === conversationId)
    if (!conversation) return null
    const message: VoiceMessage = {
      id: uuidv4(),
      conversationId,
      role,
      content,
      timestamp: new Date().toISOString(),
      ...extra
    }
    conversation.messages.push(message)
    conversation.updatedAt = message.timestamp
    if (conversation.title === 'New conversation' && role === 'user' && content.trim()) {
      conversation.title = content.trim().slice(0, 48)
    }
    this.persist(conversation)
    return message
  }

  clearAll(): void {
    this.cache = { conversations: [] }
    this.saved = { conversations: [] }
    this.transientConversationIds.clear()
    this.transientMessageIds.clear()
    const path = storePath()
    if (existsSync(path)) rmSync(path)
    void voiceConversationDb.clearAll()
  }
}

export const voiceConversationStore = new VoiceConversationStore()
