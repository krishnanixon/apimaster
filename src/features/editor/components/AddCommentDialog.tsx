import { useEffect, useState } from 'react'
import { Button } from '@/shared/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/shared/components/ui/dialog'
import { Textarea } from '@/shared/components/ui/textarea'

interface AddCommentDialogProps {
  open: boolean
  quote?: string
  onOpenChange: (open: boolean) => void
  onSubmit: (body: string) => void
}

export function AddCommentDialog({ open, quote, onOpenChange, onSubmit }: AddCommentDialogProps) {
  const [body, setBody] = useState('')

  useEffect(() => {
    if (open) setBody('')
  }, [open, quote])

  const handleSubmit = () => {
    const trimmed = body.trim()
    if (!trimmed) return
    onSubmit(trimmed)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add review comment</DialogTitle>
        </DialogHeader>
        {quote && (
          <blockquote className="rounded-md border-l-4 border-amber-400 bg-muted/40 px-3 py-2 text-sm italic text-muted-foreground">
            {quote}
          </blockquote>
        )}
        <Textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="Write your comment…"
          rows={4}
          autoFocus
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault()
              handleSubmit()
            }
          }}
        />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={!body.trim()}>
            Add comment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
