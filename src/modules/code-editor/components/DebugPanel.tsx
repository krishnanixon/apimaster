import { ArrowDown, ArrowRight, ArrowUp, Bug, Pause, Play, Square } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { cn } from '@/shared/lib/utils'
import { useCodeEditorStore } from '../stores/codeEditor.store'
import { useDebugStore } from '../stores/debug.store'

export function DebugPanel() {
  const snapshot = useDebugStore((s) => s.snapshot)
  const expr = useDebugStore((s) => s.expr)
  const start = useDebugStore((s) => s.start)
  const stop = useDebugStore((s) => s.stop)
  const pause = useDebugStore((s) => s.pause)
  const cont = useDebugStore((s) => s.continue)
  const stepOver = useDebugStore((s) => s.stepOver)
  const stepInto = useDebugStore((s) => s.stepInto)
  const stepOut = useDebugStore((s) => s.stepOut)
  const setExpr = useDebugStore((s) => s.setExpr)
  const evaluate = useDebugStore((s) => s.evaluate)
  const breakpoints = useDebugStore((s) => s.breakpoints)
  const openFileAtLine = useCodeEditorStore((s) => s.openFileAtLine)
  const active = snapshot.state === 'running' || snapshot.state === 'paused' || snapshot.state === 'launching'

  return (
    <div className="flex h-full min-h-0 flex-col text-[12px]">
      <div className="flex items-center gap-1 border-b border-[var(--wb-border)] px-2 py-1">
        <Bug className="h-3.5 w-3.5 text-primary" />
        <span className="font-medium">Debug</span>
        <span className="text-[11px] text-muted-foreground">{snapshot.state}</span>
        <div className="ml-auto flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            title="Start (F5)"
            onClick={() => void start()}
            disabled={active}
          >
            <Play className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            title={snapshot.state === 'paused' ? 'Continue' : 'Pause'}
            disabled={!active}
            onClick={() => void (snapshot.state === 'paused' ? cont() : pause())}
          >
            {snapshot.state === 'paused' ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6" title="Step over (F10)" disabled={snapshot.state !== 'paused'} onClick={() => void stepOver()}>
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6" title="Step into (F11)" disabled={snapshot.state !== 'paused'} onClick={() => void stepInto()}>
            <ArrowDown className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6" title="Step out (Shift+F11)" disabled={snapshot.state !== 'paused'} onClick={() => void stepOut()}>
            <ArrowUp className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6" title="Stop (Shift+F5)" disabled={!active} onClick={() => void stop()}>
            <Square className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      {snapshot.error ? <p className="px-3 py-1 text-xs text-destructive">{snapshot.error}</p> : null}
      <div className="grid min-h-0 flex-1 grid-cols-3 overflow-hidden">
        <section className="min-h-0 overflow-y-auto border-r border-[var(--wb-border)]">
          <p className="px-2 py-1 text-[11px] font-semibold uppercase text-muted-foreground">Call stack</p>
          {snapshot.frames.length === 0 ? (
            <p className="px-2 py-2 text-[11px] text-muted-foreground">Paused frames appear here.</p>
          ) : (
            snapshot.frames.map((frame) => (
              <button
                key={frame.id}
                type="button"
                className="block w-full truncate px-2 py-1 text-left hover:bg-[var(--wb-hover)]"
                onClick={() => {
                  if (frame.path && frame.line) void openFileAtLine(frame.path, frame.line, frame.column)
                }}
              >
                <span className="font-mono">{frame.functionName}</span>
                {frame.path ? (
                  <span className="ml-1 text-[10px] text-muted-foreground">
                    {frame.path.split(/[\\/]/).pop()}:{frame.line}
                  </span>
                ) : null}
              </button>
            ))
          )}
          <p className="px-2 pt-2 text-[11px] font-semibold uppercase text-muted-foreground">Breakpoints</p>
          {breakpoints.length === 0 ? (
            <p className="px-2 py-2 text-[11px] text-muted-foreground">Click the gutter to add one.</p>
          ) : (
            breakpoints.map((bp) => (
              <button
                key={`${bp.path}:${bp.line}`}
                type="button"
                className="block w-full truncate px-2 py-1 text-left hover:bg-[var(--wb-hover)]"
                onClick={() => void openFileAtLine(bp.path, bp.line)}
              >
                {bp.path.split(/[\\/]/).pop()}:{bp.line}
              </button>
            ))
          )}
        </section>
        <section className="min-h-0 overflow-y-auto border-r border-[var(--wb-border)]">
          <p className="px-2 py-1 text-[11px] font-semibold uppercase text-muted-foreground">Variables</p>
          {snapshot.scopes.length === 0 ? (
            <p className="px-2 py-2 text-[11px] text-muted-foreground">Locals show when paused.</p>
          ) : (
            snapshot.scopes.map((scope) => (
              <div key={scope.name} className="px-2 py-1">
                <p className="text-[11px] font-medium">{scope.name}</p>
                {scope.variables.map((variable) => (
                  <p key={variable.name} className="truncate font-mono text-[11px]">
                    <span className="text-sky-300">{variable.name}</span>
                    <span className="text-muted-foreground"> = {variable.value}</span>
                  </p>
                ))}
              </div>
            ))
          )}
        </section>
        <section className="flex min-h-0 flex-col">
          <p className="px-2 py-1 text-[11px] font-semibold uppercase text-muted-foreground">Debug console</p>
          <div className="min-h-0 flex-1 overflow-y-auto px-2">
            {snapshot.console.map((line, index) => (
              <pre
                key={`${index}-${line.text.slice(0, 24)}`}
                className={cn(
                  'whitespace-pre-wrap font-mono text-[11px]',
                  line.level === 'error' && 'text-red-400',
                  line.level === 'warn' && 'text-amber-300',
                  line.level === 'system' && 'text-muted-foreground'
                )}
              >
                {line.text}
              </pre>
            ))}
          </div>
          <form
            className="border-t border-[var(--wb-border)] px-2 py-1"
            onSubmit={(event) => {
              event.preventDefault()
              void evaluate()
            }}
          >
            <input
              value={expr}
              onChange={(event) => setExpr(event.target.value)}
              placeholder="Evaluate expression"
              className="w-full bg-transparent font-mono text-[11px] outline-none"
            />
          </form>
        </section>
      </div>
    </div>
  )
}
