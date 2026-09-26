import { useState } from 'react'
import type { Editor } from '@tiptap/react'
import { ImageIcon, Upload } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/shared/components/ui/dialog'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { insertImageFromFile, insertImageFromUrl } from '@/features/editor/lib/insert-media'

interface InsertImageDialogProps {
  editor: Editor
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function InsertImageDialog({ editor, open, onOpenChange }: InsertImageDialogProps) {
  const [url, setUrl] = useState('')

  const handleUpload = () => {
    insertImageFromFile(editor)
    onOpenChange(false)
  }

  const handleApplyUrl = () => {
    insertImageFromUrl(editor, url)
    setUrl('')
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ImageIcon className="h-4 w-4" />
            Insert image
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <Button type="button" variant="outline" className="w-full justify-start" onClick={handleUpload}>
            <Upload className="h-4 w-4" />
            Upload from computer
          </Button>
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">or paste URL</span>
            </div>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="image-url" className="text-sm font-medium">
              Image URL
            </label>
            <Input
              id="image-url"
              placeholder="https://example.com/image.png"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleApplyUrl()}
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleApplyUrl} disabled={!url.trim()}>
            Insert
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
