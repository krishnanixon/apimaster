import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { Sparkles, Send, Trash2, RefreshCw, Check } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Spinner } from '@/shared/components/ui/spinner'
import { useSettingsStore } from '@/shared/stores/settings.store'
import { AI_MODELS, formatRelativeTime } from '@/shared/lib/utils'
import { cn } from '@/shared/lib/utils'
import { useDbWorkspaceStore } from '../../stores/dbWorkspace.store'
import type { DbAiAction } from '@shared/types/database-workspace'
import { useConnectionMeta } from '../../lib/providers'

const SHORTCUTS: { action: DbAiAction; label: string }[] = [
  { action: 'explain_schema', label: 'Explain' },
  { action: 'find_missing_indexes', label: 'Indexes' },
  { action: 'detect_security', label: 'Security' },
  { action: 'generate_documentation', label: 'Docs' },
  { action: 'generate_prisma', label: 'Prisma' }
]

const DOCUMENT_SHORTCUTS: { action: DbAiAction; label: string }[] = [
  { action: 'explain_schema', label: 'Explain' },
  { action: 'find_missing_indexes', label: 'Indexes' },
  { action: 'detect_security', label: 'Security' },
  { action: 'generate_documentation', label: 'Docs' },
  { action: 'suggest_normalization', label: 'Modeling' }
]

