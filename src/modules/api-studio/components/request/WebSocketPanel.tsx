import { useState } from 'react'
import { Button } from '@/shared/components/ui/button'
import { ScrollArea } from '@/shared/components/ui/scroll-area'
import { Spinner } from '@/shared/components/ui/spinner'
import { cn } from '@/shared/lib/utils'
import { Plug, PlugZap, Send, Trash2 } from 'lucide-react'
import type { WebSocketMessage } from '../../stores/apiStudioStore'
import { ExpandableField } from '../ExpandableField'

interface WebSocketPanelProps {
  url: string
  connected: boolean
  connecting: boolean
  messages: WebSocketMessage[]
  onConnect: () => void
  onDisconnect: () => void
  onSend: (message: string) => void
  onClear: () => void
}

export function WebSocketPanel({
  url,
  connected,
  connecting,
  messages,
  onConnect,
  onDisconnect,
  onSend,
  onClear
}: WebSocketPanelProps) {
  const [draft, setDraft] = useState('')

  function handleSend() {
    if (!draft.trim()) return
    onSend(draft)
    setDraft('')
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <span
          className={cn(
            'h-2 w-2 rounded-full',
            connected ? 'bg-emerald-500' : connecting ? 'bg-amber-500 animate-pulse' : 'bg-muted-foreground/40'
          )}
        />
        <span className="truncate font-mono text-xs text-muted-foreground">{url || 'No URL'}</span>
        <div className="ml-auto flex gap-1.5">
          {connected ? (
            <Button size="sm" variant="outline" onClick={onDisconnect}>
              <Plug className="h-3.5 w-3.5" /> Disconnect
            </Button>
          ) : (
            <Button size="sm" onClick={onConnect} disabled={connecting || !url.trim()}>
              {connecting ? <Spinner size="sm" /> : <PlugZap className="h-3.5 w-3.5" />}
              Connect
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={onClear} disabled={messages.length === 0}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-1 p-3 font-mono text-xs">
          {messages.length === 0 && (
            <p className="text-muted-foreground">Connect to start exchanging WebSocket messages.</p>
          )}
          {messages.map((msg, i) => (
            <div
              key={i}
              className={cn(
                'rounded-md border px-2 py-1.5',
                msg.direction === 'sent' && 'border-primary/30 bg-primary/5',
                msg.direction === 'received' && 'border-emerald-500/30 bg-emerald-500/5',
                msg.direction === 'system' && 'border-border bg-muted/30 text-muted-foreground'
              )}
            >
              <div className="mb-0.5 text-[10px] uppercase tracking-wide opacity-70">
                {msg.direction} · {new Date(msg.timestamp).toLocaleTimeString()}
              </div>
              <pre className="whitespace-pre-wrap break-all">{msg.data}</pre>
            </div>
          ))}
        </div>
      </ScrollArea>

      <div className="flex items-start gap-2 border-t border-border p-3">
        <ExpandableField
          value={draft}
          onChange={setDraft}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSend()
            }
          }}
          placeholder="Message to send… (Shift+Enter for newline)"
          compact
          mono
          disabled={!connected}
          className="min-w-0 flex-1"
        />
        <Button onClick={handleSend} disabled={!connected || !draft.trim()} className="h-9 shrink-0">
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
