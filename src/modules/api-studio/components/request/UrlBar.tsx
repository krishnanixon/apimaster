import { useMemo, useState } from 'react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/shared/components/ui/dropdown-menu'
import { Button } from '@/shared/components/ui/button'
import { Spinner } from '@/shared/components/ui/spinner'
import { cn } from '@/shared/lib/utils'
import { AlertTriangle, ChevronDown, Plug, PlugZap, Send, X } from 'lucide-react'
import { HTTP_METHODS, METHOD_COLORS } from '../../types/api.types'
import type { HttpMethod } from '../../types/api.types'
import { useApiStudioStore } from '../../stores/apiStudioStore'
import { enabledVariableMap } from '../../services/environment'
import { ExpandableField } from '../ExpandableField'

interface UrlBarProps {
  method: HttpMethod
  url: string
  loading: boolean
  isWebSocket?: boolean
  isGraphQL?: boolean
  wsConnected?: boolean
  wsConnecting?: boolean
  onMethodChange: (method: HttpMethod) => void
  onUrlChange: (url: string) => void
  onSend: () => void
  onCancel: () => void
  onConnect?: () => void
  onDisconnect?: () => void
}

export function UrlBar({
  method,
  url,
  loading,
  isWebSocket,
  isGraphQL,
  wsConnected,
  wsConnecting,
  onMethodChange,
  onUrlChange,
  onSend,
  onCancel,
  onConnect,
  onDisconnect
}: UrlBarProps) {
  const importCurlAsTab = useApiStudioStore((s) => s.importCurlAsTab)
  const environments = useApiStudioStore((s) => s.environments)
  const activeEnvironmentId = useApiStudioStore((s) => s.activeEnvironmentId)

  const [urlFocused, setUrlFocused] = useState(false)

  const missingVars = useMemo(() => {
    const active = environments.find((e) => e.id === activeEnvironmentId)
    const defined = new Set(Object.keys(enabledVariableMap(active?.variables ?? [])))
    const names: string[] = []
    for (const match of url.matchAll(/\{\{\s*([\w.-]+)\s*\}\}/g)) {
      if (!defined.has(match[1]) && !names.includes(match[1])) names.push(match[1])
    }
    return names
  }, [url, environments, activeEnvironmentId])

  function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const text = e.clipboardData.getData('text')
    if (!/^\s*curl\s/i.test(text)) return
    e.preventDefault()
    importCurlAsTab(text)
  }

  return (
    <div className="flex shrink-0 items-start gap-2 border-b border-border/60 bg-background px-2 py-1.5">
      <div
        className={cn(
          'flex min-w-0 flex-1 items-start rounded border border-border/80 bg-muted/20',
          urlFocused && 'border-foreground/25 ring-2 ring-ring/15'
        )}
      >
        {!isWebSocket && !isGraphQL && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={cn(
                  'flex h-8 shrink-0 items-center gap-0.5 border-r border-border/60 px-2.5 text-xs font-bold transition-colors hover:bg-muted/40',
                  METHOD_COLORS[method]
                )}
              >
                {method}
                <ChevronDown className="h-3 w-3 opacity-60" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-[100px]">
              {HTTP_METHODS.map((m) => (
                <DropdownMenuItem
                  key={m}
                  onSelect={() => onMethodChange(m)}
                  className={cn('text-xs font-bold', METHOD_COLORS[m])}
                >
                  {m}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        <ExpandableField
          value={url}
          onChange={onUrlChange}
          onPaste={handlePaste}
          onFocus={() => setUrlFocused(true)}
          onBlur={() => setUrlFocused(false)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              if (isWebSocket) onConnect?.()
              else onSend()
            }
          }}
          placeholder={
            isGraphQL
              ? 'https://api.example.com/graphql'
              : isWebSocket
                ? 'wss://api.example.com/socket'
                : 'https://api.example.com/users/:id  or paste cURL'
          }
          compact
          mono
          bare
          className="min-w-0 flex-1"
          aria-label={isGraphQL ? 'GraphQL endpoint' : 'Request URL'}
        />

        {missingVars.length > 0 && (
          <span
            className="flex h-8 shrink-0 items-center gap-1 border-l border-border/60 px-2 text-[10px] text-amber-600 dark:text-amber-400"
            title={`Undefined variables: ${missingVars.join(', ')}`}
          >
            <AlertTriangle className="h-3 w-3" />
            {missingVars.length === 1 ? `{{${missingVars[0]}}}` : `${missingVars.length} vars`}
          </span>
        )}
      </div>

      {isWebSocket ? (
        wsConnected ? (
          <Button onClick={onDisconnect} variant="outline" size="sm" className="h-8 shrink-0 px-3 text-xs">
            <Plug className="h-3 w-3" /> Disconnect
          </Button>
        ) : (
          <Button
            onClick={onConnect}
            disabled={wsConnecting}
            size="sm"
            className="mt-0 h-8 shrink-0 bg-primary px-4 text-xs text-primary-foreground hover:bg-primary/90"
          >
            {wsConnecting ? <Spinner size="sm" /> : <PlugZap className="h-3 w-3" />}
            Connect
          </Button>
        )
      ) : loading ? (
        <Button
          onClick={onCancel}
          size="sm"
          className="mt-0 h-8 shrink-0 bg-destructive px-4 text-xs text-destructive-foreground hover:bg-destructive/90"
        >
          <X className="h-3 w-3" /> Cancel
        </Button>
      ) : (
        <Button
          onClick={onSend}
          size="sm"
          title="Send (Ctrl+Enter)"
          className="mt-0 h-8 shrink-0 bg-primary px-4 text-xs font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Send className="h-3 w-3" />
          Send
          <kbd className="ml-1 hidden rounded bg-primary-foreground/15 px-1 py-px text-[9px] font-normal opacity-80 sm:inline">
            Ctrl+↵
          </kbd>
        </Button>
      )}
    </div>
  )
}
