import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Copy, Download } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog'
import { Button } from '@/shared/components/ui/button'
import { Switch } from '@/shared/components/ui/switch'
import { cn } from '@/shared/lib/utils'
import { writeClipboardText } from '@/shared/lib/clipboard'
import {
  exportRequest,
  REQUEST_EXPORT_FORMATS,
  requestExportFormat,
  saveRequestExport,
  type RequestExportFormat
} from '../services/requestExport'
import type { ApiCollection, ApiRequest } from '../types/api.types'

interface RequestExportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  request: ApiRequest | null
  collection?: ApiCollection | null
  defaultFormat?: RequestExportFormat
}

const CODE_FORMATS = REQUEST_EXPORT_FORMATS.filter((f) => f.kind === 'code')
const FILE_FORMATS = REQUEST_EXPORT_FORMATS.filter((f) => f.kind === 'file')

/** Export one request: copy it as code, or save it as a file another tool can import. */
export function RequestExportDialog({ open, onOpenChange, request, collection, defaultFormat = 'curl' }: RequestExportDialogProps) {
  const [format, setFormat] = useState<RequestExportFormat>(defaultFormat)
  const [redactSecrets, setRedactSecrets] = useState(false)

  useEffect(() => {
    if (open) setFormat(defaultFormat)
  }, [open, defaultFormat])

  const output = useMemo(() => {
    if (!request) return { text: '', error: null as string | null }
    try {
      return { text: exportRequest(request, format, collection, { redactSecrets }), error: null }
    } catch (e) {
      return { text: '', error: e instanceof Error ? e.message : 'Unable to export this request' }
    }
  }, [request, format, collection, redactSecrets])

  const info = requestExportFormat(format)

  function handleCopy() {
    if (!output.text) return
    void writeClipboardText(output.text)
      .then(() => toast.success(`${info.label} copied`))
      .catch(() => toast.error('Could not copy to clipboard'))
  }

  async function handleSave() {
    if (!request || !output.text) return
    try {
      if (await saveRequestExport(request, format, output.text)) toast.success(`Request exported as ${info.label}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Export failed')
    }
  }

  function FormatButton({ id, label, hint }: { id: RequestExportFormat; label: string; hint?: string }) {
    return (
      <button
        type="button"
        title={hint}
        onClick={() => setFormat(id)}
        className={cn(
          'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
          format === id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent hover:text-foreground'
        )}
      >
        {label}
      </button>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Export request</DialogTitle>
          <DialogDescription className="truncate">
            {request ? `${request.method} ${request.name}` : ''} — inherited auth and headers are included.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <div className="flex items-baseline gap-2">
            <span className="w-10 shrink-0 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Code</span>
            <div className="flex flex-wrap gap-1">
              {CODE_FORMATS.map((f) => (
                <FormatButton key={f.id} id={f.id} label={f.label} hint={f.hint} />
              ))}
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="w-10 shrink-0 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">File</span>
            <div className="flex flex-wrap gap-1">
              {FILE_FORMATS.map((f) => (
                <FormatButton key={f.id} id={f.id} label={f.label} hint={f.hint} />
              ))}
            </div>
          </div>
        </div>

        {output.error ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">{output.error}</div>
        ) : (
          <pre className="max-h-[380px] min-h-[160px] overflow-auto whitespace-pre-wrap break-all rounded-lg border border-border bg-muted/40 p-3 font-mono text-xs leading-relaxed">
            {output.text}
          </pre>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
            <Switch checked={redactSecrets} onCheckedChange={setRedactSecrets} />
            Hide tokens and passwords
          </label>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleCopy} disabled={!output.text}>
              <Copy className="h-3.5 w-3.5" /> Copy
            </Button>
            <Button size="sm" onClick={() => void handleSave()} disabled={!output.text}>
              <Download className="h-3.5 w-3.5" /> Save file
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
