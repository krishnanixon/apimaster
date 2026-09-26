import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog'
import { ConnectionManagerPanel } from './ConnectionManagerPanel'

interface ConnectionManagerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ConnectionManagerDialog({ open, onOpenChange }: ConnectionManagerDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(92vh,880px)] max-w-5xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b border-border px-6 py-4 pr-12">
          <DialogTitle>Connection Manager</DialogTitle>
          <p className="text-xs text-muted-foreground">SQL, document (MongoDB) and file databases — with SSL and SSH tunnelling.</p>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {open && <ConnectionManagerPanel />}
        </div>
      </DialogContent>
    </Dialog>
  )
}
