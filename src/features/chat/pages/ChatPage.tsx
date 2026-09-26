import { useEffect, useState, useRef, useMemo } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  Plus,
  Pin,
  PinOff,
  Copy,
  Trash2,
  Pencil,
  Send,
  Search,
  Check,
  Square,
  ChevronDown,
  MoreHorizontal,
  RotateCcw,
  Eraser,
  Files,
  Download,
  GitBranch,
  FileText,
  BookOpen,
  Cpu,
  Cloud,
  Presentation,
  ExternalLink,
  PanelRightClose,
  PanelRightOpen,
  Bot,
  MessageSquare,
  Mic,
  AudioLines,
  Volume2,
  Sparkles,
  ArrowUpRight
} from 'lucide-react'
import { useChatStore } from '@/features/chat/stores/chat.store'
import { useAIStore } from '@/features/ai/stores/ai.store'
import { useAgentStore } from '@/modules/code-editor/stores/agent.store'
import { useWorkbenchLayoutStore } from '@/modules/code-editor/stores/workbench.store'
import { catalogForCloudProvider, getModelLabel } from '@shared/lib/ai-models'
import { formatCost, formatTokens } from '@/features/ai/lib/provider-meta'
import {
  cloudModelConfigPatch,
  normalizeCloudProvider,
  resolveProviderModel
} from '@shared/lib/ai-routing'
import {
  buildCrossModuleChatPrompts,
  GLOBAL_ASSISTANT_PROMPTS,
  buildGlobalPromptsWithProject
} from '../lib/cross-module-prompts'
import { ChatContextBar } from '../components/ChatContextBar'
import {
  ChatAssistantActions,
  type GeneratedArtifact
} from '../components/ChatAssistantActions'
import { useProjectStore } from '@/shared/stores/project.store'
import { useSettingsStore } from '@/shared/stores/settings.store'
import { buildProjectChatPrompts } from '@shared/lib/project-bootstrap'
import { Button } from '@/shared/components/ui/button'
import { AppLogo } from '@/shared/components/AppLogo'
import { Input } from '@/shared/components/ui/input'
import { ScrollArea } from '@/shared/components/ui/scroll-area'
import { EmptyStateIllustrated } from '@/shared/components/ui/empty-state'
import { Spinner } from '@/shared/components/ui/spinner'
import { useChatVoice } from '@/features/chat/hooks/useChatVoice'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/shared/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/shared/components/ui/dropdown-menu'
import { cn, formatRelativeTime } from '@/shared/lib/utils'
import { toast } from 'sonner'
import type { CloudProviderId, Conversation } from '@shared/types'

const CLOUD_MODEL_LABEL: Record<CloudProviderId, string> = {
  openai: 'OpenAI model',
  anthropic: 'Claude model',
  gemini: 'Gemini model',
  deepseek: 'DeepSeek model',
  openrouter: 'OpenRouter model'
}

const SUGGESTED_PROMPTS_FALLBACK = [
  'What are the key requirements for this project?',
  'Summarize scope, goals, and priorities',
  'What modules and features should we define?',
  'Identify risks and assumptions',
  'Suggest functional requirements for the core workflow'
]

type ConfirmAction =
  | { type: 'delete-conversation'; id: string; title: string }
  | { type: 'delete-message'; id: string }
  | { type: 'clear-conversation' }
  | null

type ChatArtifact = GeneratedArtifact & { messageId?: string }

// Prevent duplicate startup conversations when the page is briefly remounted.
let globalConversationInitPromise: Promise<Conversation | null> | null = null

