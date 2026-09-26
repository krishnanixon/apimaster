import { useState, useRef, useEffect } from 'react'
import { Terminal, Sparkles, AlertTriangle, Lock } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Spinner } from '@/shared/components/ui/spinner'
import { cn } from '@/shared/lib/utils'
import { parseSmartIntent } from '../core/intentParser'
import { useVPSStore } from '../stores/vps.store'
import { runPipeline } from '../services/deploy.service'
import type { VPSProject } from '../types/project.types'

type TerminalMode = 'raw' | 'smart'
type WorkspaceTab = 'overview' | 'terminal' | 'pm2' | 'deployments' | 'files' | 'env'

interface SmartTerminalProps {
  serverId: string
  projects: VPSProject[]
  onNavigate: (tab: WorkspaceTab) => void
  disabled?: boolean
}

export function SmartTerminal({ serverId, projects, onNavigate, disabled }: SmartTerminalProps) {
  const [mode, setMode] = useState<TerminalMode>('smart')
  const [input, setInput] = useState('')
  const [history, setHistory] = useState<string[]>([])
  const [historyIdx, setHistoryIdx] = useState(-1)
  const [executing, setExecuting] = useState(false)
  const [pendingConfirm, setPendingConfirm] = useState<{
    command: string
    reason: string
    original?: string
  } | null>(null)
  const logRef = useRef<HTMLPreElement>(null)
  const { terminalLogs, executeCommand, clearTerminalLog, setActiveDeployment } = useVPSStore()
  const os = useVPSStore((s) => s.servers.find((server) => server.id === serverId)?.os)
  const logs = terminalLogs[serverId] ?? ''
  const defaultProject = projects[0]
  const busy = executing || disabled

  useEffect(() => {
    logRef.current?.scrollTo(0, logRef.current.scrollHeight)
  }, [logs])

  const runResolvedCommand = async (command: string, original?: string) => {
    setExecuting(true)
    try {
      await executeCommand(serverId, command)
      if (original) setHistory((h) => [original, ...h.slice(0, 49)])
    } finally {
      setExecuting(false)
    }
  }

  const handleIntent = async (cmd: string) => {
    const intent = parseSmartIntent(cmd, defaultProject?.pm2Name)

    if (intent.action === 'deploy' && defaultProject) {
      setExecuting(true)
      try {
        const deployment = await runPipeline(serverId, defaultProject.id)
        setActiveDeployment(deployment)
        onNavigate('deployments')
        setHistory((h) => [cmd, ...h.slice(0, 49)])
      } finally {
        setExecuting(false)
      }
      return
    }

    if (intent.action === 'env-editor') {
      onNavigate('env')
      setHistory((h) => [cmd, ...h.slice(0, 49)])
      return
    }

    if (intent.requiresConfirmation && intent.command) {
      setPendingConfirm({
        command: intent.command,
        reason: intent.confirmationReason ?? 'Confirm execution?',
        original: cmd
      })
      return
    }

    const command = mode === 'smart' && intent.command ? intent.command : cmd
    await runResolvedCommand(command, cmd)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || busy) return
    const cmd = input.trim()
    setInput('')
    setHistoryIdx(-1)
    await handleIntent(cmd)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (busy) return
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      const next = Math.min(historyIdx + 1, history.length - 1)
      if (history[next]) {
        setHistoryIdx(next)
        setInput(history[next])
      }
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      const next = historyIdx - 1
      if (next < 0) {
        setHistoryIdx(-1)
        setInput('')
      } else {
        setHistoryIdx(next)
        setInput(history[next])
      }
    }
  }

  if (disabled) {
    return (
      <div className="flex h-[calc(100vh-280px)] min-h-[400px] flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/20">
        <Lock className="mb-3 h-8 w-8 text-muted-foreground/50" />
        <p className="text-sm font-medium">Terminal unavailable</p>
        <p className="mt-1 text-xs text-muted-foreground">Connect to this server to run commands</p>
      </div>
    )
  }

  return (
    <div className="flex h-[calc(100vh-280px)] min-h-[400px] flex-col overflow-hidden rounded-xl border border-border bg-[#0d1117] shadow-inner">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <Terminal className="h-4 w-4" />
          {os === 'windows' ? 'PowerShell Terminal' : 'Smart Terminal'}
          {executing && (
            <span className="inline-flex items-center gap-1 text-xs text-amber-400">
              <Spinner size="sm" className="text-amber-400" />
              Running...
            </span>
          )}
        </div>
        <div className="flex gap-1">
          <Button
            size="sm"
            variant={mode === 'smart' ? 'default' : 'ghost'}
            className="h-7 text-xs"
            onClick={() => setMode('smart')}
            disabled={executing}
          >
            <Sparkles className="mr-1 h-3 w-3" />
            Smart
          </Button>
          <Button
            size="sm"
            variant={mode === 'raw' ? 'default' : 'ghost'}
            className="h-7 text-xs"
            onClick={() => setMode('raw')}
            disabled={executing}
          >
            Raw
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs"
            onClick={() => clearTerminalLog(serverId)}
            disabled={executing}
          >
            Clear
          </Button>
        </div>
      </div>

      {mode === 'smart' && (
        <div className="border-b border-white/5 px-4 py-2 text-xs text-slate-500">
          Try: &quot;restart app&quot;, &quot;show logs&quot;, &quot;deploy project&quot;,
          &quot;update env&quot;
        </div>
      )}

      <pre
        ref={logRef}
        className="flex-1 overflow-y-auto p-4 font-mono text-xs leading-relaxed text-green-400/90"
      >
        {logs || '$ Ready. Type a command or intent...\n'}
      </pre>

      {pendingConfirm && (
        <div className="animate-fade-in border-t border-amber-500/30 bg-amber-950/40 px-4 py-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
            <div className="flex flex-1 items-start gap-2 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              <div>
                <p className="font-medium text-amber-100">{pendingConfirm.reason}</p>
                <code className="mt-1 block rounded bg-black/30 px-2 py-1 text-xs text-amber-100/80">
                  {pendingConfirm.command}
                </code>
              </div>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button
                size="sm"
                variant="outline"
                className="h-8"
                onClick={() => setPendingConfirm(null)}
                disabled={executing}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                variant="destructive"
                className="h-8"
                disabled={executing}
                onClick={async () => {
                  const { command, original } = pendingConfirm
                  setPendingConfirm(null)
                  await runResolvedCommand(command, original)
                }}
              >
                {executing ? <Spinner size="sm" /> : 'Confirm'}
              </Button>
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex gap-2 border-t border-white/10 p-3">
        <span className="flex items-center font-mono text-sm text-green-500">$</span>
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={executing}
          placeholder={
            mode === 'smart'
              ? 'Enter intent or command...'
              : os === 'windows'
                ? 'PowerShell command, e.g. Get-Service'
                : 'Enter raw SSH command...'
          }
          className={cn(
            'border-0 bg-transparent font-mono text-sm text-green-400 placeholder:text-slate-600 focus-visible:ring-0',
            executing && 'opacity-50'
          )}
        />
        {executing && <Spinner size="sm" className="self-center text-green-500" />}
      </form>
    </div>
  )
}
