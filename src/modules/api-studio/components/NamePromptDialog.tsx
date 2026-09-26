import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/shared/components/ui/dialog'

interface NamePromptDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  initialValue?: string
  confirmLabel?: string
  onSubmit: (value: string) => void
}

export function NamePromptDialog({
  open,
  onOpenChange,
  title,
  description,
  initialValue = '',
  confirmLabel = 'Create',
  onSubmit
}: NamePromptDialogProps) {
  const [value, setValue] = useState(initialValue)
  const submittedRef = useRef(false)

  useEffect(() => {
    if (open) {
      setValue(initialValue)
      submittedRef.current = false
    }
  }, [open, initialValue])

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    // Guards against duplicate creation from a double Enter/click firing the
    // form's submit handler more than once before the dialog closes.
    if (submittedRef.current) return
    const trimmed = value.trim()
    if (!trimmed) return
    submittedRef.current = true
    onOpenChange(false)
    onSubmit(trimmed)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
          <Input autoFocus value={value} onChange={(e) => setValue(e.target.value)} className="mt-4" placeholder="Name" />
          <DialogFooter className="mt-5">
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={!value.trim()}>
              {confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
