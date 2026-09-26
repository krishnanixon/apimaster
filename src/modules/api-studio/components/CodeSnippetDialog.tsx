import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Copy } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog'
import { Button } from '@/shared/components/ui/button'
import { cn } from '@/shared/lib/utils'
import { writeClipboardText } from '@/shared/lib/clipboard'
import { generateSnippet, SNIPPET_LANGUAGES, type SnippetLanguage } from '../services/codeGenerator'
import type { ApiCollection, ApiRequest } from '../types/api.types'

interface CodeSnippetDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  request: ApiRequest
  collection?: ApiCollection | null
}

export function CodeSnippetDialog({ open, onOpenChange, request, collection }: CodeSnippetDialogProps) {
  const [language, setLanguage] = useState<SnippetLanguage>('curl')

  const snippet = useMemo(() => {
    try {
      return generateSnippet(request, language, collection)
    } catch {
      return '// Unable to generate snippet for this request'
    }
  }, [request, language, collection])

  function handleCopy() {
    void writeClipboardText(snippet)
      .then(() => toast.success('Snippet copied'))
      .catch(() => toast.error('Could not copy snippet'))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Code Snippet</DialogTitle>
        </DialogHeader>

        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1">
            {SNIPPET_LANGUAGES.map((lang) => (
              <button
                key={lang.id}
                onClick={() => setLanguage(lang.id)}
                className={cn(
                  'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                  language === lang.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent'
                )}
              >
                {lang.label}
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={handleCopy}>
            <Copy className="h-3.5 w-3.5" /> Copy
          </Button>
        </div>

        <pre className="max-h-[420px] overflow-auto rounded-lg border border-border bg-muted/40 p-3 font-mono text-xs leading-relaxed">
          {snippet}
        </pre>
      </DialogContent>
    </Dialog>
  )
}
