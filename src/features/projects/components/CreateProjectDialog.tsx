import { Input } from '@/shared/components/ui/input'
import { Textarea } from '@/shared/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/shared/components/ui/dialog'
import { Button } from '@/shared/components/ui/button'

export function CreateProjectDialog({
  open,
  onOpenChange,
  name,
  description,
  onNameChange,
  onDescriptionChange,
  onCreate,
  creating
}: {
  open: boolean
  onOpenChange: (value: boolean) => void
  name: string
  description: string
  onNameChange: (value: string) => void
  onDescriptionChange: (value: string) => void
  onCreate: () => void
  creating: boolean
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Project</DialogTitle>
          <DialogDescription>Create a workspace for requirements, knowledge, and delivery.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <label className="block space-y-1.5">
            <span className="text-xs font-medium">Name</span>
            <Input
              value={name}
              onChange={(event) => onNameChange(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && onCreate()}
              placeholder="e.g. Customer Portal"
              autoFocus
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium">Description</span>
            <Textarea
              value={description}
              onChange={(event) => onDescriptionChange(event.target.value)}
              rows={3}
              placeholder="What is this project about?"
            />
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onCreate} disabled={!name.trim() || creating}>
            {creating ? 'Creating…' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
