import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog'
import { DbWorkspaceSettingsPanel } from './DbWorkspaceSettingsPanel'

interface DbWorkspaceSettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function DbWorkspaceSettingsDialog({ open, onOpenChange }: DbWorkspaceSettingsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(90vh,820px)] max-w-lg flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b border-border px-6 py-4 pr-12">
          <DialogTitle>Database Workbench Settings</DialogTitle>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {open && <DbWorkspaceSettingsPanel onSaved={() => onOpenChange(false)} />}
        </div>
      </DialogContent>
    </Dialog>
  )
}