export function DbAiAssistantPanel() {
  const { isDocument, terms } = useConnectionMeta()
  const shortcuts = isDocument ? DOCUMENT_SHORTCUTS : SHORTCUTS
  const aiMessages = useDbWorkspaceStore((s) => s.aiMessages)
  const aiLoading = useDbWorkspaceStore((s) => s.aiLoading)
  const activeConnectionId = useDbWorkspaceStore((s) => s.activeConnectionId)
  const activeDatabase = useDbWorkspaceStore((s) => s.activeDatabase)
  const connections = useDbWorkspaceStore((s) => s.connections)
  const settings = useDbWorkspaceStore((s) => s.settings)
  const tabs = useDbWorkspaceStore((s) => s.tabs)
  const activeTabId = useDbWorkspaceStore((s) => s.activeTabId)
  const aiLiveContext = useDbWorkspaceStore((s) => s.aiLiveContext)
  const lastQueryResult = useDbWorkspaceStore((s) => s.lastQueryResult)
  const runAi = useDbWorkspaceStore((s) => s.runAi)
  const clearAiMessages = useDbWorkspaceStore((s) => s.clearAiMessages)
  const setConnectionManagerOpen = useDbWorkspaceStore((s) => s.setConnectionManagerOpen)
  const aiModel = useDbWorkspaceStore((s) => s.aiModel)
  const setAiModel = useDbWorkspaceStore((s) => s.setAiModel)
  const aiSchema = useDbWorkspaceStore((s) => s.aiSchema)
  const aiSchemaSyncing = useDbWorkspaceStore((s) => s.aiSchemaSyncing)
  const resyncAiSchema = useDbWorkspaceStore((s) => s.resyncAiSchema)
  const { settings: appSettings } = useSettingsStore()
  const [prompt, setPrompt] = useState('')
  const threadRef = useRef<HTMLDivElement>(null)

  const currentModel = aiModel ?? appSettings?.aiModel ?? 'gpt-4o-mini'
  const conn = connections.find((c) => c.id === activeConnectionId)
  const activeTab = tabs.find((t) => t.id === activeTabId)
  const contextTable =
    aiLiveContext?.table ?? (activeTab?.type === 'table' ? activeTab.table : undefined)
  const contextSchema =
    aiLiveContext?.schema ??
    activeTab?.schema ??
    conn?.config.schema ??
    conn?.config.defaultSchema ??
    settings.defaultSchema
  const selectedCount = aiLiveContext?.selectedRows.length ?? 0
  const queryRowCount = lastQueryResult?.rowCount ?? 0
  const databaseName = aiLiveContext?.database ?? activeDatabase ?? conn?.config.database

  useEffect(() => {
    if (!aiModel && appSettings?.aiModel) {
      setAiModel(appSettings.aiModel)
    }
  }, [aiModel, appSettings?.aiModel, setAiModel])

  useEffect(() => {
    const el = threadRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [aiMessages, aiLoading])

  const sendPrompt = (text: string) => {
    if (!text.trim()) return
    if (!activeConnectionId) {
      setConnectionManagerOpen(true)
      return
    }
    void runAi(activeConnectionId, 'natural_language', {
      prompt: text.trim(),
      table: contextTable,
      database: databaseName ?? undefined,
      schema: contextSchema,
      sql: activeTab?.type === 'query' ? activeTab.sql : undefined
    })
    setPrompt('')
  }

  const handleSend = () => sendPrompt(prompt)

  const runShortcut = (action: DbAiAction, label: string) => {
    if (!activeConnectionId) {
      setConnectionManagerOpen(true)
      return
    }
    void runAi(activeConnectionId, action, {
      table: contextTable,
      database: databaseName ?? undefined,
      schema: contextSchema,
      userLabel: label
    })
  }

  const contextParts = [
    conn?.name,
    databaseName,
    contextTable,
    selectedCount > 0 ? `${selectedCount} selected` : null,
    queryRowCount > 0 && activeTab?.type === 'query' ? `${queryRowCount} query rows` : null
  ].filter(Boolean)

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex h-8 shrink-0 items-center justify-between gap-2 border-b border-border px-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate text-xs font-medium">Database AI</span>
        </div>
        <div className="flex items-center gap-1">
          <select
            className="max-w-[120px] rounded border border-border bg-background px-1.5 py-0.5 text-[10px]"
            value={currentModel}
            onChange={(e) => setAiModel(e.target.value)}
            title="AI model"
          >
            {AI_MODELS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6"
            title="Clear conversation"
            disabled={aiMessages.length === 0 || aiLoading}
            onClick={() => clearAiMessages()}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {contextParts.length > 0 && (
        <p className="shrink-0 truncate border-b border-border px-2 py-1 text-[11px] text-muted-foreground">
          {contextParts.join(' · ')}
        </p>
      )}

      {activeConnectionId && (
        <div className="flex h-7 shrink-0 items-center gap-2 border-b border-border px-2">
          {aiSchemaSyncing ? (
            <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
              <Spinner size="sm" />
              Saving schema snapshot…
            </span>
          ) : aiSchema ? (
            <span className="flex min-w-0 items-center gap-1 truncate text-[11px] text-muted-foreground">
              <Check className="h-3 w-3 shrink-0 text-emerald-600" />
              <span className="truncate">
                Snapshot saved · {aiSchema.tableCount} {terms.tables}
                {aiSchema.capturedAt ? ` · ${formatRelativeTime(aiSchema.capturedAt)}` : ''}
              </span>
            </span>
          ) : (
            <span className="truncate text-[11px] text-muted-foreground">No schema snapshot yet</span>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto h-6 px-1.5 text-[11px]"
            disabled={aiSchemaSyncing || !databaseName}
            title={`Resync latest ${terms.tables} and ${terms.columns} for AI`}
            onClick={() => void resyncAiSchema(activeConnectionId)}
          >
            <RefreshCw className={cn('mr-1 h-3 w-3', aiSchemaSyncing && 'animate-spin')} />
            Resync
          </Button>
        </div>
      )}

      <div className="flex shrink-0 flex-wrap gap-1 border-b border-border px-2 py-1">
        {shortcuts.map(({ action, label }) => (
          <button
            key={action}
            type="button"
            disabled={aiLoading}
            className="rounded border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
            onClick={() => runShortcut(action, label)}
          >
            {label}
          </button>
        ))}
      </div>

      <div ref={threadRef} className="min-h-0 flex-1 space-y-2 overflow-auto p-2">
        {aiMessages.length === 0 && !aiLoading && (
          <p className="px-1 py-6 text-center text-[11px] text-muted-foreground">
            Ask anything about the open {terms.table}, selected {terms.rows}, or this database.
          </p>
        )}

        {aiMessages.map((msg) => (
          <div
            key={msg.id}
            className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}
          >
            <div
              className={cn(
                'max-w-[94%] rounded-lg px-2.5 py-1.5 text-xs',
                msg.role === 'user'
                  ? 'bg-primary text-primary-foreground'
                  : 'border border-border bg-muted/30'
              )}
            >
              {msg.role === 'assistant' ? (
                <div className="prose prose-sm dark:prose-invert max-w-none text-xs">
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                </div>
              ) : (
                <p className="whitespace-pre-wrap text-[11px] leading-relaxed">{msg.content}</p>
              )}
            </div>
          </div>
        ))}

        {aiLoading && (
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <Spinner size="sm" />
            Thinking…
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-border p-1.5">
        <div className="flex gap-1.5">
          <textarea
            className="min-h-[52px] flex-1 resize-none rounded-md border border-border bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder={
              selectedCount > 0
                ? `Ask about ${selectedCount} selected ${selectedCount === 1 ? terms.row : terms.rows}…`
                : contextTable
                  ? `Ask about ${contextTable}…`
                  : 'Ask about this database…'
            }
            value={prompt}
            disabled={aiLoading}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSend()
              }
            }}
          />
          <Button
            size="icon"
            className="h-8 w-8 shrink-0 self-end rounded-md"
            disabled={aiLoading || !prompt.trim()}
            onClick={handleSend}
          >
            <Send className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  )
}
