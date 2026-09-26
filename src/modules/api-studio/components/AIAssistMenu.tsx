import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import {
  Sparkles,
  Wand2,
  MessageSquareText,
  TestTube2,
  Terminal,
  Wrench,
  Braces,
  FileCode2,
  ShieldAlert,
  Variable,
  Plus,
  StickyNote
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/shared/components/ui/dropdown-menu'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog'
import { Button } from '@/shared/components/ui/button'
import { Textarea } from '@/shared/components/ui/textarea'
import { Spinner } from '@/shared/components/ui/spinner'
import { ScrollArea } from '@/shared/components/ui/scroll-area'
import { useApiStudioStore } from '../stores/apiStudioStore'
import { useApiStudioAi } from '../hooks/useApiStudioAi'

interface AIAssistMenuProps {
  tabId: string
  compact?: boolean
}

export function AIAssistMenu({ tabId, compact = false }: AIAssistMenuProps) {
  const importCurlAsTab = useApiStudioStore((s) => s.importCurlAsTab)
  const ai = useApiStudioAi(tabId)

  const [dialog, setDialog] = useState<'generate' | 'curl' | 'markdown' | null>(null)
  const [prompt, setPrompt] = useState('')
  const [curl, setCurl] = useState('')
  const [asNewTab, setAsNewTab] = useState(true)
  const [markdownTitle, setMarkdownTitle] = useState('AI result')
  const [markdown, setMarkdown] = useState('')

  if (!ai.tab) return null

  const hasResponse = Boolean(ai.tab.response)
  const hasError = Boolean(ai.tab.response && (!ai.tab.response.ok || ai.tab.response.error))
  const hasUrl = Boolean(ai.tab.request.url.trim())

  async function handleGenerate() {
    if (!prompt.trim()) return
    await ai.generateFromText(prompt, asNewTab)
    setDialog(null)
    setPrompt('')
  }

  function handleImportCurl() {
    if (!curl.trim()) return
    if (importCurlAsTab(curl)) {
      setDialog(null)
      setCurl('')
    }
  }

  async function openMarkdown(title: string, loader: () => Promise<string | null>) {
    setMarkdownTitle(title)
    setMarkdown('')
    setDialog('markdown')
    const text = await loader()
    if (text) setMarkdown(text)
    else setDialog(null)
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className={compact ? 'h-7 gap-1 px-2 text-xs' : 'h-9'} disabled={ai.busy}>
            {ai.busy ? <Spinner size="sm" className="text-current" /> : <Sparkles className="h-3.5 w-3.5 text-primary" />}
            {compact ? 'AI' : 'AI Assist'}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel>Build</DropdownMenuLabel>
          <DropdownMenuItem onSelect={() => setDialog('generate')}>
            <Wand2 className="h-3.5 w-3.5" /> Generate from description
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!hasUrl} onSelect={() => void ai.completeRequest()}>
            <Plus className="h-3.5 w-3.5" /> Complete this request
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!hasUrl} onSelect={() => void ai.fillBody()}>
            <Braces className="h-3.5 w-3.5" /> Fill JSON body
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setDialog('curl')}>
            <Terminal className="h-3.5 w-3.5" /> Import from cURL
          </DropdownMenuItem>

          <DropdownMenuSeparator />
          <DropdownMenuLabel>After send</DropdownMenuLabel>
          <DropdownMenuItem
            disabled={!hasResponse}
            onSelect={() => void openMarkdown('Response explanation', () => ai.explainResponse())}
          >
            <MessageSquareText className="h-3.5 w-3.5" /> Explain response
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!hasResponse} onSelect={() => void ai.generateTests()}>
            <TestTube2 className="h-3.5 w-3.5" /> Generate tests
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!hasError} onSelect={() => void ai.fixRequest()}>
            <Wrench className="h-3.5 w-3.5" /> Fix failed request
          </DropdownMenuItem>

          <DropdownMenuSeparator />
          <DropdownMenuLabel>Improve</DropdownMenuLabel>
          <DropdownMenuItem disabled={!hasUrl} onSelect={() => void ai.fillScript()}>
            <FileCode2 className="h-3.5 w-3.5" /> Write pre-request script
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!hasUrl} onSelect={() => void ai.suggestVariables()}>
            <Variable className="h-3.5 w-3.5" /> Extract env variables
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!hasUrl} onSelect={() => void ai.describeNotes()}>
            <StickyNote className="h-3.5 w-3.5" /> Write notes
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!hasUrl}
            onSelect={() => void openMarkdown('Request review', () => ai.reviewRequest())}
          >
            <ShieldAlert className="h-3.5 w-3.5" /> Review request
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={dialog === 'generate'} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Generate API request</DialogTitle>
          </DialogHeader>
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder='e.g. "POST /users with name and email, Bearer auth, {{baseUrl}}"'
            rows={4}
          />
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input type="checkbox" checked={asNewTab} onChange={(e) => setAsNewTab(e.target.checked)} />
            Open in a new tab (unchecked updates this request)
          </label>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button onClick={() => void handleGenerate()} disabled={ai.busy || !prompt.trim()}>
              {ai.busy && <Spinner size="sm" className="text-current" />} Generate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === 'curl'} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Import from cURL</DialogTitle>
          </DialogHeader>
          <Textarea
            value={curl}
            onChange={(e) => setCurl(e.target.value)}
            placeholder="curl -X POST https://api.example.com/login -H 'Content-Type: application/json' -d '{...}'"
            rows={6}
            className="font-mono text-xs"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button onClick={handleImportCurl} disabled={!curl.trim()}>
              Import
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === 'markdown'} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{markdownTitle}</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            {ai.busy && !markdown ? (
              <div className="flex items-center justify-center py-8">
                <Spinner size="lg" />
              </div>
            ) : (
              <div className="markdown-body max-w-none text-sm">
                <ReactMarkdown>{markdown}</ReactMarkdown>
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  )
}
