import { useEffect, useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { motion, useReducedMotion } from 'framer-motion'
import {
  ArrowUp,
  AtSign,
  Bot,
  CheckCircle2,
  ChevronDown,
  Circle,
  Cloud,
  Cpu,
  FileCode2,
  Folder,
  Loader2,
  MessageSquare,
  MinusCircle,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Square,
  Trash2,
  X
} from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
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
import { cn } from '@/shared/lib/utils'
import type { AgentMode } from '@shared/types/agent'
import type { FileSearchHit } from '@shared/types/code-editor'
import type { CloudProviderId } from '@shared/types'
import { catalogForCloudProvider, getModelLabel } from '@shared/lib/ai-models'
import {
  cloudModelConfigPatch,
  normalizeCloudProvider,
  resolveProviderModel
} from '@shared/lib/ai-routing'
import { useAIStore } from '@/features/ai/stores/ai.store'
import { useSettingsStore } from '@/shared/stores/settings.store'
import { useAgentStore } from '../stores/agent.store'
import { useCodeEditorStore } from '../stores/codeEditor.store'
import { useWorkbenchLayoutStore } from '../stores/workbench.store'
import { AgentPatchCard, AgentToolCard } from './AgentToolCard'
import { CodeDiffView } from './CodeDiffView'
import { MentionMenu } from './MentionMenu'
import { ConfirmDialog } from './ConfirmDialog'
import { refsFromDropEvent } from '../lib/agent-drop'
import { mentionQueryAt } from '@shared/lib/editor-ai'
import { deriveExecutionPlan } from '@shared/lib/agent-activity'
import { toast } from 'sonner'
import { AgentResponseMessage } from './AgentResponseMessage'
import { AgentReviewCard } from './AgentReviewCard'
import { AgentContextCard } from './AgentContextCard'

const MODES: { id: AgentMode; label: string; hint: string }[] = [
  { id: 'agent', label: 'Agent', hint: 'Search, edit, test, git, MCP' },
  { id: 'ask', label: 'Ask', hint: 'Read-only answers' },
  { id: 'edit', label: 'Edit', hint: 'Apply patches' },
  { id: 'debug', label: 'Debug', hint: 'Tests and diagnostics' },
  { id: 'plan', label: 'Plan', hint: 'Read-only plan' },
  { id: 'review', label: 'Review', hint: 'Review git diffs' }
]

const CLOUD_MODEL_LABEL: Record<CloudProviderId, string> = {
  openai: 'OpenAI',
  anthropic: 'Claude',
  gemini: 'Gemini',
  deepseek: 'DeepSeek',
  openrouter: 'OpenRouter'
}

const STARTERS = [
  'Explain the current file',
  'Find where this is used',
  'Fix the type errors',
  'Write tests for the selection'
]

export function AgentPanel({ onClose }: { onClose?: () => void }) {
  const reduceMotion = useReducedMotion()
  const chats = useAgentStore((s) => s.chats)
  const activeChatId = useAgentStore((s) => s.activeChatId)
  const activeChat = chats.find((chat) => chat.id === activeChatId) ?? chats[0]
  const mode = activeChat?.mode ?? 'agent'
  const draft = activeChat?.draft ?? ''
  const run = activeChat?.run ?? null
  const pending = activeChat?.pending ?? null
  const thread = activeChat?.thread ?? []
  const currentTool = activeChat?.currentTool ?? null
  const setMode = useAgentStore((s) => s.setMode)
  const setDraft = useAgentStore((s) => s.setDraft)
  const newChat = useAgentStore((s) => s.newChat)
  const selectChat = useAgentStore((s) => s.selectChat)
  const closeChat = useAgentStore((s) => s.closeChat)
  const closeAllChats = useAgentStore((s) => s.closeAllChats)
  const start = useAgentStore((s) => s.start)
  const cancel = useAgentStore((s) => s.cancel)
  const pause = useAgentStore((s) => s.pause)
  const resume = useAgentStore((s) => s.resume)
  const confirm = useAgentStore((s) => s.confirm)
  const subscribe = useAgentStore((s) => s.subscribe)
  const attached = activeChat?.attached ?? []
  const attachFiles = useAgentStore((s) => s.attachFiles)
  const detachFile = useAgentStore((s) => s.detachFile)
  const restoreCheckpoint = useAgentStore((s) => s.restoreCheckpoint)

  const config = useAIStore((s) => s.config)
  const loadStatus = useAIStore((s) => s.loadStatus)
  const setConfig = useAIStore((s) => s.setConfig)
  const getProvider = useAIStore((s) => s.getProvider)
  const updateSettings = useSettingsStore((s) => s.updateSettings)

  const activeTab = useCodeEditorStore(
    useShallow((s) => {
      const tab = s.tabs.find((t) => t.path === s.activeTabPath)
      return tab ? { path: tab.path, name: tab.name } : null
    })
  )
  const openTabs = useCodeEditorStore(
    useShallow((s) => s.tabs.map((t) => ({ path: t.path, name: t.name })))
  )
  const hasSelection = useCodeEditorStore((s) => Boolean(s.selectedCode.trim()))
  const [dragOver, setDragOver] = useState(false)
  const [atQuery, setAtQuery] = useState('')
  const [atHits, setAtHits] = useState<FileSearchHit[]>([])
  const [draftCursor, setDraftCursor] = useState(0)
  const [mentionPaused, setMentionPaused] = useState(false)
  const [restoredRunId, setRestoredRunId] = useState<string | null>(null)
  const [closeAllConfirm, setCloseAllConfirm] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)

  const scrollerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const dragCount = useRef(0)
  const agentFocusNonce = useWorkbenchLayoutStore((s) => s.agentFocusNonce)

  const busy = run?.status === 'running' || run?.status === 'planning' || run?.status === 'waiting'
  const paused = run?.status === 'paused'
  const modeMeta = MODES.find((item) => item.id === mode) ?? MODES[0]
  const executionPlan = useMemo(
    () =>
      deriveExecutionPlan({
        mode,
        toolsUsed: activeChat?.toolsUsed ?? [],
        currentTool: currentTool ?? undefined,
        status: run?.status
      }),
    [mode, activeChat?.toolsUsed, currentTool, run?.status]
  )
  const recentChats = useMemo(
    () => [...chats].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [chats]
  )

  const aiMode = config?.mode ?? 'openai'
  const isLocalMode = aiMode === 'ollama'
  const cloudProvider = normalizeCloudProvider(config?.cloudProvider)
  const ollamaModels = getProvider('ollama')?.models ?? []
  const liveCloudModels = useMemo(
    () => getProvider(cloudProvider)?.models ?? [],
    [getProvider, cloudProvider]
  )
  const cloudCatalog = catalogForCloudProvider(cloudProvider)
  const cloudModelOptions = useMemo(
    () =>
      liveCloudModels.length > 0
        ? liveCloudModels.map((m) => ({ value: m.id, label: m.label }))
        : cloudCatalog.map((m) => ({ value: m.value, label: m.label })),
    [liveCloudModels, cloudCatalog]
  )
  const localModel = config?.ollama.model ?? ''
  const cloudModel = config ? resolveProviderModel(config, cloudProvider) : ''
  const modelLabel = isLocalMode ? localModel || 'Local model' : getModelLabel(cloudModel) || cloudModel || 'Model'

  useEffect(() => subscribe(), [subscribe])
  useEffect(() => {
    void loadStatus()
  }, [loadStatus])

  useEffect(() => {
    if (!agentFocusNonce) return
    const selection = useCodeEditorStore.getState().selectedCode.trim()
    const currentDraft = useAgentStore.getState().chats.find((c) => c.id === useAgentStore.getState().activeChatId)?.draft ?? ''
    if (selection && !/\b@selection\b/i.test(currentDraft) && !currentDraft.includes(selection.slice(0, 64))) {
      const next = currentDraft.trim() ? currentDraft : ''
      if (!next) setDraft('@selection ')
      else if (!next.includes('@selection')) setDraft(`${next.trim()}\n\n@selection `)
    }
    requestAnimationFrame(() => {
      const el = inputRef.current
      if (!el) return
      el.focus()
      const end = el.value.length
      el.setSelectionRange(end, end)
      setDraftCursor(end)
    })
  }, [agentFocusNonce, setDraft])

  useEffect(() => {
    scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight })
  }, [activeChatId, thread.length, pending, busy])

  useEffect(() => {
    setRestoredRunId(null)
  }, [activeChatId])

  useEffect(() => {
    const query = atQuery.trim()
    if (!query) {
      setAtHits([])
      return
    }
    const timer = window.setTimeout(() => {
      void window.electronAPI?.codeEditor?.searchFiles?.(query).then((result) => {
        if (result?.success) setAtHits(result.data ?? [])
      })
    }, 180)
    return () => window.clearTimeout(timer)
  }, [atQuery])

  const statusLabel = paused
    ? 'Paused'
    : run?.status === 'waiting'
      ? 'Waiting for approval'
      : run?.status === 'planning'
        ? 'Planning'
        : currentTool
          ? thread.filter((item) => item.kind === 'tool').at(-1)?.label ?? 'Working'
          : run?.status === 'running'
            ? 'Working'
            : run?.status === 'done'
              ? 'Done'
              : run?.status === 'error'
                ? 'Error'
                : null

  const mentionOpen = !mentionPaused && Boolean(mentionQueryAt(draft, draftCursor))

  const syncDraftCursor = (target: HTMLTextAreaElement) => {
    setDraftCursor(target.selectionStart ?? target.value.length)
    setMentionPaused(false)
  }

  const send = () => {
    if (mentionOpen) return
    if (!draft.trim() || busy || paused) return
    const selection = useCodeEditorStore.getState().selectedCode.trim()
    const scope =
      attached.length > 0
        ? `\n\nEdit these files/folders:\n${attached.map((file) => `- ${file.kind} ${file.path}`).join('\n')}`
        : ''
    const goal =
      selection && !draft.includes(selection)
        ? `${draft.trim()}\n\nSelection from ${activeTab?.name ?? 'editor'}:\n${selection}${scope}`
        : `${draft.trim()}${scope}`
    void start({ goal })
  }

  return (
    <div
      className={cn(
        'wb-agent-panel flex h-full min-h-0 flex-col border-l border-[var(--wb-border)] bg-[var(--wb-sidebar)]',
        dragOver && 'ring-2 ring-inset ring-primary/50'
      )}
      onDragEnter={(e) => {
        e.preventDefault()
        dragCount.current += 1
        setDragOver(true)
      }}
      onDragOver={(e) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
      }}
      onDragLeave={() => {
        dragCount.current -= 1
        if (dragCount.current <= 0) {
          dragCount.current = 0
          setDragOver(false)
        }
      }}
      onDrop={(e) => {
        e.preventDefault()
        dragCount.current = 0
        setDragOver(false)
        void refsFromDropEvent(e).then((refs) => {
          if (refs.length > 0) attachFiles(refs)
        })
      }}
    >
      <div className="flex h-8 shrink-0 items-center gap-1 border-b border-[var(--wb-border)] px-1.5">
        <DropdownMenu open={historyOpen} onOpenChange={setHistoryOpen}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex h-7 min-w-0 flex-1 items-center gap-2 rounded-[7px] px-1.5 text-left hover:bg-[var(--wb-hover)]"
              title="Open chat history"
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] bg-[var(--wb-accent-soft)]">
                <Bot className="h-3.5 w-3.5 text-[var(--wb-accent)]" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12px] font-semibold tracking-tight">
                  {activeChat?.title ?? 'New chat'}
                </span>
                {statusLabel ? (
                  <span className="block truncate text-[9px] leading-none text-[var(--wb-muted)]">
                    {statusLabel}
                  </span>
                ) : null}
              </span>
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[var(--wb-muted)]" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-72 p-1">
            <div className="flex items-center justify-between px-2 py-1.5">
              <DropdownMenuLabel className="p-0 text-[11px]">Chat history</DropdownMenuLabel>
              <span className="text-[10px] text-muted-foreground">{chats.length}</span>
            </div>
            <div className="max-h-72 space-y-0.5 overflow-y-auto">
              {recentChats.map((chat) => {
                const running = Boolean(
                  chat.run && ['planning', 'running', 'waiting', 'paused'].includes(chat.run.status)
                )
                return (
                  <div
                    key={chat.id}
                    className={cn(
                      'group flex items-center gap-1 rounded-md',
                      chat.id === activeChatId ? 'bg-accent' : 'hover:bg-accent/70'
                    )}
                  >
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left"
                      onClick={() => {
                        selectChat(chat.id)
                        setHistoryOpen(false)
                      }}
                    >
                      <MessageSquare className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[11px]">{chat.title}</span>
                        <span className="block truncate text-[10px] text-muted-foreground">
                          {running
                            ? chat.run?.status === 'waiting'
                              ? 'Waiting for approval'
                              : chat.run?.status === 'paused'
                                ? 'Paused'
                                : 'Running'
                            : `${chat.thread.filter((item) => item.kind === 'user' || item.kind === 'assistant').length} messages`}
                        </span>
                      </span>
                    </button>
                    {running ? <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" /> : null}
                    <button
                      type="button"
                      className="mr-1 rounded p-1 text-muted-foreground opacity-0 hover:bg-background hover:text-destructive focus:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100"
                      title={`Close ${chat.title}`}
                      onClick={(event) => {
                        event.stopPropagation()
                        void closeChat(chat.id)
                      }}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                )
              })}
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => newChat()}>
              <Plus className="h-3.5 w-3.5" /> New chat
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onSelect={() => setCloseAllConfirm(true)}
            >
              <Trash2 className="h-3.5 w-3.5" /> Close all chats
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button variant="ghost" size="icon" className="h-6 w-6" title="New chat" onClick={() => newChat()}>
          <Plus className="h-3.5 w-3.5" />
        </Button>
        {onClose ? (
          <Button variant="ghost" size="icon" className="h-6 w-6" title="Hide" onClick={onClose}>
            <X className="h-3.5 w-3.5" />
          </Button>
        ) : null}
      </div>

      <div ref={scrollerRef} className="min-h-0 flex-1 overflow-auto px-2 py-1.5">
        {run ? (
          <motion.div initial={reduceMotion ? false : { opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} className="mb-2 rounded-md border border-[var(--wb-border)] bg-[var(--wb-editor)] px-2 py-1.5">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--wb-muted)]">Execution plan</p>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] tabular-nums text-[var(--wb-muted)]">
                  {executionPlan.filter((step) => step.state === 'done').length}/{executionPlan.length}
                </span>
                {['done', 'error', 'cancelled'].includes(run.status) && restoredRunId !== run.runId ? (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded px-1 py-0.5 text-[10px] text-[var(--wb-muted)] hover:bg-[var(--wb-hover)] hover:text-[var(--wb-fg)]"
                    title="Restore all file changes made by this run"
                    onClick={async () => {
                      const count = await restoreCheckpoint(run.runId)
                      if (count > 0) {
                        setRestoredRunId(run.runId)
                        toast.success(`Restored ${count} file change${count === 1 ? '' : 's'}`)
                      } else {
                        toast.info('This run has no file changes to restore')
                      }
                    }}
                  >
                    <RotateCcw className="h-3 w-3" /> Restore
                  </button>
                ) : null}
              </div>
            </div>
            <ol className="space-y-1">
              {executionPlan.map((step) => (
                <li key={step.id} className="flex items-center gap-1.5 text-[11px]">
                  {step.state === 'done' ? (
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                  ) : step.state === 'active' ? (
                    <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
                  ) : step.state === 'skipped' ? (
                    <MinusCircle className="h-3.5 w-3.5 shrink-0 text-[var(--wb-muted)]" />
                  ) : (
                    <Circle className="h-3.5 w-3.5 shrink-0 text-[var(--wb-muted)]" />
                  )}
                  <span className={step.state === 'skipped' ? 'text-[var(--wb-muted)] line-through' : 'text-[var(--wb-fg)]'}>
                    {step.label}
                  </span>
                </li>
              ))}
            </ol>
          </motion.div>
        ) : null}
        {thread.length === 0 ? (
          <div className="flex h-full flex-col justify-center gap-4 px-1">
            <div>
              <p className="text-[12px] font-medium">What should we work on?</p>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                Drop files or folders here to analyze and edit them. Drag from the file tree or from Explorer.
                The agent can patch multiple files in one run.
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              {STARTERS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  className="rounded-md border border-[var(--wb-border)] px-2.5 py-1.5 text-left text-[11px] text-[var(--wb-muted)] hover:bg-[var(--wb-hover)] hover:text-[var(--wb-fg)]"
                  onClick={() => {
                    setDraft(prompt)
                    inputRef.current?.focus()
                  }}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {thread.map((item) => {
              if (item.kind === 'user') {
                return (
                  <div key={item.id} className="flex justify-end">
                    <div className="max-w-[92%] rounded-xl bg-muted px-2.5 py-1.5 text-[11px] leading-relaxed">
                      {item.text}
                    </div>
                  </div>
                )
              }
              if (item.kind === 'assistant') {
                return <AgentResponseMessage key={item.id} text={item.text} streaming={busy && item === thread.at(-1)} />
              }
              if (item.kind === 'context') {
                return <AgentContextCard key={item.id} item={item} />
              }
              if (item.kind === 'tool') {
                return <AgentToolCard key={item.id} item={item} />
              }
              if (item.kind === 'patch') {
                return <AgentPatchCard key={item.id} item={item} />
              }
              if (item.kind === 'review') {
                return <AgentReviewCard key={item.id} findings={item.findings} />
              }
              return null
            })}
            {busy && !currentTool && thread.at(-1)?.kind !== 'assistant' ? (
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {run?.status === 'planning' ? 'Planning…' : 'Thinking…'}
              </div>
            ) : null}
          </div>
        )}
      </div>

      {pending ? (
        <div className="wb-confirm-banner shrink-0">
          <p className="text-[11px] font-semibold tracking-tight text-[var(--wb-fg)]">
            {pending.description.toLowerCase().includes('staged')
              ? 'Apply staged changes?'
              : 'Allow this tool?'}
          </p>
          <p className="mt-1 text-[11px] leading-snug text-[var(--wb-muted)]">{pending.message}</p>
          <p className="mt-1.5 truncate text-[11px] font-medium text-[var(--wb-fg)]">
            {pending.toolName.replace(/_/g, ' ')}
          </p>
          {pending.path ? (
            <p className="truncate text-[11px] text-[var(--wb-muted)]">{pending.path}</p>
          ) : null}
          {pending.diff ? (
            <CodeDiffView
              diff={pending.diff}
              maxHeightClass="max-h-36"
              className="mt-2 rounded-[8px] border border-[var(--wb-border)] bg-[var(--wb-editor)]"
            />
          ) : pending.description.toLowerCase().includes('staged') ? null : (
            <pre className="mt-2 max-h-24 overflow-auto rounded-[8px] border border-[var(--wb-border)] bg-[var(--wb-editor)] p-2 font-mono text-[11px]">
              {JSON.stringify(pending.input, null, 2)}
            </pre>
          )}
          <div className="mt-2.5 flex justify-end gap-1.5">
            <Button size="sm" variant="outline" className="h-7" onClick={() => void confirm(false)}>
              Reject
            </Button>
            <Button size="sm" className="h-7" onClick={() => void confirm(true)}>
              {pending.description.toLowerCase().includes('staged') ? 'Apply & continue' : 'Accept'}
            </Button>
          </div>
        </div>
      ) : null}

      <div className="shrink-0 border-t border-[var(--wb-border)] p-2">
        <div className="mb-2 flex flex-wrap gap-1">
          {activeTab ? (
            <span className="wb-chip" data-tone="accent">
              <FileCode2 className="h-3 w-3" />
              <span className="truncate">{activeTab.name}</span>
            </span>
          ) : null}
          {hasSelection ? (
            <button
              type="button"
              className="wb-chip"
              data-tone="warn"
              title="Include selection in the next message"
              onClick={() => {
                if (/\b@selection\b/i.test(draft)) return
                const next = draft.trim() ? `${draft.trim()}\n\n@selection ` : '@selection '
                setDraft(next)
                setDraftCursor(next.length)
                inputRef.current?.focus()
              }}
            >
              Selection
            </button>
          ) : null}
          {attached.map((file) => (
            <button
              key={file.path}
              type="button"
              className="wb-chip"
              data-tone="accent"
              title={file.path}
              onClick={() => detachFile(file.path)}
            >
              {file.kind === 'folder' ? <Folder className="h-3 w-3" /> : <FileCode2 className="h-3 w-3" />}
              <span className="truncate">{file.name}</span>
              <X className="h-3 w-3" />
            </button>
          ))}
        </div>
        {dragOver ? (
          <p className="mb-2 rounded-[8px] border border-dashed border-[var(--wb-accent)]/50 bg-[var(--wb-accent-soft)] px-2 py-1.5 text-[11px] text-[var(--wb-accent)]">
            Drop to pin files and folders for analysis
          </p>
        ) : null}
        <div className="wb-composer relative" data-agent-composer>
          {mentionOpen ? (
            <MentionMenu
              draft={draft}
              cursor={draftCursor}
              openTabs={openTabs}
              onClose={() => setMentionPaused(true)}
              onApply={({ text, cursor, file }) => {
                setDraft(text)
                setDraftCursor(cursor)
                setMentionPaused(true)
                if (file) attachFiles([file])
                requestAnimationFrame(() => {
                  const el = inputRef.current
                  if (!el) return
                  el.focus()
                  el.setSelectionRange(cursor, cursor)
                })
              }}
            />
          ) : null}
          <textarea
            ref={inputRef}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value)
              syncDraftCursor(e.currentTarget)
            }}
            onClick={(e) => syncDraftCursor(e.currentTarget)}
            onKeyUp={(e) => syncDraftCursor(e.currentTarget)}
            onSelect={(e) => syncDraftCursor(e.currentTarget)}
            placeholder={modeMeta.hint}
            disabled={busy || paused}
            rows={2}
            className="max-h-28 min-h-[34px] w-full resize-none bg-transparent px-2 py-1 text-[11px] leading-[18px] outline-none placeholder:text-[var(--wb-muted)]"
            onKeyDown={(e) => {
              if (mentionOpen && ['Enter', 'Tab', 'ArrowUp', 'ArrowDown', 'Escape'].includes(e.key)) {
                return
              }
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send()
              }
            }}
          />
          <div className="flex items-center gap-0.5 px-1 pb-1">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-6 gap-1 px-1.5 text-[10px]">
                  {modeMeta.label}
                  <ChevronDown className="h-3 w-3 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-52">
                <DropdownMenuLabel>Mode</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {MODES.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={cn(
                      'flex w-full flex-col items-start rounded-md px-2 py-1.5 text-left text-[11px] hover:bg-accent',
                      mode === item.id && 'bg-accent'
                    )}
                    onClick={() => setMode(item.id)}
                  >
                    <span className="text-[11px] font-medium">{item.label}</span>
                    <span className="text-[10px] text-muted-foreground">{item.hint}</span>
                  </button>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu onOpenChange={(open) => !open && setAtQuery('')}>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-6 gap-1 px-1.5 text-[10px]" title="Add files">
                  <AtSign className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-64 p-1">
                <DropdownMenuLabel>Add files</DropdownMenuLabel>
                <div className="px-1 pb-1">
                  <Input
                    value={atQuery}
                    onChange={(e) => setAtQuery(e.target.value)}
                    placeholder="Search files…"
                    className="h-7 text-xs"
                    onKeyDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
                {openTabs.length > 0 ? (
                  <>
                    <DropdownMenuSeparator />
                    <p className="px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">Open tabs</p>
                    {openTabs.slice(0, 8).map((tab) => (
                      <button
                        key={tab.path}
                        type="button"
                        className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-[11px] hover:bg-accent"
                        onClick={() => attachFiles([{ path: tab.path, name: tab.name, kind: 'file' }])}
                      >
                        <FileCode2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="truncate">{tab.name}</span>
                      </button>
                    ))}
                  </>
                ) : null}
                {atHits.length > 0 ? (
                  <>
                    <DropdownMenuSeparator />
                    <p className="px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">Search</p>
                    {atHits.slice(0, 12).map((hit) => (
                      <button
                        key={hit.path}
                        type="button"
                        className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-[11px] hover:bg-accent"
                        title={hit.path}
                        onClick={() =>
                          attachFiles([{ path: hit.path, name: hit.name, kind: 'file' }])
                        }
                      >
                        <FileCode2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="truncate">{hit.relativePath || hit.name}</span>
                      </button>
                    ))}
                  </>
                ) : atQuery.trim() ? (
                  <p className="px-2 py-1.5 text-[11px] text-muted-foreground">No matching files</p>
                ) : (
                  <p className="px-2 py-1.5 text-[11px] text-muted-foreground">
                    Drop files here, drag from the tree, or search.
                  </p>
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-6 max-w-[120px] gap-1 px-1.5 text-[10px]">
                  {isLocalMode ? <Cpu className="h-3 w-3" /> : <Cloud className="h-3 w-3" />}
                  <span className="truncate">{modelLabel}</span>
                  <ChevronDown className="h-3 w-3 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                {isLocalMode ? (
                  <>
                    <DropdownMenuLabel>Ollama</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {ollamaModels.length === 0 ? (
                      <p className="px-2 py-1.5 text-[11px] text-muted-foreground">No local models</p>
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
                    <DropdownMenuLabel>{CLOUD_MODEL_LABEL[cloudProvider]}</DropdownMenuLabel>
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

            <div className="ml-auto flex items-center gap-0.5">
              {busy ? (
                <>
                  <Button variant="ghost" size="icon" className="h-7 w-7" title="Pause" onClick={() => void pause()}>
                    <Pause className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive"
                    title="Stop"
                    onClick={() => void cancel()}
                  >
                    <Square className="h-3 w-3 fill-current" />
                  </Button>
                </>
              ) : paused ? (
                <>
                  <Button variant="ghost" size="icon" className="h-7 w-7" title="Resume" onClick={() => void resume()}>
                    <Play className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive"
                    title="Stop"
                    onClick={() => void cancel()}
                  >
                    <Square className="h-3 w-3 fill-current" />
                  </Button>
                </>
              ) : (
                <Button
                  size="icon"
                  className="h-7 w-7 rounded-full"
                  disabled={!draft.trim()}
                  title="Send"
                  onClick={send}
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </div>
        </div>
        <p className="mt-1 px-1 text-[10px] text-muted-foreground">
          Enter to send · @ to mention a file · Shift+Enter for a new line
        </p>
      </div>
      <ConfirmDialog
        open={closeAllConfirm}
        onOpenChange={setCloseAllConfirm}
        title="Close all chats?"
        description="This removes all agent chat history for this workspace and stops any active agent runs. File changes are not reverted."
        confirmLabel="Close All"
        variant="destructive"
        onConfirm={() => {
          setCloseAllConfirm(false)
          void closeAllChats()
        }}
      />
    </div>
  )
}
