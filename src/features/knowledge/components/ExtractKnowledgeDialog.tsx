import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/shared/components/ui/dialog'
import { Button } from '@/shared/components/ui/button'
import { Textarea } from '@/shared/components/ui/textarea'
import { Sparkles, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { WordFileDropZone } from '@/features/documents/components/WordFileDropZone'

interface ExtractKnowledgeDialogProps {
  projectId: string
  onExtract: (text: string) => Promise<unknown>
  isExtracting: boolean
}

export function ExtractKnowledgeDialog({
  onExtract,
  isExtracting
}: ExtractKnowledgeDialogProps) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [sourceFilePath, setSourceFilePath] = useState('')

  const handleExtract = async () => {
    if (!text.trim()) {
      toast.error('Paste a description or import a PDF / Word file first')
      return
    }
    const ok = await onExtract(text)
    if (ok) {
      toast.success('Knowledge extracted and saved')
      setOpen(false)
      setText('')
      setSourceFilePath('')
    } else {
      toast.error('Extraction failed. Check your API key.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1.5">
          <Sparkles className="h-3.5 w-3.5" />
          Extract Knowledge
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Extract Knowledge from Text</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Paste a project description or import a PDF / Word document. AI will pull out basics, modules,
          and requirements.
        </p>
        <WordFileDropZone
          description="Drop a PDF or Word (.docx) file to fill the description. You can still edit the text after import."
          onSavingLabel="Filling description…"
          onImported={(source) => {
            setSourceFilePath(source.savedFilePath ?? '')
            setText((prev) => {
              const chunk = source.text.trim()
              if (!prev.trim()) return chunk
              return `${prev.trim()}\n\n${chunk}`
            })
            const pages =
              source.kind === 'pdf' && source.pageCount
                ? ` (${source.pageCount} page${source.pageCount === 1 ? '' : 's'})`
                : ''
            toast.success(`Imported ${source.fileName}${pages}`)
          }}
        />
        {sourceFilePath && (
          <div className="flex items-center justify-between gap-3 rounded-md border border-border/60 bg-muted/30 px-2.5 py-2 text-xs">
            <span className="min-w-0 truncate text-muted-foreground">Original preserved with charts and layout</span>
            <Button variant="outline" size="sm" className="h-7 shrink-0" onClick={() => void window.electronAPI.export.openPath(sourceFilePath)}>
              Open original
            </Button>
          </div>
        )}
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Describe the product, users, and what should be built… or import a PDF / Word file above."
          className="min-h-[160px] resize-none text-sm"
        />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={() => void handleExtract()} disabled={isExtracting}>
            {isExtracting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Extracting...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Extract & Save
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
