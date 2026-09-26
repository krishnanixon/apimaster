import { useMemo, useState } from 'react'
import { Copy, Download, Search, Code2, FileText, Eye } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { cn } from '@/shared/lib/utils'
import { JsonTreeView } from './JsonTreeView'
import { RequestCodeEditor } from '../RequestCodeEditor'
import { downloadBlob } from '../../services/download'
import type { ApiExecutionResult } from '../../types/api.types'

type ViewMode = 'pretty' | 'raw' | 'preview'

export function ResponseBodyView({ response }: { response: ApiExecutionResult }) {
  const isJson = response.contentType.includes('json')
  const isHtml = response.contentType.includes('html')
  const [mode, setMode] = useState<ViewMode>(isHtml ? 'preview' : 'pretty')
  const [search, setSearch] = useState('')

  const rawJsonText = useMemo(() => {
    if (!isJson || response.isBinary) return response.data
    try {
      return JSON.stringify(JSON.parse(response.data), null, 2)
    } catch {
      return response.data
    }
  }, [isJson, response.data, response.isBinary])

  const parsedJson = useMemo(() => {
    if (!isJson || response.isBinary) return undefined
    try {
      return JSON.parse(response.data)
    } catch {
      return undefined
    }
  }, [isJson, response.data, response.isBinary])

  function handleCopy() {
    navigator.clipboard.writeText(mode === 'raw' && isJson ? rawJsonText : response.data)
    toast.success('Response copied')
  }

  function handleDownload() {
    if (response.isBinary && response.dataBase64) {
      const bytes = Uint8Array.from(atob(response.dataBase64), (c) => c.charCodeAt(0))
      downloadBlob(bytes, 'response', response.contentType || 'application/octet-stream')
    } else {
      const content = isJson ? rawJsonText : response.data
      downloadBlob(content, 'response.json', response.contentType || 'application/json')
    }
  }

  if (response.isBinary) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm text-muted-foreground">
          Binary response ({response.contentType || 'unknown type'}, {response.sizeBytes.toLocaleString()} bytes)
        </p>
        <Button size="sm" variant="outline" onClick={handleDownload}>
          <Download className="h-3.5 w-3.5" /> Download response
        </Button>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-1.5 border-b border-border/60 px-3 py-1.5">
        {isJson && (
          <ModeButton icon={<Code2 className="h-3 w-3" />} active={mode === 'pretty'} onClick={() => setMode('pretty')} label="Tree" />
        )}
        <ModeButton icon={<FileText className="h-3 w-3" />} active={mode === 'raw'} onClick={() => setMode('raw')} label="JSON" />
        {isHtml && (
          <ModeButton icon={<Eye className="h-3 w-3" />} active={mode === 'preview'} onClick={() => setMode('preview')} label="Preview" />
        )}

        <div className="ml-auto flex items-center gap-1.5">
          {mode === 'pretty' && (
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter keys"
                className="h-7 w-32 pl-6 text-xs"
              />
            </div>
          )}
          <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={handleCopy} title="Copy response">
            <Copy className="h-3.5 w-3.5" />
            Copy
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleDownload} title="Download response">
            <Download className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden p-3">
        {mode === 'pretty' && parsedJson !== undefined && (
          <div className="h-full overflow-auto rounded-lg border border-border/60 bg-muted/20 p-3">
            <JsonTreeView data={parsedJson} search={search} />
          </div>
        )}
        {mode === 'pretty' && parsedJson === undefined && (
          <p className="text-xs text-muted-foreground">Response is not valid JSON — switch to JSON view for raw text.</p>
        )}
        {mode === 'raw' && (
          <RequestCodeEditor
            value={isJson ? rawJsonText : response.data}
            languageFile={isJson ? 'response.json' : 'response.txt'}
            label={isJson ? 'JSON' : 'Response'}
            readOnly
            showCopy
            className="h-full min-h-0"
          />
        )}
        {mode === 'preview' && isHtml && (
          <iframe
            title="Response preview"
            sandbox=""
            srcDoc={response.data}
            className="h-full w-full rounded-lg border border-border bg-background"
          />
        )}
      </div>
    </div>
  )
}

function ModeButton({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors',
        active ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/60'
      )}
    >
      {icon}
      {label}
    </button>
  )
}
