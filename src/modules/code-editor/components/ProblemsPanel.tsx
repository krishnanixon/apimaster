import { AlertCircle, RefreshCw, Sparkles } from 'lucide-react'
import type { MouseEvent } from 'react'
import { Button } from '@/shared/components/ui/button'
import { cn } from '@/shared/lib/utils'
import type { DiagnosticHit } from '@shared/types/agent'
import { useAgentStore } from '../stores/agent.store'
import { useCodeEditorStore } from '../stores/codeEditor.store'
import { useProblemsStore } from '../stores/problems.store'
import { useWorkbenchLayoutStore } from '../stores/workbench.store'

function resolveProblemPath(file: string | undefined, rootPath: string | null): string | null {
  if (!file) return null
  if (rootPath && !file.includes(':') && !file.startsWith(rootPath)) {
    return `${rootPath}/${file.replace(/\\/g, '/')}`
  }
  return file
}

export function ProblemsPanel() {
  const rootPath = useCodeEditorStore((s) => s.rootPath)
  const items = useProblemsStore((s) => s.items)
  const loading = useProblemsStore((s) => s.loading)
  const error = useProblemsStore((s) => s.error)
  const refresh = useProblemsStore((s) => s.refresh)
  const openFileAtLine = useCodeEditorStore((s) => s.openFileAtLine)
  const setMode = useAgentStore((s) => s.setMode)
  const setDraft = useAgentStore((s) => s.setDraft)
  const attachFiles = useAgentStore((s) => s.attachFiles)
  const openAgent = useWorkbenchLayoutStore((s) => s.openAgent)

  const fixWithAi = (item: DiagnosticHit, event?: MouseEvent) => {
    event?.stopPropagation()
    const abs = resolveProblemPath(item.file, rootPath)
    const loc = abs
      ? `${abs.replace(/\\/g, '/').split('/').pop()}${item.line ? `:${item.line}` : ''}`
      : 'workspace'
    setMode('debug')
    setDraft(
      `Fix this ${item.severity ?? 'error'} in ${loc}.

${item.code ? `Code: ${item.code}\n` : ''}Message: ${item.message}
Source: ${item.source}

Use @problems if helpful. Inspect the surrounding code, apply the smallest safe fix, then re-check diagnostics.`
    )
    if (abs) {
      const name = abs.replace(/\\/g, '/').split('/').pop() || abs
      attachFiles([{ path: abs, name, kind: 'file' }])
    }
    openAgent()
  }

  const fixAllWithAi = () => {
    if (items.length === 0) return
    setMode('debug')
    const list = items
      .slice(0, 20)
      .map((item, index) => {
        const loc = item.file
          ? `${item.file}${item.line ? `:${item.line}` : ''}`
          : 'workspace'
        return `${index + 1}. [${item.severity ?? 'error'}] ${loc} — ${item.message}${item.code ? ` (${item.code})` : ''}`
      })
      .join('\n')
    setDraft(
      `Fix the current Problems/diagnostics. Prefer smallest safe changes and re-validate.

@problems

${list}`
    )
    openAgent()
  }

  return (
    <div className="flex h-full min-h-0 flex-col text-[12px]">
      <div className="wb-panel-header">
        <div className="flex items-center gap-1.5 text-[11px] font-medium">
          <AlertCircle className="h-3.5 w-3.5 text-[var(--wb-warn)]" />
          Problems
          {items.length > 0 ? (
            <span className="rounded bg-[var(--wb-warn)]/15 px-1.5 py-0.5 text-[10px] text-[var(--wb-warn)]">
              {items.length}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-0.5">
          {items.length > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 gap-1 px-1.5 text-[10px]"
              title="Fix all with AI"
              onClick={fixAllWithAi}
            >
              <Sparkles className="h-3 w-3" />
              Fix all
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            disabled={!rootPath || loading}
            onClick={() => rootPath && void refresh(rootPath)}
            title="Run TypeScript diagnostics"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          </Button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {error ? <p className="px-3 py-2 text-xs text-destructive">{error}</p> : null}
        {items.length === 0 && !loading ? (
          <div className="wb-empty px-3 py-6">
            <p className="text-[12px] font-medium text-[var(--wb-fg)]">No problems</p>
            <p className="mt-1 text-[11px] text-[var(--wb-muted)]">
              Run diagnostics, or let Debug mode collect them with the agent.
            </p>
          </div>
        ) : (
          items.map((item, index) => (
            <div
              key={`${item.file}:${item.line}:${index}`}
              className="wb-list-row group flex items-start gap-2 border-b border-[var(--wb-border)] px-2 py-1.5"
            >
              <button
                type="button"
                className="min-w-0 flex-1 text-left hover:opacity-90"
                onClick={() => {
                  const abs = resolveProblemPath(item.file, rootPath)
                  if (abs) void openFileAtLine(abs, item.line ?? 1)
                }}
              >
                <p className="truncate text-xs text-[var(--wb-fg)]">{item.message}</p>
                <p className="truncate text-[11px] text-[var(--wb-muted)]">
                  {item.source}
                  {item.code ? ` ${item.code}` : ''}
                  {item.file ? ` · ${item.file}${item.line ? `:${item.line}` : ''}` : ''}
                </p>
              </button>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100"
                title="Fix with AI"
                onClick={(event) => fixWithAi(item, event)}
              >
                <Sparkles className="h-3.5 w-3.5 text-[var(--wb-accent)]" />
              </Button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
