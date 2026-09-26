import { useState, useEffect } from 'react'
import { LayoutTemplate } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/shared/components/ui/dialog'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Textarea } from '@/shared/components/ui/textarea'
import { saveTemplate } from '@/features/documents/templates/saved-templates'
import { toast } from 'sonner'
import type { DocumentStyle, DocumentType } from '@shared/types'

interface SaveTemplateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  htmlContent: string
  type: DocumentType
  style: DocumentStyle
  defaultName?: string
  sections?: string[]
  onSaved?: () => void
}

export function SaveTemplateDialog({
  open,
  onOpenChange,
  htmlContent,
  type,
  style,
  defaultName = '',
  sections = [],
  onSaved
}: SaveTemplateDialogProps) {
  const [name, setName] = useState(defaultName)
  const [description, setDescription] = useState('')

  useEffect(() => {
    if (open) {
      setName(defaultName)
      setDescription('')
    }
  }, [open, defaultName])

  const handleSave = () => {
    const trimmed = name.trim()
    if (!trimmed) {
      toast.error('Please enter a template name')
      return
    }
    saveTemplate({
      name: trimmed,
      description: description.trim() || `Custom template based on ${type.replace(/_/g, ' ')}`,
      type,
      style,
      htmlContent,
      sections
    })
    toast.success('Template saved')
    onOpenChange(false)
    setName('')
    setDescription('')
    onSaved?.()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LayoutTemplate className="h-5 w-5 text-primary" />
            Save as Template
          </DialogTitle>
          <DialogDescription>
            Save this document structure as a reusable template for future projects.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div>
            <label className="mb-1.5 block text-xs font-medium">Template name</label>
            <Input
              placeholder="e.g. Enterprise BRD Template"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium">Description (optional)</label>
            <Textarea
              placeholder="Describe when to use this template..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="resize-none"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave}>
            <LayoutTemplate className="h-4 w-4" /> Save Template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
