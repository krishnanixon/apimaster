import { useCallback, useEffect, useMemo, useState } from 'react'
import { Cookie, Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { ScrollArea } from '@/shared/components/ui/scroll-area'
import { cn } from '@/shared/lib/utils'
import type { StoredCookie } from '@shared/types/network'
import { ConfirmDialog } from './ConfirmDialog'

interface CookieManagerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type CookieKey = { domain: string; path: string; name: string }

interface Draft {
  cookie: StoredCookie
  previous?: CookieKey
}

const EMPTY_COOKIE: StoredCookie = {
  name: '',
  value: '',
  domain: '',
  path: '/',
  expires: null,
  httpOnly: false,
  secure: false,
  hostOnly: true
}

/** ISO → value for `<input type="datetime-local">` in local time. */
function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

function fromLocalInput(value: string): string | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function CookieForm({ draft, onChange, onSave, onCancel }: {
  draft: Draft
  onChange: (cookie: StoredCookie) => void
  onSave: () => void
  onCancel: () => void
}) {
  const { cookie } = draft
  const set = (patch: Partial<StoredCookie>) => onChange({ ...cookie, ...patch })
  const flag = (label: string, checked: boolean, key: 'httpOnly' | 'secure' | 'hostOnly', title?: string) => (
    <label className="flex items-center gap-1.5 text-xs text-muted-foreground" title={title}>
      <input type="checkbox" checked={checked} onChange={(e) => set({ [key]: e.target.checked })} />
      {label}
    </label>
  )

  return (
    <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-3">
      <div className="grid grid-cols-2 gap-2">
        <Input value={cookie.name} onChange={(e) => set({ name: e.target.value })} placeholder="Name" className="h-7 text-xs" />
        <Input value={cookie.domain} onChange={(e) => set({ domain: e.target.value })} placeholder="Domain (api.example.com)" className="h-7 text-xs" />
        <Input value={cookie.value} onChange={(e) => set({ value: e.target.value })} placeholder="Value" className="col-span-2 h-7 font-mono text-xs" />
        <Input value={cookie.path} onChange={(e) => set({ path: e.target.value })} placeholder="Path" className="h-7 text-xs" />
        <Input
          type="datetime-local"
          value={toLocalInput(cookie.expires)}
          onChange={(e) => set({ expires: fromLocalInput(e.target.value) })}
          className="h-7 text-xs"
          title="Expiry (empty = session cookie)"
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {flag('HttpOnly', cookie.httpOnly, 'httpOnly')}
        {flag('Secure', cookie.secure, 'secure')}
        {flag('Host only', cookie.hostOnly, 'hostOnly', 'Only send to this exact host, not its subdomains')}
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          SameSite
          <select
            value={cookie.sameSite ?? ''}
            onChange={(e) => set({ sameSite: (e.target.value || undefined) as StoredCookie['sameSite'] })}
            className="h-6 rounded border border-border bg-background px-1 text-xs text-foreground"
          >
            <option value="">—</option>
            <option value="lax">Lax</option>
            <option value="strict">Strict</option>
            <option value="none">None</option>
          </select>
        </label>
        <div className="ml-auto flex gap-1.5">
          <Button size="sm" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button size="sm" onClick={onSave} disabled={!cookie.name.trim() || !cookie.domain.trim()}>
            Save
          </Button>
        </div>
      </div>
    </div>
  )
}

/** View, edit and delete the workspace cookie jar, grouped by domain. */
export function CookieManagerDialog({ open, onOpenChange }: CookieManagerDialogProps) {
  const [cookies, setCookies] = useState<StoredCookie[]>([])
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)

  const apply = useCallback((result: { success: boolean; data?: StoredCookie[]; error?: string }) => {
    if (!result.success) {
      toast.error(result.error ?? 'Cookie update failed')
      return false
    }
    setCookies(result.data ?? [])
    return true
  }, [])

  useEffect(() => {
    if (!open) return
    setDraft(null)
    void window.electronAPI.cookies.list().then(apply)
  }, [open, apply])

  const domains = useMemo(() => {
    const counts = new Map<string, number>()
    for (const cookie of cookies) counts.set(cookie.domain, (counts.get(cookie.domain) ?? 0) + 1)
    return [...counts.entries()].map(([domain, count]) => ({ domain, count }))
  }, [cookies])

  const activeDomain = selectedDomain && domains.some((d) => d.domain === selectedDomain) ? selectedDomain : (domains[0]?.domain ?? null)
  const visible = cookies.filter((cookie) => cookie.domain === activeDomain)

  async function save() {
    if (!draft) return
    if (apply(await window.electronAPI.cookies.upsert(draft))) {
      setSelectedDomain(draft.cookie.domain.trim().replace(/^\./, '').toLowerCase())
      setDraft(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Cookies</DialogTitle>
          <DialogDescription>
            Saved from Set-Cookie responses and sent automatically with matching requests, collection runs and MCP tools.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-[220px_1fr] gap-4" style={{ height: 420 }}>
          <div className="flex min-h-0 flex-col rounded-lg border border-border">
            <div className="flex shrink-0 items-center justify-between border-b border-border px-2 py-1.5">
              <span className="text-xs font-medium text-muted-foreground">Domains</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                title="Add cookie"
                onClick={() => setDraft({ cookie: { ...EMPTY_COOKIE, domain: activeDomain ?? '' } })}
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
            <ScrollArea className="min-h-0 flex-1">
              {domains.length === 0 ? (
                <p className="p-3 text-xs text-muted-foreground">No cookies yet. Send a request that sets one.</p>
              ) : (
                <div className="space-y-0.5 p-1.5">
                  {domains.map(({ domain, count }) => (
                    <div
                      key={domain}
                      className={cn(
                        'group flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs',
                        domain === activeDomain ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/50'
                      )}
                      onClick={() => {
                        setSelectedDomain(domain)
                        setDraft(null)
                      }}
                    >
                      <span className="min-w-0 flex-1 truncate">{domain}</span>
                      <span className="text-[10px] opacity-70">{count}</span>
                      <button
                        type="button"
                        title={`Delete all cookies for ${domain}`}
                        className="hidden h-5 w-5 items-center justify-center rounded hover:bg-destructive/10 hover:text-destructive group-hover:flex"
                        onClick={(e) => {
                          e.stopPropagation()
                          void window.electronAPI.cookies.delete({ domain }).then(apply)
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
            <div className="shrink-0 border-t border-border p-1.5">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-full text-xs text-destructive hover:text-destructive"
                disabled={cookies.length === 0}
                onClick={() => setConfirmClear(true)}
              >
                Clear all cookies
              </Button>
            </div>
          </div>

          <div className="flex min-h-0 flex-col gap-2">
            {draft && (
              <CookieForm
                draft={draft}
                onChange={(cookie) => setDraft({ ...draft, cookie })}
                onSave={() => void save()}
                onCancel={() => setDraft(null)}
              />
            )}
            <ScrollArea className="min-h-0 flex-1 rounded-lg border border-border">
              {!activeDomain ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center text-xs text-muted-foreground">
                  <Cookie className="h-5 w-5" />
                  The cookie jar is empty.
                </div>
              ) : (
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="border-b border-border/60 text-left text-muted-foreground">
                      <th className="px-3 py-1.5 font-medium">Name</th>
                      <th className="px-3 py-1.5 font-medium">Value</th>
                      <th className="px-3 py-1.5 font-medium">Path</th>
                      <th className="px-3 py-1.5 font-medium">Expires</th>
                      <th className="px-3 py-1.5 font-medium">Flags</th>
                      <th className="w-14" />
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((cookie) => {
                      const key: CookieKey = { domain: cookie.domain, path: cookie.path, name: cookie.name }
                      const flags = [
                        cookie.httpOnly && 'HttpOnly',
                        cookie.secure && 'Secure',
                        cookie.sameSite && `SameSite=${cookie.sameSite}`,
                        !cookie.hostOnly && 'Subdomains'
                      ].filter(Boolean)
                      return (
                        <tr key={`${cookie.path}|${cookie.name}`} className="group border-b border-border/40">
                          <td className="px-3 py-1.5 font-medium">{cookie.name}</td>
                          <td className="max-w-[220px] truncate px-3 py-1.5 font-mono text-muted-foreground" title={cookie.value}>
                            {cookie.value}
                          </td>
                          <td className="px-3 py-1.5 text-muted-foreground">{cookie.path}</td>
                          <td className="whitespace-nowrap px-3 py-1.5 text-muted-foreground">
                            {cookie.expires ? new Date(cookie.expires).toLocaleString() : 'Session'}
                          </td>
                          <td className="px-3 py-1.5 text-muted-foreground">{flags.join(' · ') || '—'}</td>
                          <td className="px-1 py-1">
                            <div className="flex justify-end gap-0.5 opacity-0 group-hover:opacity-100">
                              <button
                                type="button"
                                title="Edit"
                                className="flex h-5 w-5 items-center justify-center rounded hover:bg-accent"
                                onClick={() => setDraft({ cookie: { ...cookie }, previous: key })}
                              >
                                <Pencil className="h-3 w-3" />
                              </button>
                              <button
                                type="button"
                                title="Delete"
                                className="flex h-5 w-5 items-center justify-center rounded hover:bg-destructive/10 hover:text-destructive"
                                onClick={() => void window.electronAPI.cookies.delete(key).then(apply)}
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </ScrollArea>
          </div>
        </div>
      </DialogContent>

      <ConfirmDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title="Clear all cookies?"
        description="Every cookie in this workspace's jar will be deleted."
        confirmLabel="Clear all"
        onConfirm={() => void window.electronAPI.cookies.clear().then(apply)}
      />
    </Dialog>
  )
}
