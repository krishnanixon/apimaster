import { useEffect, useState } from 'react'
import { Brain, History, Plug, RefreshCw } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { waitForDesktopApi } from '@/shared/lib/desktop-api'
import type { AgentMemoryFact, AgentTaskRecord } from '@shared/types/agent'
import { useAgentStore } from '../stores/agent.store'
import { useWorkbenchLayoutStore } from '../stores/workbench.store'

type McpRow = { id: string; command: string; ok: boolean; detail: string }

export function AgentIntelPanel() {
  const [tab, setTab] = useState<'tasks' | 'memory' | 'mcp'>('tasks')
  const [tasks, setTasks] = useState<AgentTaskRecord[]>([])
  const [memories, setMemories] = useState<AgentMemoryFact[]>([])
  const [mcp, setMcp] = useState<McpRow[]>([])
  const [loading, setLoading] = useState(false)
  const [memoryQuery, setMemoryQuery] = useState('')
  const setDraft = useAgentStore((s) => s.setDraft)
  const setMode = useAgentStore((s) => s.setMode)
  const openAgent = useWorkbenchLayoutStore((s) => s.openAgent)

  const refresh = async () => {
    setLoading(true)
    const api = await waitForDesktopApi()
    try {
      if (tab === 'tasks' && api?.agent?.listTasks) {
        const result = await api.agent.listTasks()
        if (result.success) setTasks(result.data ?? [])
      }
      if (tab === 'memory' && api?.agent?.recallMemory) {
        const result = await api.agent.recallMemory(memoryQuery.trim() || ' ')
        if (result.success) setMemories(result.data ?? [])
      }
      if (tab === 'mcp' && api?.agent?.mcpStatus) {
        const result = await api.agent.mcpStatus()
        if (result.success) setMcp(result.data ?? [])
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  return (
    <div className="flex h-full min-h-0 flex-col text-[12px]">
      <div className="wb-panel-header">
        <span className="text-[11px] font-medium">Agent intel</span>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          title="Refresh"
          onClick={() => void refresh()}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>
      <div className="wb-segment mx-2 mt-2">
        {(
          [
            ['tasks', 'Tasks', History],
            ['memory', 'Memory', Brain],
            ['mcp', 'MCP', Plug]
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            data-active={tab === id}
            className="wb-segment-btn"
            onClick={() => setTab(id)}
          >
            <Icon className="h-3 w-3" />
            {label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {tab === 'tasks' ? (
          tasks.length === 0 ? (
            <p className="px-1 py-4 text-[11px] text-[var(--wb-muted)]">No saved agent tasks yet.</p>
          ) : (
            tasks.map((task) => (
              <button
                key={task.id}
                type="button"
                className="wb-list-row mb-1 w-full rounded-md px-2 py-1.5 text-left hover:bg-[var(--wb-hover)]"
                onClick={() => {
                  setMode(task.mode)
                  setDraft(task.goal)
                  openAgent()
                }}
              >
                <p className="truncate text-[11px] text-[var(--wb-fg)]">{task.goal}</p>
                <p className="truncate text-[10px] text-[var(--wb-muted)]">
                  {task.mode} · {task.status}
                  {task.summary ? ` · ${task.summary.slice(0, 80)}` : ''}
                </p>
              </button>
            ))
          )
        ) : null}

        {tab === 'memory' ? (
          <div className="space-y-2">
            <input
              value={memoryQuery}
              onChange={(e) => setMemoryQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void refresh()
              }}
              placeholder="Search memories…"
              className="wb-field w-full"
            />
            {memories.length === 0 ? (
              <p className="px-1 py-3 text-[11px] text-[var(--wb-muted)]">No memories matched.</p>
            ) : (
              memories.map((fact) => (
                <div key={fact.id} className="rounded-md border border-[var(--wb-border)] px-2 py-1.5">
                  <p className="text-[11px] text-[var(--wb-fg)]">{fact.content}</p>
                  <p className="mt-0.5 text-[10px] text-[var(--wb-muted)]">
                    {fact.topic ? `${fact.topic} · ` : ''}
                    {new Date(fact.createdAt).toLocaleString()}
                  </p>
                </div>
              ))
            )}
          </div>
        ) : null}

        {tab === 'mcp' ? (
          mcp.length === 0 ? (
            <p className="px-1 py-4 text-[11px] text-[var(--wb-muted)]">
              No MCP servers configured. Add servers to userData/data/mcp-servers.json.
            </p>
          ) : (
            mcp.map((row) => (
              <div key={row.id} className="mb-1.5 rounded-md border border-[var(--wb-border)] px-2 py-1.5">
                <p className="text-[11px] font-medium text-[var(--wb-fg)]">
                  {row.id}{' '}
                  <span className={row.ok ? 'text-[var(--wb-ok)]' : 'text-[var(--wb-danger)]'}>
                    {row.ok ? 'ok' : 'down'}
                  </span>
                </p>
                <p className="truncate text-[10px] text-[var(--wb-muted)]">{row.command}</p>
                <p className="mt-0.5 line-clamp-3 text-[10px] text-[var(--wb-muted)]">{row.detail}</p>
              </div>
            ))
          )
        ) : null}
      </div>
    </div>
  )
}
