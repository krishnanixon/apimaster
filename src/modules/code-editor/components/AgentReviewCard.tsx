import { AlertTriangle, FileWarning, Info } from 'lucide-react'
import type { AgentReviewFinding } from '@shared/types/agent'
import { cn } from '@/shared/lib/utils'
import { useCodeEditorStore } from '../stores/codeEditor.store'

const SEVERITY_ICON = {
  critical: AlertTriangle,
  warning: FileWarning,
  info: Info
} as const

const SEVERITY_CLASS = {
  critical: 'text-[var(--wb-danger)]',
  warning: 'text-[var(--wb-warn)]',
  info: 'text-sky-400'
} as const

export function AgentReviewCard({ findings }: { findings: AgentReviewFinding[] }) {
  const openFileAtLine = useCodeEditorStore((s) => s.openFileAtLine)
  const rootPath = useCodeEditorStore((s) => s.rootPath)

  if (findings.length === 0) return null

  return (
    <div className="rounded-lg border border-[var(--wb-border)] bg-[var(--wb-editor)]/60 px-2.5 py-2">
      <p className="mb-1.5 text-[11px] font-semibold text-[var(--wb-fg)]">
        Review findings ({findings.length})
      </p>
      <ul className="space-y-1.5">
        {findings.map((finding) => {
          const Icon = SEVERITY_ICON[finding.severity]
          return (
            <li key={finding.id} className="rounded-md border border-[var(--wb-border)]/70 px-2 py-1.5">
              <div className="flex items-start gap-1.5">
                <Icon className={cn('mt-0.5 h-3.5 w-3.5 shrink-0', SEVERITY_CLASS[finding.severity])} />
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-medium text-[var(--wb-fg)]">{finding.title}</p>
                  <p className="mt-0.5 text-[11px] leading-snug text-[var(--wb-muted)]">{finding.message}</p>
                  {finding.path ? (
                    <button
                      type="button"
                      className="mt-1 text-[10px] text-[var(--wb-accent)] hover:underline"
                      onClick={() => {
                        const abs =
                          rootPath && !finding.path!.includes(':') && !finding.path!.startsWith(rootPath)
                            ? `${rootPath}/${finding.path!.replace(/\\/g, '/')}`
                            : finding.path!
                        void openFileAtLine(abs, finding.line ?? 1)
                      }}
                    >
                      {finding.path}
                      {finding.line ? `:${finding.line}` : ''}
                    </button>
                  ) : null}
                  {finding.suggestion ? (
                    <p className="mt-1 text-[10px] text-[var(--wb-muted)]">Fix: {finding.suggestion}</p>
                  ) : null}
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
