import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog'
import { VectorWorkspaceSettingsPanel } from './VectorWorkspaceSettingsPanel'

interface VectorWorkspaceSettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function VectorWorkspaceSettingsDialog({
  open,
  onOpenChange
}: VectorWorkspaceSettingsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Vector Workspace Settings</DialogTitle>
        </DialogHeader>
        {open && (
          <VectorWorkspaceSettingsPanel onSaved={() => onOpenChange(false)} />
        )}
      </DialogContent>
    </Dialog>
  )
}
