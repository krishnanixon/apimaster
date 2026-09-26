import { useMemo, useState } from 'react'
import type { Document } from '@shared/types'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from '@/shared/components/ui/dialog'
import { DOCUMENT_TYPE_LABELS } from '@/shared/lib/utils'
import { getDocumentDisplayHtml } from '@/shared/lib/html-utils'

export function InsertFromDocumentDialog({
  open,
  onOpenChange,
  documents,
  currentId,
  onInsert
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  documents: Document[]
  currentId?: string
  onInsert: (html: string, title: string) => void
}) {
  const [query, setQuery] = useState('')
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return documents.filter((doc) => {
      if (doc.id === currentId) return false
      if (!q) return true
      return (
        doc.title.toLowerCase().includes(q) ||
        (DOCUMENT_TYPE_LABELS[doc.type] ?? doc.type).toLowerCase().includes(q)
      )
    })
  }, [documents, currentId, query])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Insert from another document</DialogTitle>
        </DialogHeader>
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search documents…"
          className="h-8 text-xs"
        />
        <div className="max-h-72 space-y-1 overflow-y-auto">
          {filtered.map((doc) => (
            <div
              key={doc.id}
              className="flex items-center justify-between gap-2 rounded-md border border-border/70 px-2 py-1.5"
            >
              <div className="min-w-0">
                <p className="truncate text-xs font-medium">{doc.title}</p>
                <p className="text-[10px] text-muted-foreground">
                  {DOCUMENT_TYPE_LABELS[doc.type] ?? doc.type}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-7 shrink-0 text-[11px]"
                onClick={() => {
                  onInsert(getDocumentDisplayHtml(doc), doc.title)
                  onOpenChange(false)
                }}
              >
                Insert
              </Button>
            </div>
          ))}
          {filtered.length === 0 && (
            <p className="py-6 text-center text-xs text-muted-foreground">No other documents</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
