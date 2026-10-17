import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  Bug,
  Download,
  FolderPlus,
  History,
  Plus,
  Braces,
  Radio,
  Scale,
  Settings,
  Sparkles,
  Terminal,
  type LucideIcon
} from 'lucide-react'
import { AppLogo } from '@/shared/components/AppLogo'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { isMacClient } from '@/shared/hooks/useMacWindowChrome'
import { cn } from '@/shared/lib/utils'
import { useAIStore } from '@/features/ai/stores/ai.store'
import { PRODUCT_NAME, PRODUCT_TAGLINE } from '@shared/constants/product'
import { TERMS_TITLE } from '@shared/constants/terms'
import { useApiStudioStore } from '../stores/apiStudioStore'
import { METHOD_COLORS, requestProtocolLabel, type ApiHistoryEntry } from '../types/api.types'
import { applyRequestType } from '../services/graphql/model'
import { createEmptyRequest } from '../services/requestBuilder'
import { NamePromptDialog } from './NamePromptDialog'

const MAX_RECENT = 6

interface StartScreenProps {
  onImport: (tab: 'file' | 'curl') => void
}

function timeAgo(iso: string): string {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

/** Latest entry per method + URL, newest first. History is stored newest first. */
function recentUnique(history: ApiHistoryEntry[]): ApiHistoryEntry[] {
  const seen = new Set<string>()
  const out: ApiHistoryEntry[] = []
  for (const entry of history) {
    const key = `${entry.request.requestType ?? 'http'} ${entry.request.method} ${entry.request.url}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(entry)
    if (out.length === MAX_RECENT) break
  }
  return out
}

/** Workspace home shown when no request tabs are open. */
export function StartScreen({ onImport }: StartScreenProps) {
  const navigate = useNavigate()
  const history = useApiStudioStore((s) => s.history)
  const collectionCount = useApiStudioStore((s) => s.collections.length)
  const openScratchTab = useApiStudioStore((s) => s.openScratchTab)
  const openHistoryEntry = useApiStudioStore((s) => s.openHistoryEntry)
  const createCollection = useApiStudioStore((s) => s.createCollection)
  const createRequest = useApiStudioStore((s) => s.createRequest)
  const [collectionPromptOpen, setCollectionPromptOpen] = useState(false)

  const recent = useMemo(() => recentUnique(history), [history])
  const mod = isMacClient() ? '⌘' : 'Ctrl'

  const actions: Array<{ icon: LucideIcon; label: string; hint?: string; onClick: () => void }> = [
    { icon: Plus, label: 'New HTTP request', hint: `${mod} T`, onClick: () => openScratchTab() },
    {
      icon: Braces,
      label: 'New GraphQL request',
      onClick: () => {
        const blank = createEmptyRequest('Untitled GraphQL')
        openScratchTab({
          ...applyRequestType(blank, 'graphql'),
          name: 'Untitled GraphQL',
          method: 'POST'
        })
      }
    },
    {
      icon: Radio,
      label: 'New WebSocket',
      onClick: () =>
        openScratchTab({ name: 'Untitled WebSocket', requestType: 'websocket', url: 'wss://' })
    },
    { icon: FolderPlus, label: 'New collection', onClick: () => setCollectionPromptOpen(true) },
    { icon: Download, label: 'Import Postman or OpenAPI', onClick: () => onImport('file') },
    { icon: Terminal, label: 'Paste a cURL command', onClick: () => onImport('curl') }
  ]

  return (
    <div className="relative min-h-0 flex-1 overflow-y-auto">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-56 bg-[radial-gradient(ellipse_70%_100%_at_50%_0%,hsl(var(--primary)/0.08),transparent_70%)]"
      />

      <div className="relative mx-auto flex w-full max-w-4xl flex-col gap-8 px-8 py-10">
        <header className="flex items-center gap-4">
          <AppLogo className="h-11 w-11 drop-shadow-sm" />
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight">{PRODUCT_NAME}</h1>
            <p className="truncate text-[13px] text-muted-foreground">{PRODUCT_TAGLINE}</p>
          </div>
        </header>

        <div className="grid gap-8 md:grid-cols-2">
          <Section title="Start">
            <ul className="space-y-0.5">
              {actions.map(({ icon: Icon, label, hint, onClick }) => (
                <li key={label}>
                  <button
                    type="button"
                    onClick={onClick}
                    className="group flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[13px] text-primary transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="flex-1 truncate">{label}</span>
                    {hint && (
                      <kbd className="shrink-0 font-sans text-[11px] text-muted-foreground">{hint}</kbd>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </Section>

          <Section title="Recent">
            {recent.length === 0 ? (
              <div className="flex items-start gap-2.5 rounded-lg border border-dashed border-border px-3 py-3 text-[12.5px] leading-relaxed text-muted-foreground">
                <History className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  Requests you send show up here so you can reopen them in one click.
                  {collectionCount > 0 &&
                    ' Your saved collections are in the sidebar on the left.'}
                </p>
              </div>
            ) : (
              <ul className="space-y-0.5">
                {recent.map((entry) => {
                  const label = requestProtocolLabel(entry.request)
                  return (
                    <li key={entry.id}>
                      <button
                        type="button"
                        onClick={() => openHistoryEntry(entry)}
                        title={entry.request.url}
                        className="flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                      >
                        <span
                          className={cn(
                            'w-12 shrink-0 font-mono text-[10px] font-bold',
                            METHOD_COLORS[label] ?? METHOD_COLORS[entry.request.method]
                          )}
                        >
                          {label}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[12.5px]">
                          {entry.request.url || entry.request.name}
                        </span>
                        <span className="shrink-0 text-[11px] text-muted-foreground">
                          {timeAgo(entry.timestamp)}
                        </span>
                        <Badge
                          variant={entry.response.ok ? 'success' : 'destructive'}
                          className="shrink-0 px-1 py-0 text-[10px]"
                        >
                          {entry.response.status || 'ERR'}
                        </Badge>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </Section>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <ShortcutsCard mod={mod} />
          <AiCard onConnect={() => navigate('/settings?tab=ai')} />
        </div>

        <footer className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border/60 pt-4 text-[12px] text-muted-foreground">
          <FooterLink to="/terms" icon={Scale}>
            {TERMS_TITLE}
          </FooterLink>
          <FooterLink to="/settings" icon={Settings}>
            Settings
          </FooterLink>
          <FooterLink to="/diagnostics" icon={Bug}>
            Report a bug
          </FooterLink>
        </footer>
      </div>

      <NamePromptDialog
        open={collectionPromptOpen}
        onOpenChange={setCollectionPromptOpen}
        title="New Collection"
        description="Your first request opens in the new collection."
        onSubmit={(name) => createRequest(createCollection(name).id)}
      />
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="min-w-0">
      <h2 className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {title}
      </h2>
      {children}
    </section>
  )
}

function FooterLink({ to, icon: Icon, children }: { to: string; icon: LucideIcon; children: ReactNode }) {
  return (
    <Link to={to} className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground">
      <Icon className="h-3.5 w-3.5" />
      {children}
    </Link>
  )
}

function ShortcutsCard({ mod }: { mod: string }) {
  const shortcuts: Array<[string, string]> = [
    ['Send request', `${mod} ↵`],
    ['Format query', '⇧⌥F'],
    ['Fetch schema', `${mod} ⇧ G`],
    ['New tab', `${mod} T`],
    ['Save', `${mod} S`],
    ['Close tab', `${mod} W`],
    ['Copy as cURL', `${mod} ⇧ C`],
    ['Next tab', `${mod} Tab`]
  ]

  return (
    <div className="rounded-xl border border-border/70 bg-card p-4 shadow-soft">
      <h2 className="mb-3 text-[13px] font-semibold">Keyboard shortcuts</h2>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
        {shortcuts.map(([label, keys]) => (
          <div key={label} className="flex items-center justify-between gap-2 text-[12.5px]">
            <dt className="text-muted-foreground">{label}</dt>
            <dd>
              <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-sans text-[11px] text-foreground">
                {keys}
              </kbd>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

function AiCard({ onConnect }: { onConnect: () => void }) {
  const loadStatus = useAIStore((s) => s.loadStatus)
  const providers = useAIStore((s) => s.providers)
  const activeProvider = useAIStore((s) => s.activeProvider)
  const activeModel = useAIStore((s) => s.activeModel)
  const loaded = useAIStore((s) => s.config !== null)

  useEffect(() => {
    void loadStatus()
  }, [loadStatus])

  const provider = providers.find((p) => p.id === activeProvider)
  const ready = Boolean(provider?.configured)

  return (
    <div className="flex flex-col rounded-xl border border-border/70 bg-card p-4 shadow-soft">
      <div className="mb-2 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <h2 className="text-[13px] font-semibold">AI assist</h2>
        {loaded && (
          <Badge variant={ready ? 'success' : 'secondary'} className="ml-auto px-1.5 py-0 text-[10px]">
            {ready ? 'Ready' : 'Not connected'}
          </Badge>
        )}
      </div>
      <p className="flex-1 text-[12.5px] leading-relaxed text-muted-foreground">
        {ready
          ? `Using ${provider?.label ?? 'your provider'}${activeModel ? ` · ${activeModel}` : ''}. Open a request and use AI Assist in the toolbar to generate requests, explain responses, or write tests.`
          : 'Describe a request in plain English, get responses explained, and generate tests. Bring your own key, or run a local model with Ollama.'}
      </p>
      {loaded && !ready && (
        <Button variant="outline" size="sm" className="mt-3 self-start" onClick={onConnect}>
          Connect a provider <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  )
}
