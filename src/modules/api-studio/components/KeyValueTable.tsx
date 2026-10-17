import { Lock, LockOpen, Plus, Trash2 } from 'lucide-react'
import { isSecretValue } from '@shared/lib/collection-files/secrets'
import { v4 as uuidv4 } from 'uuid'
import { Button } from '@/shared/components/ui/button'
import { cn } from '@/shared/lib/utils'
import type { KeyValuePair } from '../types/api.types'
import { ExpandableField } from './ExpandableField'

interface KeyValueTableProps {
  pairs: KeyValuePair[]
  onChange: (pairs: KeyValuePair[]) => void
  keyPlaceholder?: string
  valuePlaceholder?: string
  /** When true, keys cannot be edited (used for path variables derived from the URL). */
  lockKeys?: boolean
  /** Display-only rows (inherited headers). */
  readOnly?: boolean
  /** Show a per-row lock that marks a value as secret (kept out of collection folders). */
  secretToggle?: boolean
}

export function KeyValueTable({
  pairs,
  onChange,
  keyPlaceholder = 'Key',
  valuePlaceholder = 'Value',
  lockKeys = false,
  readOnly = false,
  secretToggle = false
}: KeyValueTableProps) {
  const columns = secretToggle ? 'grid-cols-[24px_1fr_1fr_28px_32px]' : 'grid-cols-[24px_1fr_1fr_32px]'

  function updateRow(id: string, patch: Partial<KeyValuePair>) {
    const next = pairs.map((p) => (p.id === id ? { ...p, ...patch } : p))
    if (!lockKeys) ensureTrailingEmptyRow(next)
    else onChange(next)
  }

  function ensureTrailingEmptyRow(next: KeyValuePair[]) {
    const last = next[next.length - 1]
    if (last && (last.key.trim() || last.value.trim())) {
      next.push({ id: uuidv4(), key: '', value: '', enabled: true })
    }
    onChange(next)
  }

  function removeRow(id: string) {
    const next = pairs.filter((p) => p.id !== id)
    onChange(next.length > 0 ? next : [{ id: uuidv4(), key: '', value: '', enabled: true }])
  }

  return (
    <div className="divide-y divide-border rounded-lg border border-border">
      <div className={cn('grid gap-2 bg-muted/40 px-2.5 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground', columns)}>
        <span />
        <span>{keyPlaceholder}</span>
        <span>{valuePlaceholder}</span>
        {secretToggle && <span />}
        <span />
      </div>
      {pairs.map((pair) => (
        <div key={pair.id} className={cn('grid items-start gap-2 px-2.5 py-1.5', columns)}>
          <input
            type="checkbox"
            checked={pair.enabled}
            disabled={readOnly}
            onChange={(e) => updateRow(pair.id, { enabled: e.target.checked })}
            className="mt-2 h-3.5 w-3.5 rounded border-border accent-primary"
          />
          <ExpandableField
            value={pair.key}
            onChange={(key) => updateRow(pair.id, { key })}
            placeholder={keyPlaceholder}
            readOnly={lockKeys || readOnly}
            compact
            className={cn(!pair.enabled && 'opacity-50', (lockKeys || readOnly) && 'bg-muted/40')}
          />
          <ExpandableField
            value={pair.value}
            onChange={(value) => updateRow(pair.id, { value })}
            placeholder={valuePlaceholder}
            readOnly={readOnly}
            compact
            className={cn(!pair.enabled && 'opacity-50', readOnly && 'bg-muted/40')}
          />
          {secretToggle && <SecretToggle pair={pair} disabled={readOnly} onChange={(secret) => updateRow(pair.id, { secret })} />}
          {lockKeys || readOnly ? (
            <span />
          ) : (
            <Button
              variant="ghost"
              size="icon"
              className="mt-0.5 h-7 w-7"
              onClick={() => removeRow(pair.id)}
              title="Remove"
            >
              <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
          )}
        </div>
      ))}
      {!lockKeys && !readOnly && (
        <button
          type="button"
          onClick={() => onChange([...pairs, { id: uuidv4(), key: '', value: '', enabled: true }])}
          className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Plus className="h-3.5 w-3.5" /> Add row
        </button>
      )}
    </div>
  )
}

function SecretToggle({ pair, disabled, onChange }: { pair: KeyValuePair; disabled: boolean; onChange: (secret: boolean) => void }) {
  const secret = isSecretValue(pair)
  const automatic = secret && pair.secret !== true
  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn('mt-0.5 h-7 w-7', secret ? 'text-amber-500' : 'text-muted-foreground')}
      disabled={disabled}
      onClick={() => onChange(!secret)}
      title={
        secret
          ? `Secret${automatic ? ' (looks like a credential)' : ''}: the value stays on this machine and is never written to a collection folder. Click to share it.`
          : 'Shared: written to the collection folder. Click to keep the value on this machine only.'
      }
      aria-pressed={secret}
      aria-label={secret ? 'Secret value' : 'Shared value'}
    >
      {secret ? <Lock className="h-3.5 w-3.5" /> : <LockOpen className="h-3.5 w-3.5" />}
    </Button>
  )
}
