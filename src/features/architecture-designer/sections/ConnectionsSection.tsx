import { useMemo, useState } from 'react'
import { ArrowRight, Plus } from 'lucide-react'
import type { ArchConnectionKind } from '@shared/types/architecture'
import { ARCH_CONNECTION_KINDS, getConnectionKindMeta } from '@shared/lib/architecture-catalog'
import { Button } from '@/shared/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/shared/components/ui/dialog'
import { useArchitectureEditorStore } from '../stores/architecture-editor.store'
import { SectionShell, SectionEmpty } from './SectionShell'
import { cn } from '@/shared/lib/utils'

/**
 * Structured editor for connections. The visual canvas lands in the next phase;
 * because both read from the same model, they will stay in sync automatically.
 */
export function ConnectionsSection() {
  const { model, selectedConnectionId, selectConnection, searchQuery } = useArchitectureEditorStore()
  const [dialogOpen, setDialogOpen] = useState(false)

  const nameById = useMemo(
    () => new Map(model.components.map((c) => [c.id, c.name])),
    [model.components]
  )

  const visible = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return model.connections
    return model.connections.filter((conn) =>
      [nameById.get(conn.from), nameById.get(conn.to), conn.label, conn.kind]
        .join(' ')
        .toLowerCase()
        .includes(q)
    )
  }, [model.connections, searchQuery, nameById])

  const canConnect = model.components.length >= 2

  return (
    <SectionShell
      title="Architecture"
      description={`${model.components.length} components, ${model.connections.length} connections`}
      actions={
        <Button size="sm" className="h-7" disabled={!canConnect} onClick={() => setDialogOpen(true)}>
          <Plus className="h-3.5 w-3.5" />
          Connect
        </Button>
      }
    >
      {visible.length === 0 ? (
        <SectionEmpty
          title={searchQuery ? 'No matching connections' : 'No connections yet'}
          description={
            searchQuery
              ? 'Try a different search term.'
              : canConnect
                ? 'Connect components to describe how they talk to each other. Each connection carries its protocol, direction and auth.'
                : 'Add at least two components before you can connect them.'
          }
          action={
            !searchQuery &&
            canConnect && (
              <Button size="sm" onClick={() => setDialogOpen(true)}>
                <Plus className="h-3.5 w-3.5" />
                Add connection
              </Button>
            )
          }
        />
      ) : (
        <ul className="flex flex-col gap-1.5">
          {visible.map((conn) => {
            const meta = getConnectionKindMeta(conn.kind)
            const isSelected = conn.id === selectedConnectionId

            return (
              <li key={conn.id}>
                <button
                  type="button"
                  onClick={() => selectConnection(conn.id)}
                  aria-pressed={isSelected}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-lg border p-2.5 text-left',
                    'transition-colors duration-fast ease-out',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
                    isSelected
                      ? 'border-primary/40 bg-primary/5'
                      : 'border-border/60 bg-card hover:border-border hover:bg-muted/50'
                  )}
                >
                  <span
                    className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium"
                    style={{
                      backgroundColor: `${meta?.color ?? '#64748b'}1a`,
                      color: meta?.color ?? '#64748b'
                    }}
                  >
                    {meta?.label ?? conn.kind}
                  </span>

                  <div className="flex min-w-0 flex-1 items-center gap-1.5 text-[12.5px]">
                    <span className="truncate">{nameById.get(conn.from) ?? 'Unknown'}</span>
                    <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                    <span className="truncate">{nameById.get(conn.to) ?? 'Unknown'}</span>
                  </div>

                  {conn.label && (
                    <span className="shrink-0 text-[11px] text-muted-foreground">{conn.label}</span>
                  )}
                  {conn.async && (
                    <span className="shrink-0 text-[10px] text-muted-foreground">async</span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <ConnectDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </SectionShell>
  )
}

function ConnectDialog({
  open,
  onOpenChange
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { model, dispatch } = useArchitectureEditorStore()
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [kind, setKind] = useState<ArchConnectionKind>('https')
  const [label, setLabel] = useState('')

  const isValid = from && to && from !== to

  const submit = () => {
    if (!isValid) return
    dispatch({ type: 'CONNECT_COMPONENTS', connection: { from, to, kind, label } })
    setFrom('')
    setTo('')
    setLabel('')
    onOpenChange(false)
  }

  const selectClass =
    'ui-control-sm w-full rounded-md border border-input bg-background text-[12px]'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm">Connect components</DialogTitle>
          <DialogDescription className="text-xs">
            Describe how one component reaches another.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              From
            </span>
            <select value={from} onChange={(e) => setFrom(e.target.value)} className={selectClass}>
              <option value="">Select a component</option>
              {model.components.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              To
            </span>
            <select value={to} onChange={(e) => setTo(e.target.value)} className={selectClass}>
              <option value="">Select a component</option>
              {model.components
                .filter((c) => c.id !== from)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Type
            </span>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as ArchConnectionKind)}
              className={selectClass}
            >
              {ARCH_CONNECTION_KINDS.map((c) => (
                <option key={c.kind} value={c.kind}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Label
            </span>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Fetch orders"
              className="ui-control-sm w-full rounded-md border border-input bg-background px-2.5 text-[12px]"
            />
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" className="h-8" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" className="h-8" disabled={!isValid} onClick={submit}>
            Connect
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
