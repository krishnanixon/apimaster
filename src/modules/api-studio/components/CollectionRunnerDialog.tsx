import { useState } from 'react'
import { Play, X, CheckCircle2, XCircle } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/shared/components/ui/dialog'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Switch } from '@/shared/components/ui/switch'
import { Spinner } from '@/shared/components/ui/spinner'
import { ScrollArea } from '@/shared/components/ui/scroll-area'
import { useApiStudioStore } from '../stores/apiStudioStore'
import type { CollectionRunnerOptions } from '../types/api.types'

interface CollectionRunnerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  collectionId: string
  folderId?: string | null
  collectionName: string
  scopeLabel: string
}

export function CollectionRunnerDialog({
  open,
  onOpenChange,
  collectionId,
  folderId,
  collectionName,
  scopeLabel
}: CollectionRunnerDialogProps) {
  const runner = useApiStudioStore((s) => s.runner)
  const runCollection = useApiStudioStore((s) => s.runCollection)
  const runFolder = useApiStudioStore((s) => s.runFolder)
  const cancelRunner = useApiStudioStore((s) => s.cancelRunner)
  const clearRunnerReport = useApiStudioStore((s) => s.clearRunnerReport)

  const [delayMs, setDelayMs] = useState(300)
  const [stopOnFail, setStopOnFail] = useState(true)

  const options: CollectionRunnerOptions = { delayMs, stopOnFail }

  async function handleRun() {
    if (folderId) await runFolder(collectionId, folderId, options)
    else await runCollection(collectionId, options)
  }

  function handleClose(next: boolean) {
    if (!next) clearRunnerReport()
    onOpenChange(next)
  }

  const report = runner.report

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Run Collection</DialogTitle>
          <DialogDescription>
            {collectionName} · {scopeLabel}
          </DialogDescription>
        </DialogHeader>

        {!runner.isRunning && !report && (
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <span className="text-sm font-medium">Delay between requests (ms)</span>
              <Input
                id="delay"
                type="number"
                min={0}
                step={100}
                value={delayMs}
                onChange={(e) => setDelayMs(Math.max(0, Number(e.target.value) || 0))}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <p className="text-sm font-medium">Stop on failure</p>
                <p className="text-xs text-muted-foreground">Halt when a request or test fails</p>
              </div>
              <Switch checked={stopOnFail} onCheckedChange={setStopOnFail} />
            </div>
          </div>
        )}

        {runner.isRunning && (
          <div className="flex flex-col items-center gap-3 py-8">
            <Spinner size="lg" />
            <p className="text-sm text-muted-foreground">
              Running {runner.progress?.current ?? 0} / {runner.progress?.total ?? '…'}
              {runner.progress?.currentName ? ` — ${runner.progress.currentName}` : ''}
            </p>
            <Button variant="outline" size="sm" onClick={cancelRunner}>
              Stop
            </Button>
          </div>
        )}

        {report && !runner.isRunning && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2 text-center text-sm">
              <div className="rounded-lg border border-border p-2">
                <div className="text-lg font-semibold">{report.total}</div>
                <div className="text-xs text-muted-foreground">Total</div>
              </div>
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-2">
                <div className="text-lg font-semibold text-emerald-600">{report.passed}</div>
                <div className="text-xs text-muted-foreground">Passed</div>
              </div>
              <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-2">
                <div className="text-lg font-semibold text-red-600">{report.failed}</div>
                <div className="text-xs text-muted-foreground">Failed</div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Completed in {report.durationMs}ms{report.stoppedEarly ? ' · stopped early' : ''}
            </p>
            <ScrollArea className="h-56 rounded-lg border border-border">
              <div className="divide-y divide-border/60">
                {report.results.map((item) => (
                  <div key={item.requestId} className="flex items-start gap-2 px-3 py-2 text-xs">
                    {item.ok ? (
                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                    ) : (
                      <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">{item.requestName}</div>
                      <div className="text-muted-foreground">
                        {item.method} {item.status || '—'} · {item.timeMs}ms
                        {item.error ? ` · ${item.error}` : ''}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => handleClose(false)}>
            <X className="h-4 w-4" /> Close
          </Button>
          {!runner.isRunning && !report && (
            <Button onClick={() => void handleRun()}>
              <Play className="h-4 w-4" /> Run
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
