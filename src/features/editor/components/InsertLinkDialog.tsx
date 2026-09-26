import { useEffect, useState } from 'react'
import type { Editor } from '@tiptap/react'
import { Link2, Unlink } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/shared/components/ui/dialog'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { removeEditorLink, setEditorLink } from '@/features/editor/lib/insert-media'

interface InsertLinkDialogProps {
  editor: Editor
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function InsertLinkDialog({ editor, open, onOpenChange }: InsertLinkDialogProps) {
  const [url, setUrl] = useState('')
  const [text, setText] = useState('')

  useEffect(() => {
    if (!open) return
    const prev = (editor.getAttributes('link').href as string) || ''
    const { from, to } = editor.state.selection
    const selected = from !== to ? editor.state.doc.textBetween(from, to, ' ') : ''
    setUrl(prev)
    setText(selected)
  }, [editor, open])

  const handleApply = () => {
    setEditorLink(editor, url, text)
    onOpenChange(false)
  }

  const handleRemove = () => {
    removeEditorLink(editor)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-4 w-4" />
            Insert link
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div className="space-y-1.5">
            <label htmlFor="link-url" className="text-sm font-medium">
              URL, email, or bookmark
            </label>
            <Input
              id="link-url"
              placeholder="https://…  ·  name@company.com  ·  #section"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleApply()}
              autoFocus
            />
            <p className="text-[11px] text-muted-foreground">
              Web links, mailto addresses, and #heading bookmarks are supported.
            </p>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="link-text" className="text-sm font-medium">
              Display text (optional)
            </label>
            <Input
              id="link-text"
              placeholder="Link label"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleApply()}
            />
          </div>
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          {editor.isActive('link') ? (
            <Button type="button" variant="outline" size="sm" onClick={handleRemove}>
              <Unlink className="h-4 w-4" />
              Remove link
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={handleApply} disabled={!url.trim()}>
              Apply
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
