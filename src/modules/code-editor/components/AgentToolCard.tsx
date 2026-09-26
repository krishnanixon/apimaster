import { useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import {
  Check,
  ChevronRight,
  FileCode2,
  GitBranch,
  Globe,
  Loader2,
  Search,
  Server,
  SquareTerminal,
  Wrench,
  XCircle
} from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { classifyTool, type AgentToolKind } from '@shared/lib/agent-activity'
import { useCodeEditorStore } from '../stores/codeEditor.store'
import type { AgentThreadItem } from '../stores/agent.store'
import { CodeDiffView } from './CodeDiffView'
import { Button } from '@/shared/components/ui/button'
import { useAgentStore } from '../stores/agent.store'
import { toast } from 'sonner'

const KIND_ICON: Record<AgentToolKind, typeof Search> = {
  read: FileCode2,
  search: Search,
  edit: FileCode2,
  terminal: SquareTerminal,
  git: GitBranch,
  mcp: Server,
  web: Globe,
  memory: Wrench,
  generic: Wrench
}

export function AgentToolCard({
  item
}: {
  item: Extract<AgentThreadItem, { kind: 'tool' }>
}) {
  const [open, setOpen] = useState(item.status === 'failed')
  const reduceMotion = useReducedMotion()
  const kind = classifyTool(item.name)
  const Icon = KIND_ICON[kind]
  const rootPath = useCodeEditorStore((s) => s.rootPath)
  const openFileByPath = useCodeEditorStore((s) => s.openFileByPath)
  const path = typeof item.input.path === 'string' ? item.input.path : null

  return (
    <motion.div layout initial={reduceMotion ? false : { opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} className="overflow-hidden rounded-lg border border-border/70 bg-muted/20">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-[10px]"
        onClick={() => setOpen((value) => !value)}
      >
        {item.status === 'running' ? (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
        ) : item.status === 'failed' ? (
          <XCircle className="h-3.5 w-3.5 shrink-0 text-destructive" />
        ) : (
          <Check className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
        )}
        <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-foreground/90">{item.label}</span>
        <ChevronRight className={cn('h-3.5 w-3.5 shrink-0 text-muted-foreground transition', open && 'rotate-90')} />
      </button>
      {open && (
        <div className="space-y-1.5 border-t border-border/60 px-2.5 py-2">
          {path ? (
            <button
              type="button"
              className="text-[10px] text-primary hover:underline"
              onClick={() => {
                const abs = rootPath && !path.startsWith(rootPath) ? `${rootPath}/${path}` : path
                void openFileByPath(abs)
              }}
            >
              Open {path}
            </button>
          ) : null}
          {item.output ? (
            <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words font-mono text-[10px] leading-4 text-muted-foreground">
              {item.output}
            </pre>
          ) : item.status === 'running' ? (
            <p className="text-[10px] text-muted-foreground">Working…</p>
          ) : null}
        </div>
      )}
    </motion.div>
  )
}

export function AgentPatchCard({
  item
}: {
  item: Extract<AgentThreadItem, { kind: 'patch' }>
}) {
  const revertPatch = useAgentStore((s) => s.revertPatch)
  const acceptPatch = useAgentStore((s) => s.acceptPatch)
  const openFileByPath = useCodeEditorStore((s) => s.openFileByPath)
  const rootPath = useCodeEditorStore((s) => s.rootPath)
  const pending = item.record.status === 'pending'

  return (
    <div className="overflow-hidden rounded-lg border border-border/70">
      <div className="flex items-center justify-between gap-2 bg-muted/30 px-2.5 py-1.5">
        <button
          type="button"
          className="truncate text-[10px] hover:underline"
          onClick={() => {
            const abs = rootPath ? `${rootPath}/${item.record.path}` : item.record.path
            void openFileByPath(abs)
          }}
        >
          {item.record.path}
          <span className="ml-1.5 text-[10px] uppercase text-muted-foreground">
            {pending ? 'Pending' : 'Applied'}
          </span>
        </button>
        <div className="flex items-center gap-1">
          {pending ? (
            <Button
              size="sm"
              className="h-6 px-2 text-[10px]"
              onClick={async () => {
                const ok = await acceptPatch(item.record.id)
                if (ok) toast.success('Accepted')
                else toast.error('Could not accept')
              }}
            >
              Accept
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[10px] text-destructive"
            onClick={async () => {
              const ok = await revertPatch(item.record.id)
              if (ok) toast.success(pending ? 'Rejected' : 'Reverted')
              else toast.error('Could not revert')
            }}
          >
            {pending ? 'Reject' : 'Revert'}
          </Button>
        </div>
      </div>
      <CodeDiffView diff={item.record.diff} maxHeightClass="max-h-40" />
    </div>
  )
}
