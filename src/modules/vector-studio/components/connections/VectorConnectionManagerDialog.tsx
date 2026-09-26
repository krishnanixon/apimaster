import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog'
import { VectorConnectionManagerPanel } from './VectorConnectionManagerPanel'

interface VectorConnectionManagerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function VectorConnectionManagerDialog({
  open,
  onOpenChange
}: VectorConnectionManagerDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(90vh,820px)] max-w-3xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b border-border px-6 py-4 pr-12">
          <DialogTitle>Vector Connection Manager</DialogTitle>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {open && <VectorConnectionManagerPanel />}
        </div>
      </DialogContent>
    </Dialog>
  )
}
