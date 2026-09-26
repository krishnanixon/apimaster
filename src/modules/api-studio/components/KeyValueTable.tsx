import { Plus, Trash2 } from 'lucide-react'
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
}

export function KeyValueTable({
  pairs,
  onChange,
  keyPlaceholder = 'Key',
  valuePlaceholder = 'Value',
  lockKeys = false,
  readOnly = false
}: KeyValueTableProps) {
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
      <div className="grid grid-cols-[24px_1fr_1fr_32px] gap-2 bg-muted/40 px-2.5 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <span />
        <span>{keyPlaceholder}</span>
        <span>{valuePlaceholder}</span>
        <span />
      </div>
      {pairs.map((pair) => (
        <div key={pair.id} className="grid grid-cols-[24px_1fr_1fr_32px] items-start gap-2 px-2.5 py-1.5">
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
