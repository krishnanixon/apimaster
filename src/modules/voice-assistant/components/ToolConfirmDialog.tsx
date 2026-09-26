import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/shared/components/ui/dialog'
import { Button } from '@/shared/components/ui/button'
import { Badge } from '@/shared/components/ui/badge'
import type { VoicePendingConfirmation, VoiceToolRiskLevel } from '@shared/types/voice-assistant'

const RISK_LABEL: Record<VoiceToolRiskLevel, string> = {
  read: 'Read',
  write: 'Write',
  destructive: 'Destructive'
}

const RISK_VARIANT: Record<VoiceToolRiskLevel, 'secondary' | 'warning' | 'destructive'> = {
  read: 'secondary',
  write: 'warning',
  destructive: 'destructive'
}

function formatValue(value: unknown): string {
  if (value == null) return '—'
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

export function ToolConfirmDialog({
  pending,
  onResolve
}: {
  pending: VoicePendingConfirmation | null
  onResolve: (approved: boolean) => void
}) {
  const entries = pending ? Object.entries(pending.input).filter(([, value]) => value != null && value !== '') : []

  return (
    <Dialog open={Boolean(pending)} onOpenChange={(open) => !open && onResolve(false)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Allow this action?</DialogTitle>
          <DialogDescription>
            {pending?.message || 'The assistant wants to run a tool. Confirm to continue.'}
          </DialogDescription>
        </DialogHeader>
        {pending && (
          <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium capitalize">{pending.toolName.replace(/_/g, ' ')}</p>
              <Badge variant={RISK_VARIANT[pending.riskLevel]}>{RISK_LABEL[pending.riskLevel]}</Badge>
            </div>
            {pending.description && (
              <p className="text-xs leading-relaxed text-muted-foreground">{pending.description}</p>
            )}
            {entries.length > 0 && (
              <dl className="space-y-1.5 text-xs">
                {entries.map(([key, value]) => (
                  <div key={key} className="grid grid-cols-[88px_minmax(0,1fr)] gap-2">
                    <dt className="truncate text-muted-foreground">{key}</dt>
                    <dd className="break-words font-medium">{formatValue(value)}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onResolve(false)}>
            Don’t allow
          </Button>
          <Button
            variant={pending?.riskLevel === 'destructive' ? 'destructive' : 'default'}
            onClick={() => onResolve(true)}
          >
            Allow
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
