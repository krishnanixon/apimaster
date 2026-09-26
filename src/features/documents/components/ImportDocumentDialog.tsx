import { useRef, useState } from 'react'
import { FileUp, Loader2 } from 'lucide-react'
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
import { DOCUMENT_TYPE_LABELS, cn } from '@/shared/lib/utils'
import { WordFileDropZone } from '@/features/documents/components/WordFileDropZone'
import type { DocumentStyle, DocumentType } from '@shared/types'
import { toast } from 'sonner'

interface ImportDocumentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  creating?: boolean
  onImport: (input: {
    title: string
    type: DocumentType
    style: DocumentStyle
    htmlContent: string
    sourceFilePath?: string
  }) => Promise<{ success: boolean; error?: string }>
}

export function ImportDocumentDialog({
  open,
  onOpenChange,
  creating = false,
  onImport
}: ImportDocumentDialogProps) {
  const [fileName, setFileName] = useState('')
  const [html, setHtml] = useState('')
  const [title, setTitle] = useState('')
  const [type, setType] = useState<DocumentType>('requirements')
  const [sourceFilePath, setSourceFilePath] = useState('')
  const previewRef = useRef('')

  const reset = () => {
    setFileName('')
    setHtml('')
    setTitle('')
    setType('requirements')
    setSourceFilePath('')
    previewRef.current = ''
  }

  const handleSubmit = async () => {
    if (!html.trim()) {
      toast.error('Choose a PDF, Word, Markdown, HTML, or JSON file first')
      return
    }
    const result = await onImport({
      title: title.trim() || fileName.replace(/\.[^.]+$/, ''),
      type,
      style: 'professional',
      htmlContent: html,
      sourceFilePath: sourceFilePath || undefined
    })
    if (result.success) {
      reset()
      onOpenChange(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) reset()
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm">Import document</DialogTitle>
          <DialogDescription className="text-xs">
            Import a PDF or Word (.docx) file, or Markdown / HTML / JSON. Drag and drop is supported.
            PDFs become editable documents and the original file is saved automatically in your system Documents folder.
          </DialogDescription>
        </DialogHeader>

        <WordFileDropZone
          description="Drop a .pdf or .docx file here to bring its contents into this project."
          onSavingLabel="Ready to import…"
          onImported={(source) => {
            setFileName(source.fileName)
            setTitle(source.title)
            setHtml(source.html)
            setSourceFilePath(source.savedFilePath ?? '')
            previewRef.current = source.text
          }}
        />

        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Document title"
          className="h-8 text-sm"
        />

        <select
          value={type}
          onChange={(e) => setType(e.target.value as DocumentType)}
          className="h-8 rounded-md border border-input bg-background px-2 text-xs outline-none"
        >
          {Object.entries(DOCUMENT_TYPE_LABELS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>

        {html ? (
          <div className="rounded-md bg-muted/40 px-2 py-1.5 text-[11px] text-muted-foreground">
            <p className={cn('line-clamp-2')}>
              Ready to import {fileName ? `${fileName}: ` : ''}
              {previewRef.current.slice(0, 140) || html.replace(/<[^>]+>/g, ' ').trim().slice(0, 140) || 'content'}.
            </p>
            {sourceFilePath && <p className="mt-1 font-medium text-foreground/70">Original preserved for exact charts and layout.</p>}
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" size="sm" className="h-8" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" className="h-8" disabled={creating || !html} onClick={() => void handleSubmit()}>
            {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileUp className="h-3.5 w-3.5" />}
            Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
