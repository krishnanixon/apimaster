import { useState } from 'react'
import { ChevronRight, FileCode2, Gauge, Layers3, Scissors } from 'lucide-react'
import type { ContextSourceKind } from '@shared/types/context-engine'
import { cn } from '@/shared/lib/utils'
import { useCodeEditorStore } from '../stores/codeEditor.store'
import type { AgentThreadItem } from '../stores/agent.store'

const SOURCE_LABEL: Record<ContextSourceKind, string> = {
  selection: 'Selection',
  diagnostics: 'Problems',
  current_file: 'Current file',
  open_tab: 'Open tabs',
  dependency: 'Dependencies',
  symbol: 'Symbols',
  file: 'Code search',
  vector: 'Semantic search',
  git_diff: 'Git changes',
  attachment: 'Attachments',
  knowledge: 'Project knowledge',
  project_rules: 'Project rules',
  pinned: 'Pinned files'
}

function formatTokens(tokens: number): string {
  if (tokens < 1_000) return `${tokens}`
  return `${(tokens / 1_000).toFixed(tokens < 10_000 ? 1 : 0)}k`
}

function formatCost(cost: number): string {
  if (cost <= 0) return '$0'
  if (cost < 0.01) return '<$0.01'
  return `$${cost.toFixed(2)}`
}

export function AgentContextCard({
  item
}: {
  item: Extract<AgentThreadItem, { kind: 'context' }>
}) {
  const [open, setOpen] = useState(false)
  const rootPath = useCodeEditorStore((state) => state.rootPath)
  const openFileByPath = useCodeEditorStore((state) => state.openFileByPath)
  const summary = item.summary

  if (!summary) {
    return (
      <details className="agent-context-card">
        <summary>Context used</summary>
        <p>{item.text}</p>
      </details>
    )
  }

  const budget = Math.max(1, summary.budgetTokens || summary.promptTokens || 1)
  const usagePercent = Math.min(100, Math.round((summary.promptTokens / budget) * 100))

  return (
    <div className="overflow-hidden rounded-lg border border-[var(--wb-border)] bg-[var(--wb-editor)]">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Layers3 className="h-3.5 w-3.5 shrink-0 text-[var(--wb-accent)]" />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--wb-fg)]">
            Context used
            {summary.trimmed ? (
              <span className="inline-flex items-center gap-0.5 rounded bg-amber-500/10 px-1 py-0.5 text-[9px] font-normal text-amber-500">
                <Scissors className="h-2.5 w-2.5" /> trimmed
              </span>
            ) : null}
          </span>
          <span className="mt-0.5 block truncate text-[10px] text-[var(--wb-muted)]">
            {formatTokens(summary.promptTokens)} / {formatTokens(budget)} tokens · {summary.files.length}{' '}
            file{summary.files.length === 1 ? '' : 's'} · {summary.chunkCount} source
            {summary.chunkCount === 1 ? '' : 's'}
          </span>
        </span>
        <ChevronRight
          className={cn(
            'h-3.5 w-3.5 shrink-0 text-[var(--wb-muted)] transition-transform',
            open && 'rotate-90'
          )}
        />
      </button>

      {open ? (
        <div className="space-y-2 border-t border-[var(--wb-border)] px-2.5 py-2">
          <div>
            <div className="mb-1 flex items-center justify-between text-[10px] text-[var(--wb-muted)]">
              <span className="inline-flex items-center gap-1">
                <Gauge className="h-3 w-3" /> Context budget
              </span>
              <span className="tabular-nums">{usagePercent}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-[var(--wb-hover)]">
              <div
                className={cn(
                  'h-full rounded-full transition-[width]',
                  usagePercent >= 90 ? 'bg-amber-500' : 'bg-[var(--wb-accent)]'
                )}
                style={{ width: `${usagePercent}%` }}
              />
            </div>
          </div>

          {summary.sources.length > 0 ? (
            <div className="grid grid-cols-2 gap-1">
              {summary.sources.map((source) => (
                <div
                  key={source.kind}
                  className="flex min-w-0 items-center justify-between gap-1 rounded bg-[var(--wb-hover)] px-1.5 py-1 text-[10px]"
                  title={`${source.count} chunks, ${source.tokens.toLocaleString()} tokens`}
                >
                  <span className="truncate text-[var(--wb-muted)]">{SOURCE_LABEL[source.kind]}</span>
                  <span className="shrink-0 tabular-nums text-[var(--wb-fg)]">
                    {formatTokens(source.tokens)}
                  </span>
                </div>
              ))}
            </div>
          ) : null}

          {summary.files.length > 0 ? (
            <div className="max-h-28 space-y-0.5 overflow-y-auto">
              {summary.files.map((path) => (
                <button
                  key={path}
                  type="button"
                  className="flex w-full items-center gap-1.5 rounded px-1 py-1 text-left text-[10px] text-[var(--wb-muted)] hover:bg-[var(--wb-hover)] hover:text-[var(--wb-fg)]"
                  title={path}
                  onClick={() => {
                    const absolute = rootPath && !path.startsWith(rootPath) ? `${rootPath}/${path}` : path
                    void openFileByPath(absolute)
                  }}
                >
                  <FileCode2 className="h-3 w-3 shrink-0" />
                  <span className="truncate">{path}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-[10px] text-[var(--wb-muted)]">
              No workspace files were needed for this request.
            </p>
          )}

          <div className="flex items-center justify-between border-t border-[var(--wb-border)] pt-1.5 text-[9px] text-[var(--wb-muted)]">
            <span className="max-w-[65%] truncate" title={summary.model}>
              {summary.model}
            </span>
            <span>estimated input {formatCost(summary.estimatedCostUsd)}</span>
          </div>
        </div>
      ) : null}
    </div>
  )
}
