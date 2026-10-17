import { Cloud, HardDrive, Sparkles } from 'lucide-react'
import type { CodeScanEnrichEstimate } from '@shared/types/code-scanner'
import { Button } from '@/shared/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog'

interface EnrichDialogProps {
  estimate: CodeScanEnrichEstimate | null
  onCancel: () => void
  onConfirm: () => void
}

/** Consent step: shows the provider, what leaves the machine, and roughly what it costs. */
export function EnrichDialog({ estimate, onCancel, onConfirm }: EnrichDialogProps) {
  return (
    <Dialog open={Boolean(estimate)} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <Sparkles className="h-4 w-4 text-primary" />
            Enrich {estimate?.endpoints ?? 0} {estimate?.endpoints === 1 ? 'endpoint' : 'endpoints'} with AI
          </DialogTitle>
          <DialogDescription className="text-xs">
            Adds realistic example values, short descriptions and example responses. Fields the code doesn't mention are
            never added, and password/token values stay blank.
          </DialogDescription>
        </DialogHeader>

        {estimate && (
          <div className="space-y-3 text-xs">
            <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-2.5">
              {estimate.cloud ? <Cloud className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <HardDrive className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
              <div>
                <p className="font-medium">
                  {estimate.provider ?? 'No provider'}
                  {estimate.model ? <span className="font-normal text-muted-foreground"> · {estimate.model}</span> : null}
                </p>
                <p className="text-muted-foreground">
                  {estimate.cloud
                    ? `Code snippets are sent to ${[estimate.provider, estimate.fallbackProvider].filter(Boolean).join(', or if that fails, ')}. Secrets are redacted before sending.`
                    : 'Runs on your local model; nothing leaves this computer.'}
                </p>
              </div>
            </div>

            <div>
              <p className="mb-1 font-medium">Sent for each endpoint</p>
              <ul className="list-disc space-y-0.5 pl-4 text-muted-foreground">
                <li>Method, path and the fields the scanner detected</li>
                <li>Up to ~40 lines of code where the route is defined and one place it is called</li>
              </ul>
            </div>

            <p className="text-muted-foreground">
              About <span className="font-medium text-foreground">{estimate.approxTokens.toLocaleString()} tokens</span> in{' '}
              {estimate.batches} {estimate.batches === 1 ? 'request' : 'requests'}. Counts toward your daily AI budget if one is set.
            </p>

            {!estimate.ready && estimate.reason && (
              <p className="rounded-md border border-amber-200 bg-amber-50 p-2 text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-300">
                {estimate.reason}
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" size="sm" className="h-8" onClick={onCancel}>
            Cancel
          </Button>
          <Button size="sm" className="h-8" disabled={!estimate?.ready} onClick={onConfirm}>
            <Sparkles className="h-3.5 w-3.5" /> Enrich
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
