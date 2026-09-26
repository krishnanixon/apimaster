import { useCallback, useEffect, useRef, useState } from 'react'
import { FileJson, Terminal, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/shared/components/ui/button'
import { Textarea } from '@/shared/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/components/ui/tabs'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog'
import { cn } from '@/shared/lib/utils'
import { useApiStudioStore } from '../stores/apiStudioStore'
import { POSTMAN_COLLECTION_FILTER } from '../services/collectionFile'

type ImportTab = 'file' | 'collection' | 'curl'

interface ImportCollectionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImported?: (collectionId: string) => void
  defaultTab?: ImportTab
}

function looksLikeCurl(text: string): boolean {
  return /^\s*curl\s/i.test(text)
}

export function ImportCollectionDialog({
  open,
  onOpenChange,
  onImported,
  defaultTab = 'file'
}: ImportCollectionDialogProps) {
  const importCollection = useApiStudioStore((s) => s.importCollection)
  const importCurlAsTab = useApiStudioStore((s) => s.importCurlAsTab)
  const [json, setJson] = useState('')
  const [curl, setCurl] = useState('')
  const [tab, setTab] = useState<ImportTab>(defaultTab)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const submittedRef = useRef(false)

  useEffect(() => {
    if (open) {
      submittedRef.current = false
      setJson('')
      setCurl('')
      setTab(defaultTab)
      setDragOver(false)
    }
  }, [open, defaultTab])

  const importCurl = useCallback(
    (text: string) => {
      if (submittedRef.current || !text.trim()) return
      if (!looksLikeCurl(text)) {
        toast.error('Paste a cURL command starting with curl')
        return
      }
      submittedRef.current = true
      const ok = importCurlAsTab(text)
      if (ok) {
        setCurl('')
        onOpenChange(false)
      } else {
        submittedRef.current = false
      }
    },
    [importCurlAsTab, onOpenChange]
  )

  const importJson = useCallback(
    (text: string) => {
      if (submittedRef.current || !text.trim()) return
      if (looksLikeCurl(text)) {
        importCurl(text)
        return
      }
      submittedRef.current = true
      const collectionId = importCollection(text)
      if (collectionId) {
        onImported?.(collectionId)
        setJson('')
        onOpenChange(false)
      } else {
        submittedRef.current = false
      }
    },
    [importCollection, importCurl, onImported, onOpenChange]
  )

  async function readFile(file: File) {
    const text = await file.text()
    if (looksLikeCurl(text)) {
      setCurl(text)
      setTab('curl')
      return
    }
    if (!file.name.toLowerCase().endsWith('.json') && file.type && !file.type.includes('json') && !file.name.match(/\.(txt|sh|curl)$/i)) {
      toast.error('Please choose a Postman JSON file or a cURL command file')
      return
    }
    setJson(text)
    setTab('collection')
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) void readFile(file)
  }

  function handleImport() {
    if (tab === 'curl') importCurl(curl)
    else importJson(json)
  }

  const canImport = tab === 'curl' ? Boolean(curl.trim()) : Boolean(json.trim())

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl gap-0 p-0">
        <DialogHeader className="border-b border-border/60 px-5 py-4">
          <DialogTitle>Import</DialogTitle>
          <p className="text-xs text-muted-foreground">
            Import a Postman collection or a single cURL command as a new request.
          </p>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as ImportTab)} className="px-5 pt-3">
          <TabsList className="h-8 w-full justify-start rounded-none border-b border-border/60 bg-transparent p-0">
            <TabsTrigger
              value="file"
              className="h-8 rounded-none border-b-2 border-transparent px-3 text-xs data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none"
            >
              File
            </TabsTrigger>
            <TabsTrigger
              value="collection"
              className="h-8 rounded-none border-b-2 border-transparent px-3 text-xs data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none"
            >
              Collection
            </TabsTrigger>
            <TabsTrigger
              value="curl"
              className="h-8 rounded-none border-b-2 border-transparent px-3 text-xs data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none"
            >
              cURL
            </TabsTrigger>
          </TabsList>

          <TabsContent value="file" className="mt-4 space-y-3 pb-2">
            <div
              onDragOver={(e) => {
                e.preventDefault()
                setDragOver(true)
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              className={cn(
                'flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors',
                dragOver ? 'border-primary bg-primary/5' : 'border-border/80 bg-muted/20'
              )}
            >
              <Upload className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm font-medium">Drop a collection or cURL file</p>
              <p className="text-xs text-muted-foreground">or</p>
              <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                <FileJson className="h-3.5 w-3.5" />
                Choose files
              </Button>
              <p className="text-[11px] text-muted-foreground">
                {POSTMAN_COLLECTION_FILTER.name} (.json) · cURL (.txt, .sh)
              </p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,.txt,.sh,.curl,application/json,text/plain"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void readFile(file)
              }}
            />
          </TabsContent>

          <TabsContent value="collection" className="mt-4 space-y-2 pb-2">
            <Textarea
              value={json}
              onChange={(e) => setJson(e.target.value)}
              placeholder='Paste Postman Collection v2.1 JSON — e.g. { "info": { "name": "My API" }, "item": [...] }'
              rows={12}
              className="font-mono text-xs"
            />
          </TabsContent>

          <TabsContent value="curl" className="mt-4 space-y-2 pb-2">
            <div className="flex items-start gap-2 rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground">
              <Terminal className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Opens as a new request tab. You can save it into a collection afterward.
            </div>
            <Textarea
              value={curl}
              onChange={(e) => setCurl(e.target.value)}
              placeholder={`curl -X POST https://api.example.com/login \\
  -H 'Content-Type: application/json' \\
  -H 'Authorization: Bearer token' \\
  -d '{"email":"you@example.com","password":"secret"}'`}
              rows={10}
              className="font-mono text-xs"
            />
          </TabsContent>
        </Tabs>

        <DialogFooter className="border-t border-border/60 px-5 py-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleImport} disabled={!canImport}>
            {tab === 'curl' ? 'Import request' : 'Import'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