export function ChatPage({ global = false }: { global?: boolean }) {
  const { projectId: routeProjectId } = useParams<{ projectId: string }>()
  const projectId = global ? undefined : routeProjectId
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { currentProject } = useProjectStore()
  const { settings, apiKeyStatus, updateSettings } = useSettingsStore()
  const {
    conversations,
    currentConversation,
    messages,
    isStreaming,
    streamingContent,
    isLoading,
    createConversation,
    selectConversation,
    updateConversation,
    deleteConversation,
    duplicateConversation,
    clearConversation,
    searchConversations,
    stopStreaming,
    deleteMessage,
    regenerateResponse,
    editAndResend,
    contextAttachments,
    addContextAttachment,
    removeContextAttachment,
    clearContextAttachments,
    initConversationListener,
    selectConversationById,
    loadGlobalConversations,
    createGlobalConversation,
    linkedProjectId,
    setLinkedProjectId,
    lastContextPack
  } = useChatStore()
  const { projects, loadProjects } = useProjectStore()
  const { config, loadStatus, setConfig, getProvider } = useAIStore()

  const [input, setInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [renameTarget, setRenameTarget] = useState<{ id: string; title: string } | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null)
  const [generatedArtifacts, setGeneratedArtifacts] = useState<ChatArtifact[]>([])
  const [historySidebarOpen, setHistorySidebarOpen] = useState(true)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const autoSelectedRef = useRef(false)

  const pinnedConversations = useMemo(
    () => conversations.filter((c) => c.isPinned),
    [conversations]
  )
  const recentConversations = useMemo(
    () => conversations.filter((c) => !c.isPinned),
    [conversations]
  )

  const lastAssistantId = useMemo(() => {
    const last = [...messages].reverse().find((m) => m.role === 'assistant')
    return last?.id ?? null
  }, [messages])

  const lastAssistantContent = useMemo(() => {
    const last = [...messages].reverse().find((m) => m.role === 'assistant')
    return last?.content ?? ''
  }, [messages])

  const suggestedPrompts = useMemo(() => {
    if (global) {
      const linked = projects.find((p) => p.id === linkedProjectId)
      if (linked) return buildGlobalPromptsWithProject(linked.name)
      return GLOBAL_ASSISTANT_PROMPTS
    }
    if (currentProject) {
      return [
        ...buildProjectChatPrompts(currentProject).slice(0, 3),
        ...buildCrossModuleChatPrompts(currentProject).slice(0, 3)
      ]
    }
    return SUGGESTED_PROMPTS_FALLBACK
  }, [global, currentProject, linkedProjectId, projects])

  useEffect(() => {
    initConversationListener()
    if (global) {
      const store = useChatStore.getState()
      store.resetForGlobal()
      let cancelled = false
      if (!globalConversationInitPromise) {
        globalConversationInitPromise = (async () => {
          await Promise.all([loadProjects(), loadGlobalConversations()])
          const current = useChatStore.getState().conversations[0]
          return current ?? (await createGlobalConversation())
        })().finally(() => {
          globalConversationInitPromise = null
        })
      }
      void globalConversationInitPromise.then(async (conversation) => {
        if (!cancelled && conversation) await selectConversation(conversation)
      })
      return () => {
        cancelled = true
      }
    }
  }, [
    initConversationListener,
    global,
    loadProjects,
    loadGlobalConversations,
    createGlobalConversation,
    selectConversation
  ])

  useEffect(() => {
    const conversationId = searchParams.get('conversationId')
    if (projectId && conversationId) {
      void selectConversationById(projectId, conversationId)
    }
  }, [projectId, searchParams, selectConversationById])

  const currentModel = settings?.aiModel ?? 'gpt-4o-mini'

  // Local mode lists installed Ollama models. Cloud / hybrid lists the selected
  // cloud provider catalog so the picker matches the gateway route.
  const aiMode = config?.mode ?? 'openai'
  const isLocalMode = aiMode === 'ollama'
  const cloudProvider = normalizeCloudProvider(config?.cloudProvider)
  const ollamaModels = getProvider('ollama')?.models ?? []
  const liveCloudModels = getProvider(cloudProvider)?.models ?? []
  const cloudCatalog = catalogForCloudProvider(cloudProvider)

  const cloudModelOptions = useMemo(
    () =>
      liveCloudModels.length > 0
        ? liveCloudModels.map((m) => ({ value: m.id, label: m.label }))
        : cloudCatalog.map((m) => ({ value: m.value, label: m.label })),
    [liveCloudModels, cloudCatalog]
  )

  const localModel = config?.ollama.model ?? ''
  const cloudModel = config ? resolveProviderModel(config, cloudProvider) : currentModel

  const modelSelectorLabel = isLocalMode
    ? localModel || 'Select local model'
    : getModelLabel(cloudModel) || cloudModel

  useEffect(() => {
    if (!config) void loadStatus()
  }, [config, loadStatus])

  useEffect(() => {
    autoSelectedRef.current = false
  }, [projectId])

  useEffect(() => {
    setGeneratedArtifacts([])
  }, [currentConversation?.id])

  useEffect(() => {
    if (global || isLoading || autoSelectedRef.current || currentConversation) return
    if (conversations.length > 0) {
      autoSelectedRef.current = true
      void selectConversation(conversations[0])
    }
  }, [global, isLoading, conversations, currentConversation, selectConversation])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingContent])

  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = '0px'
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`
  }, [input])

  const focusComposer = () => {
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  const handleNewChat = async () => {
    if (global) {
      const conv = await createGlobalConversation()
      if (conv) await selectConversation(conv)
      focusComposer()
      return
    }
    if (!projectId) return
    const conv = await createConversation(projectId)
    if (conv) await selectConversation(conv)
    focusComposer()
  }

  const handleSend = async (text?: string) => {
    const content = (text ?? input).trim()
    if (!content || isStreaming) return

    const store = useChatStore.getState()
    if (!store.currentConversation) {
      const conv = await store.ensureConversation(projectId)
      if (!conv) {
        toast.error('Could not start a chat')
        return
      }
    }

    setInput('')
    await useChatStore.getState().sendMessage(content)
  }

  const voice = useChatVoice((text) => handleSend(text))

  const handleSuggestedPrompt = async (prompt: string) => {
    const store = useChatStore.getState()
    if (!store.currentConversation) {
      const conv = await store.ensureConversation(projectId)
      if (!conv) {
        toast.error('Could not start a chat')
        return
      }
    }
    await useChatStore.getState().sendMessage(prompt)
    focusComposer()
  }

  const copyMessage = (id: string, content: string) => {
    navigator.clipboard.writeText(content)
    setCopiedId(id)
    toast.success('Copied to clipboard')
    setTimeout(() => setCopiedId(null), 2000)
  }

  const exportChat = () => {
    const text = messages
      .map((m) => `**${m.role === 'user' ? 'You' : 'Assistant'}:**\n${m.content}`)
      .join('\n\n---\n\n')
    navigator.clipboard.writeText(text)
    toast.success('Chat exported to clipboard')
  }

  const openRename = (id: string, title: string) => {
    setRenameTarget({ id, title })
    setRenameValue(title)
  }

  const submitRename = async () => {
    if (!renameTarget || !renameValue.trim()) return
    await updateConversation(renameTarget.id, { title: renameValue.trim() })
    toast.success('Chat renamed')
    setRenameTarget(null)
    setRenameValue('')
  }

  const handleConfirm = async () => {
    if (!confirmAction) return

    if (confirmAction.type === 'delete-conversation') {
      await deleteConversation(confirmAction.id)
      toast.success('Conversation deleted')
    } else if (confirmAction.type === 'delete-message') {
      await deleteMessage(confirmAction.id)
      toast.success('Message deleted')
    } else if (confirmAction.type === 'clear-conversation') {
      await clearConversation()
      toast.success('Chat cleared')
    }

    setConfirmAction(null)
  }

  const startEditMessage = (id: string, content: string) => {
    setEditingMessageId(id)
    setEditDraft(content)
  }

  const submitEdit = async () => {
    if (!editingMessageId || !editDraft.trim()) return
    const id = editingMessageId
    setEditingMessageId(null)
    setEditDraft('')
    await editAndResend(id, editDraft)
  }

  const handleArtifactCreated = (artifact: GeneratedArtifact, messageId?: string) => {
    setGeneratedArtifacts((current) => [...current, { ...artifact, messageId }])
  }

  if (!apiKeyStatus?.isSet) {
    return <EmptyStateIllustrated variant="chat" onAction={() => navigate('/settings?tab=ai')} />
  }

  return (
    <div className="relative flex h-full min-h-0 overflow-hidden bg-background">
      {/* Main chat */}
      <div className="relative z-[1] flex min-w-0 flex-1 flex-col">
        {global && (
          <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border bg-muted/20 px-3 text-xs">
            <span className="shrink-0 text-muted-foreground">Context</span>
            <select
              value={linkedProjectId ?? ''}
              onChange={(e) => setLinkedProjectId(e.target.value || null)}
              className="h-7 max-w-[220px] rounded-md border border-border bg-background px-2 text-xs text-foreground"
            >
              <option value="">None — general AI</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <header className="flex min-h-16 shrink-0 items-center justify-between gap-4 border-b border-border/50 bg-background/55 px-4 backdrop-blur-xl sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2">
                <h1 className="truncate text-sm font-semibold tracking-tight">
                  {currentConversation?.title ?? (global ? 'AI workspace' : 'Project AI')}
                </h1>
                {currentConversation?.isPinned && (
                  <Pin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                )}
              </div>
              <p className="hidden truncate text-xs text-muted-foreground sm:block">
                {global
                  ? 'Ask, plan, and move work forward.'
                  : currentProject?.name || 'Project workspace'}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <div className="hidden items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300 sm:flex">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Ready
            </div>
            {!global && projectId && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1 rounded-lg px-2 text-xs text-muted-foreground"
                  >
                    Workspace
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuItem onClick={() => navigate(`/project/${projectId}/knowledge`)}>
                    <BookOpen className="h-3.5 w-3.5" />
                    Knowledge
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate(`/project/${projectId}/documents`)}>
                    <FileText className="h-3.5 w-3.5" />
                    Documents
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate(`/project/${projectId}/flows`)}>
                    <GitBranch className="h-3.5 w-3.5" />
                    Flows
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1 rounded-lg px-2 text-sm font-medium"
                >
                  {isLocalMode ? (
                    <Cpu className="h-3.5 w-3.5 text-emerald-500" />
                  ) : (
                    <Cloud className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                  <span className="max-w-[140px] truncate">{modelSelectorLabel}</span>
                  <ChevronDown className="h-3.5 w-3.5 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {isLocalMode ? (
                  <>
                    <DropdownMenuLabel>Local model (Ollama)</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {ollamaModels.length === 0 ? (
                      <DropdownMenuItem disabled>No local models installed</DropdownMenuItem>
                    ) : (
                      <DropdownMenuRadioGroup
                        value={localModel}
                        onValueChange={(v) => void setConfig({ ollama: { model: v } })}
                      >
                        {ollamaModels.map((m) => (
                          <DropdownMenuRadioItem key={m.id} value={m.id}>
                            {m.label}
                          </DropdownMenuRadioItem>
                        ))}
                      </DropdownMenuRadioGroup>
                    )}
                  </>
                ) : (
                  <>
                    <DropdownMenuLabel>
                      {aiMode === 'hybrid'
                        ? `${CLOUD_MODEL_LABEL[cloudProvider]} (Hybrid)`
                        : CLOUD_MODEL_LABEL[cloudProvider]}
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuRadioGroup
                      value={cloudModel}
                      onValueChange={(v) => {
                        if (cloudProvider === 'openai') void updateSettings({ aiModel: v })
                        void setConfig(cloudModelConfigPatch(cloudProvider, v))
                      }}
                    >
                      {cloudModelOptions.map((m) => (
                        <DropdownMenuRadioItem key={m.value} value={m.value}>
                          {m.label}
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-lg text-muted-foreground"
                  disabled={!currentConversation}
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                  <span className="sr-only">Chat options</span>
                </Button>
              </DropdownMenuTrigger>
              {currentConversation && (
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem
                    onClick={() => openRename(currentConversation.id, currentConversation.title)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Rename
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() =>
                      updateConversation(currentConversation.id, {
                        isPinned: !currentConversation.isPinned
                      })
                    }
                  >
                    {currentConversation.isPinned ? (
                      <PinOff className="h-3.5 w-3.5" />
                    ) : (
                      <Pin className="h-3.5 w-3.5" />
                    )}
                    {currentConversation.isPinned ? 'Unpin' : 'Pin'}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={async () => {
                      const dup = await duplicateConversation(currentConversation.id)
                      if (dup) {
                        await selectConversation(dup)
                        toast.success('Chat duplicated')
                      }
                    }}
                  >
                    <Files className="h-3.5 w-3.5" />
                    Duplicate
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={exportChat}>
                    <Download className="h-3.5 w-3.5" />
                    Export
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => setConfirmAction({ type: 'clear-conversation' })}
                  >
                    <Eraser className="h-3.5 w-3.5" />
                    Clear
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() =>
                      setConfirmAction({
                        type: 'delete-conversation',
                        id: currentConversation.id,
                        title: currentConversation.title
                      })
                    }
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              )}
            </DropdownMenu>
          </div>
        </header>

        {/* Messages */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex h-full items-center justify-center">
              <Spinner size="lg" />
            </div>
          ) : messages.length === 0 && !isStreaming ? (
            <div className="flex h-full flex-col items-center justify-center px-6 pb-10 pt-6">
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: 'easeOut' }}
                className="flex w-full max-w-2xl flex-col items-center"
              >
                <div className="mb-3 flex items-center gap-2 text-[12px] font-medium text-muted-foreground">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  {global ? 'AI workspace' : (currentProject?.name ?? 'Project workspace')}
                </div>

                <h2 className="font-display flex items-center justify-center gap-3 text-center text-[2rem] leading-tight text-foreground sm:text-[2.35rem]">
                  <Sparkles className="h-7 w-7 shrink-0 text-primary" strokeWidth={1.8} />
                  How can I help you build?
                </h2>
                <p className="mt-2 max-w-md text-center text-sm text-muted-foreground">
                  {global
                    ? 'Ask anything, or link a project for grounded context.'
                    : 'Ask about this project. Knowledge, documents, and flows are already in context.'}
                </p>

                <div className="mt-8 grid w-full gap-2.5 sm:grid-cols-2">
                  {suggestedPrompts.slice(0, 4).map((prompt, i) => (
                    <motion.button
                      key={prompt}
                      type="button"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, ease: 'easeOut', delay: 0.12 + i * 0.05 }}
                      onClick={() => void handleSuggestedPrompt(prompt)}
                      className="group flex min-h-[64px] items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left text-sm text-muted-foreground transition-colors hover:border-foreground/20 hover:text-foreground"
                    >
                      <span>{prompt}</span>
                      <ArrowUpRight className="h-4 w-4 shrink-0 opacity-40 transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary group-hover:opacity-100" />
                    </motion.button>
                  ))}
                </div>
              </motion.div>
            </div>
          ) : (
            <div className="mx-auto w-full max-w-3xl pb-4">
              {messages.map((msg) => (
                <div key={msg.id} className="chat-message-row group">
                  {msg.role === 'user' ? (
                    <div className="flex justify-end">
                      <div className="flex max-w-[85%] flex-col items-end">
                        <div className="chat-bubble-user">
                          {editingMessageId === msg.id ? (
                            <div className="space-y-2">
                              <textarea
                                value={editDraft}
                                onChange={(e) => setEditDraft(e.target.value)}
                                rows={3}
                                className="w-full resize-none rounded-xl border border-border bg-background p-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                                autoFocus
                              />
                              <div className="flex justify-end gap-2">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => {
                                    setEditingMessageId(null)
                                    setEditDraft('')
                                  }}
                                >
                                  Cancel
                                </Button>
                                <Button
                                  size="sm"
                                  onClick={submitEdit}
                                  disabled={!editDraft.trim() || isStreaming}
                                >
                                  Save &amp; resend
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <p className="whitespace-pre-wrap">{msg.content}</p>
                          )}
                        </div>
                        {editingMessageId !== msg.id && (
                          <div className="mt-1 flex opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
                            <div className="chat-action-bar">
                              <ActionBtn
                                title="Copy"
                                onClick={() => copyMessage(msg.id, msg.content)}
                                icon={
                                  copiedId === msg.id ? (
                                    <Check className="h-3.5 w-3.5 text-emerald-500" />
                                  ) : (
                                    <Copy className="h-3.5 w-3.5" />
                                  )
                                }
                              />
                              {!isStreaming && (
                                <ActionBtn
                                  title="Edit"
                                  onClick={() => startEditMessage(msg.id, msg.content)}
                                  icon={<Pencil className="h-3.5 w-3.5" />}
                                />
                              )}
                              {!isStreaming && (
                                <ActionBtn
                                  title="Delete"
                                  onClick={() =>
                                    setConfirmAction({ type: 'delete-message', id: msg.id })
                                  }
                                  icon={<Trash2 className="h-3.5 w-3.5" />}
                                />
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-3">
                      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-foreground text-background">
                        <AppLogo className="h-4 w-4 rounded-full" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="chat-bubble-assistant">
                          <div className="markdown-body prose-sm dark:prose-invert max-w-none">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                          </div>
                        </div>
                        {editingMessageId !== msg.id && (
                          <div className="mt-1.5 flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
                            <div className="chat-action-bar">
                              <ActionBtn
                                title="Copy"
                                onClick={() => copyMessage(msg.id, msg.content)}
                                icon={
                                  copiedId === msg.id ? (
                                    <Check className="h-3.5 w-3.5 text-emerald-500" />
                                  ) : (
                                    <Copy className="h-3.5 w-3.5" />
                                  )
                                }
                              />
                              <ActionBtn
                                title={voice.speakingId === msg.id ? 'Stop reading' : 'Read aloud'}
                                onClick={() => void voice.readAloud(msg.id, msg.content)}
                                icon={
                                  voice.speakingId === msg.id ? (
                                    <Square className="h-3 w-3 fill-current" />
                                  ) : (
                                    <Volume2 className="h-3.5 w-3.5" />
                                  )
                                }
                              />
                              {msg.id === lastAssistantId && !isStreaming && (
                                <ActionBtn
                                  title="Regenerate"
                                  onClick={() => regenerateResponse()}
                                  icon={<RotateCcw className="h-3.5 w-3.5" />}
                                />
                              )}
                              {!isStreaming && (
                                <ActionBtn
                                  title="Delete"
                                  onClick={() =>
                                    setConfirmAction({ type: 'delete-message', id: msg.id })
                                  }
                                  icon={<Trash2 className="h-3.5 w-3.5" />}
                                />
                              )}
                            </div>
                            <ChatAssistantActions
                              content={msg.content}
                              projectId={projectId ?? linkedProjectId ?? undefined}
                              disabled={isStreaming}
                              onCreated={(artifact) => handleArtifactCreated(artifact, msg.id)}
                            />
                          </div>
                        )}
                        {generatedArtifacts
                          .filter((artifact) => artifact.messageId === msg.id)
                          .map((artifact) => (
                            <ChatGeneratedArtifactCard
                              key={artifact.id}
                              artifact={artifact}
                            />
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {isStreaming && (
                <div className="chat-message-row">
                  <div className="flex gap-3">
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-foreground text-background">
                      <AppLogo className="h-4 w-4 rounded-full" />
                    </div>
                    <div className="min-w-0 flex-1 pt-1">
                      {streamingContent ? (
                        <div className="markdown-body prose-sm dark:prose-invert max-w-none">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {streamingContent}
                          </ReactMarkdown>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 py-2">
                          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-foreground/50" />
                          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-foreground/50 [animation-delay:150ms]" />
                          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-foreground/50 [animation-delay:300ms]" />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
              {generatedArtifacts
                .filter((artifact) => !artifact.messageId)
                .map((artifact) => (
                  <ChatGeneratedArtifactCard key={artifact.id} artifact={artifact} />
                ))}
              <div ref={messagesEndRef} className="h-2" />
            </div>
          )}
        </div>

        <div className="shrink-0 bg-gradient-to-t from-background via-background to-transparent px-4 pb-4 pt-2">
          <div className="mx-auto max-w-3xl">
            {lastContextPack && lastContextPack.chunkCount > 0 && (
              <p
                className="mb-1.5 truncate px-1 text-[11px] text-muted-foreground"
                title={lastContextPack.files.join('\n')}
              >
                Context ·{' '}
                {lastContextPack.files.slice(0, 3).join(', ') ||
                  `${lastContextPack.chunkCount} sources`}
                {lastContextPack.files.length > 3 ? ` +${lastContextPack.files.length - 3}` : ''}
                {' · '}~{formatTokens(lastContextPack.promptTokens)} tokens
                {' · '}
                est. {formatCost(lastContextPack.estimatedCostUsd)}
                {lastContextPack.trimmed ? ' · trimmed' : ''}
              </p>
            )}
            {contextAttachments.length > 0 && (projectId || (global && linkedProjectId)) && (
              <div className="mb-2 flex flex-wrap gap-1 px-1">
                <ChatContextBar
                  compact
                  chipsOnly
                  projectId={(projectId ?? linkedProjectId)!}
                  attachments={contextAttachments}
                  onAdd={addContextAttachment}
                  onRemove={removeContextAttachment}
                  onClear={clearContextAttachments}
                  disabled={isStreaming}
                />
              </div>
            )}
            {(voice.phase !== 'off' || voice.dictating === 'recording') && (
              <VoiceStrip
                phase={voice.phase === 'off' ? 'dictating' : voice.phase}
                level={voice.level}
                onStop={() =>
                  voice.phase !== 'off'
                    ? voice.stopConversation()
                    : void voice.toggleDictation((text) =>
                        setInput((current) => (current.trim() ? `${current.trimEnd()} ${text}` : text))
                      )
                }
              />
            )}
            <div className="floating-composer px-2 py-2">
              <div className="flex items-end gap-1">
                {(projectId || (global && linkedProjectId)) && (
                  <ChatContextBar
                    compact
                    attachOnly
                    projectId={(projectId ?? linkedProjectId)!}
                    attachments={contextAttachments}
                    onAdd={addContextAttachment}
                    onRemove={removeContextAttachment}
                    onClear={clearContextAttachments}
                    disabled={isStreaming}
                  />
                )}
                <textarea
                  ref={inputRef}
                  placeholder={global ? 'Ask anything' : 'Ask anything about this project'}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      void handleSend()
                    }
                  }}
                  rows={1}
                  disabled={isStreaming}
                  className="max-h-40 min-h-[40px] flex-1 resize-none bg-transparent px-2 py-2 text-[15px] leading-6 outline-none placeholder:text-muted-foreground"
                />
                <ChatAssistantActions
                  compact
                  content={input.trim() || lastAssistantContent}
                  projectId={projectId ?? linkedProjectId ?? undefined}
                  disabled={isStreaming}
                  onCreated={(artifact) => handleArtifactCreated(artifact)}
                />
                <Button
                  size="icon"
                  variant="ghost"
                  className={cn(
                    'mb-0.5 h-9 w-9 shrink-0 rounded-full text-muted-foreground hover:text-foreground',
                    voice.dictating === 'recording' &&
                      'bg-voice-active/15 text-voice-active hover:bg-voice-active/20 hover:text-voice-active'
                  )}
                  disabled={isStreaming || voice.dictating === 'transcribing' || voice.phase !== 'off'}
                  onClick={() =>
                    void voice.toggleDictation((text) => {
                      setInput((current) => (current.trim() ? `${current.trimEnd()} ${text}` : text))
                      inputRef.current?.focus()
                    })
                  }
                  title={
                    voice.dictating === 'recording'
                      ? 'Stop and insert text'
                      : voice.dictating === 'transcribing'
                        ? 'Transcribing…'
                        : 'Dictate'
                  }
                  aria-label="Dictate"
                  aria-pressed={voice.dictating === 'recording'}
                >
                  {voice.dictating === 'transcribing' ? (
                    <Spinner className="h-4 w-4" />
                  ) : (
                    <Mic className="h-4 w-4" />
                  )}
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className={cn(
                    'mb-0.5 h-9 w-9 shrink-0 rounded-full text-muted-foreground hover:text-foreground',
                    voice.phase !== 'off' && 'bg-primary/12 text-primary hover:bg-primary/15 hover:text-primary'
                  )}
                  disabled={voice.dictating !== 'off'}
                  onClick={() =>
                    voice.phase === 'off' ? void voice.startConversation() : voice.stopConversation()
                  }
                  title={voice.phase === 'off' ? 'Start voice conversation' : 'End voice conversation'}
                  aria-label="Voice conversation"
                  aria-pressed={voice.phase !== 'off'}
                >
                  <AudioLines className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="mb-0.5 h-9 w-9 shrink-0 rounded-full"
                  title="Send to Agent"
                  disabled={!input.trim()}
                  onClick={() => {
                    const text = input.trim()
                    if (!text) return
                    useAgentStore.getState().setMode('agent')
                    useAgentStore.getState().setGoal(text)
                    useWorkbenchLayoutStore.getState().openAgent()
                    navigate('/code-editor')
                  }}
                >
                  <Bot className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant={isStreaming ? 'destructive' : 'default'}
                  className={cn(
                    'mb-0.5 h-9 w-9 shrink-0 rounded-full',
                    !isStreaming && !input.trim() && 'bg-muted text-muted-foreground hover:bg-muted'
                  )}
                  onClick={() => (isStreaming ? stopStreaming() : void handleSend())}
                  disabled={!isStreaming && !input.trim()}
                  title={isStreaming ? 'Stop generating' : 'Send'}
                >
                  {isStreaming ? (
                    <Square className="h-3.5 w-3.5 fill-current" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
            <p className="mt-2 text-center text-[11px] text-muted-foreground">
              Enter to send · Shift+Enter for a new line · Mic to dictate ·{' '}
              <AudioLines className="inline h-3 w-3 align-[-2px]" /> to talk
            </p>
          </div>
        </div>
      </div>

      {/* Chat history */}
      {historySidebarOpen ? (
        <aside className="relative z-[1] flex w-[280px] min-w-[240px] max-w-[32vw] shrink-0 flex-col border-l border-border/60 bg-background/55 backdrop-blur-xl">
          <div className="space-y-3 border-b border-border/50 px-3 pb-3 pt-3">
            <div className="flex items-center justify-between gap-2 px-1">
              <div className="flex min-w-0 items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
                  <MessageSquare className="h-3.5 w-3.5" />
                </div>
                <div>
                  <p className="text-sm font-semibold leading-none">Chat history</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {conversations.length} conversation{conversations.length === 1 ? '' : 's'}
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-lg text-muted-foreground"
                onClick={() => setHistorySidebarOpen(false)}
                title="Hide chat history"
                aria-label="Hide chat history"
              >
                <PanelRightClose className="h-4 w-4" />
              </Button>
            </div>
            <Button
              className="h-9 w-full justify-start gap-2 rounded-xl text-sm font-medium shadow-sm"
              onClick={() => void handleNewChat()}
            >
              <Plus className="h-4 w-4 shrink-0" /> New chat
            </Button>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search chat history"
                className="h-9 rounded-xl border-border/60 bg-background/80 pl-9 pr-2 text-sm shadow-none"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value)
                  if (projectId) searchConversations(projectId, e.target.value)
                }}
              />
            </div>
          </div>
          <ScrollArea className="min-h-0 flex-1">
            <div className="space-y-5 px-2.5 py-3">
              {pinnedConversations.length > 0 && (
                <ConversationGroup
                  label="Pinned"
                  conversations={pinnedConversations}
                  currentId={currentConversation?.id}
                  onSelect={selectConversation}
                  onRename={openRename}
                  onDelete={(id, title) =>
                    setConfirmAction({ type: 'delete-conversation', id, title })
                  }
                  onPin={updateConversation}
                  onDuplicate={async (id) => {
                    const dup = await duplicateConversation(id)
                    if (dup) {
                      await selectConversation(dup)
                      toast.success('Chat duplicated')
                    }
                  }}
                />
              )}
              <ConversationGroup
                label={pinnedConversations.length > 0 ? 'Recent' : 'Recent chats'}
                conversations={recentConversations}
                currentId={currentConversation?.id}
                onSelect={selectConversation}
                onRename={openRename}
                onDelete={(id, title) =>
                  setConfirmAction({ type: 'delete-conversation', id, title })
                }
                onPin={updateConversation}
                onDuplicate={async (id) => {
                  const dup = await duplicateConversation(id)
                  if (dup) {
                    await selectConversation(dup)
                    toast.success('Chat duplicated')
                  }
                }}
                emptyText={searchQuery ? 'No matching chats' : 'Start a new chat to begin'}
              />
            </div>
          </ScrollArea>
        </aside>
      ) : (
        <aside className="relative z-[1] flex w-12 shrink-0 flex-col items-center gap-2 border-l border-border/60 bg-background/55 py-3 backdrop-blur-xl">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-xl text-muted-foreground"
            onClick={() => setHistorySidebarOpen(true)}
            title="Show chat history"
            aria-label="Show chat history"
          >
            <PanelRightOpen className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9 rounded-xl bg-background"
            onClick={() => void handleNewChat()}
            title="New chat"
            aria-label="New chat"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </aside>
      )}

      {/* Rename dialog */}
      <Dialog open={!!renameTarget} onOpenChange={(open) => !open && setRenameTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename chat</DialogTitle>
            <DialogDescription>Give this conversation a descriptive name.</DialogDescription>
          </DialogHeader>
          <Input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            placeholder="Chat title"
            className="mt-2"
            autoFocus
            onKeyDown={(e) => e.key === 'Enter' && submitRename()}
          />
          <DialogFooter className="mt-4">
            <Button variant="ghost" onClick={() => setRenameTarget(null)}>
              Cancel
            </Button>
            <Button onClick={submitRename} disabled={!renameValue.trim()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm dialog */}
      <Dialog open={!!confirmAction} onOpenChange={(open) => !open && setConfirmAction(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {confirmAction?.type === 'clear-conversation' && 'Clear this chat?'}
              {confirmAction?.type === 'delete-conversation' && 'Delete conversation?'}
              {confirmAction?.type === 'delete-message' && 'Delete message?'}
            </DialogTitle>
            <DialogDescription>
              {confirmAction?.type === 'clear-conversation' &&
                'All messages will be removed. The chat itself will stay.'}
              {confirmAction?.type === 'delete-conversation' &&
                `"${confirmAction.title}" and all its messages will be permanently deleted.`}
              {confirmAction?.type === 'delete-message' &&
                'This message will be permanently removed.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmAction(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleConfirm}>
              {confirmAction?.type === 'clear-conversation' ? 'Clear' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  )
}

function ConversationGroup({
  label,
  conversations,
  currentId,
  emptyText,
  onSelect,
  onRename,
  onDelete,
  onPin,
  onDuplicate
}: {
  label: string
  conversations: Conversation[]
  currentId?: string
  emptyText?: string
  onSelect: (c: Conversation) => void
  onRename: (id: string, title: string) => void
  onDelete: (id: string, title: string) => void
  onPin: (id: string, data: Partial<Pick<Conversation, 'isPinned'>>) => void
  onDuplicate: (id: string) => void
}) {
  if (conversations.length === 0 && emptyText) {
    return (
      <div>
        <p className="px-2.5 pb-1 text-[11px] font-medium text-muted-foreground">{label}</p>
        <p className="px-1.5 py-3 text-center text-[11px] text-muted-foreground">{emptyText}</p>
      </div>
    )
  }

  if (conversations.length === 0) return null

  return (
    <div>
      <p className="px-2.5 pb-1 text-[11px] font-medium text-muted-foreground">{label}</p>
      <div className="space-y-0.5">
        {conversations.map((conv) => (
          <ConversationItem
            key={conv.id}
            conv={conv}
            isActive={currentId === conv.id}
            onSelect={() => onSelect(conv)}
            onRename={() => onRename(conv.id, conv.title)}
            onDelete={() => onDelete(conv.id, conv.title)}
            onPin={() => onPin(conv.id, { isPinned: !conv.isPinned })}
            onDuplicate={() => onDuplicate(conv.id)}
          />
        ))}
      </div>
    </div>
  )
}

function ConversationItem({
  conv,
  isActive,
  onSelect,
  onRename,
  onDelete,
  onPin,
  onDuplicate
}: {
  conv: Conversation
  isActive: boolean
  onSelect: () => void
  onRename: () => void
  onDelete: () => void
  onPin: () => void
  onDuplicate: () => void
}) {
  return (
    <div
      className={cn(
        'group relative grid grid-cols-[minmax(0,1fr)_1.75rem] items-center overflow-hidden rounded-xl border border-transparent transition-all',
        isActive
          ? 'border-primary/15 bg-background shadow-sm'
          : 'hover:border-border/60 hover:bg-background/70'
      )}
    >
      {isActive && <span className="absolute inset-y-2 left-0 w-0.5 rounded-r-full bg-primary" />}
      <button
        type="button"
        onClick={onSelect}
        className="flex min-w-0 items-center gap-2 px-2.5 py-2 text-left"
        title={`${conv.title} · ${formatRelativeTime(conv.updatedAt)}`}
      >
        <span
          className={cn(
            'min-w-0 flex-1 truncate text-sm leading-snug',
            isActive ? 'font-medium text-foreground' : 'text-foreground/80'
          )}
        >
          {conv.title}
        </span>
        {conv.isPinned && <Pin className="h-3 w-3 shrink-0 text-muted-foreground" />}
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0 rounded-lg text-muted-foreground hover:text-foreground"
            onClick={(e) => e.stopPropagation()}
            title="Chat actions"
            aria-label={`Actions for ${conv.title}`}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" side="right" className="w-40">
          <DropdownMenuItem onClick={onRename}>
            <Pencil className="h-3.5 w-3.5" />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onPin}>
            {conv.isPinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
            {conv.isPinned ? 'Unpin' : 'Pin'}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onDuplicate}>
            <Files className="h-3.5 w-3.5" />
            Duplicate
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={onDelete}>
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

function ActionBtn({
  title,
  onClick,
  icon
}: {
  title: string
  onClick: () => void
  icon: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={title}
      className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      onClick={onClick}
    >
      {icon}
    </button>
  )
}

function ChatGeneratedArtifactCard({ artifact }: { artifact: ChatArtifact }) {
  const navigate = useNavigate()
  const Icon =
    artifact.kind === 'document'
      ? FileText
      : artifact.kind === 'presentation'
        ? Presentation
        : artifact.kind === 'flow'
          ? GitBranch
          : BookOpen

  return (
    <div className="mt-3 max-w-xl overflow-hidden rounded-2xl border border-border/70 bg-card/80 shadow-sm">
      <div className="flex items-start gap-3 p-3.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-semibold">{artifact.title}</p>
            <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              {artifact.kind === 'document'
                ? 'Document'
                : artifact.kind === 'presentation'
                  ? 'Presentation'
                  : artifact.kind === 'flow'
                    ? 'Flow diagram'
                    : 'Project data'}
            </span>
          </div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{artifact.description}</p>
          {artifact.href && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3 h-8 gap-1.5 rounded-lg text-xs"
              onClick={() => navigate(artifact.href!)}
            >
              Open {artifact.kind === 'knowledge' ? 'knowledge' : 'in workspace'}
              <ExternalLink className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

const VOICE_PHASE_LABEL = {
  dictating: 'Listening — click the mic again to insert',
  listening: 'Listening…',
  transcribing: 'Transcribing…',
  waiting: 'Thinking…',
  speaking: 'Speaking… it’ll listen again when done'
} as const

function VoiceStrip({
  phase,
  level,
  onStop
}: {
  phase: keyof typeof VOICE_PHASE_LABEL
  level: number
  onStop: () => void
}) {
  const live = phase === 'listening' || phase === 'dictating'
  return (
    <div className="mb-2 flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2 text-[12.5px]">
      <span className="flex h-4 items-end gap-[3px]" aria-hidden>
        {[0.55, 1, 0.75, 0.9, 0.6].map((weight, i) => (
          <span
            key={i}
            className={cn(
              'w-[3px] rounded-full transition-[height] duration-100',
              live ? 'bg-voice-active' : 'bg-primary/70',
              !live && 'animate-pulse'
            )}
            style={{ height: `${Math.max(3, Math.min(16, (live ? level * 40 : 6) * weight + 3))}px` }}
          />
        ))}
      </span>
      <span className="flex-1 text-muted-foreground" aria-live="polite">
        {VOICE_PHASE_LABEL[phase]}
      </span>
      <button
        type="button"
        onClick={onStop}
        className="rounded-md px-2 py-0.5 text-[12px] font-medium text-foreground hover:bg-accent"
      >
        {phase === 'dictating' ? 'Done' : 'End'}
      </button>
    </div>
  )
}
