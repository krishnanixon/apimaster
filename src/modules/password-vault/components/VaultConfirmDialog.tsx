import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/shared/components/ui/dialog'
import { Button } from '@/shared/components/ui/button'

export type VaultConfirmAction =
  | { type: 'archive-item'; id: string; title: string }
  | { type: 'trash-item'; id: string; title: string }
  | { type: 'delete-item'; id: string; title: string }
  | { type: 'delete-folder'; id: string; name: string }

interface VaultConfirmDialogProps {
  action: VaultConfirmAction | null
  onClose: () => void
  onConfirm: (action: VaultConfirmAction) => void | Promise<void>
}

function copyForAction(action: VaultConfirmAction): {
  title: string
  description: string
  confirmLabel: string
  destructive: boolean
} {
  switch (action.type) {
    case 'archive-item':
      return {
        title: 'Archive credential?',
        description: `"${action.title}" will be moved to Archive. You can restore it later.`,
        confirmLabel: 'Archive',
        destructive: false
      }
    case 'trash-item':
      return {
        title: 'Move to trash?',
        description: `"${action.title}" will be moved to Trash. You can restore or permanently delete it from there.`,
        confirmLabel: 'Move to trash',
        destructive: true
      }
    case 'delete-item':
      return {
        title: 'Delete permanently?',
        description: `"${action.title}" will be permanently deleted. This cannot be undone.`,
        confirmLabel: 'Delete permanently',
        destructive: true
      }
    case 'delete-folder':
      return {
        title: 'Delete folder?',
        description: `"${action.name}" will be removed. Credentials in this folder are not deleted.`,
        confirmLabel: 'Delete folder',
        destructive: true
      }
  }
}

export function VaultConfirmDialog({ action, onClose, onConfirm }: VaultConfirmDialogProps) {
  const copy = action ? copyForAction(action) : null

  return (
    <Dialog open={Boolean(action)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{copy?.title}</DialogTitle>
          <DialogDescription>{copy?.description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant={copy?.destructive ? 'destructive' : 'default'}
            onClick={() => action && void onConfirm(action)}
          >
            {copy?.confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
