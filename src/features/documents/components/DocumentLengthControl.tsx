import type { DocumentLength } from '@shared/types'
import {
  DOCUMENT_LENGTH_PRESETS,
  DEFAULT_DOCUMENT_LENGTH
} from '@/features/documents/lib/generation-options'
import { cn } from '@/shared/lib/utils'
import { Input } from '@/shared/components/ui/input'

interface DocumentLengthControlProps {
  length: DocumentLength
  customWordCount: number
  onLengthChange: (length: DocumentLength) => void
  onCustomWordCountChange: (count: number) => void
}

export function DocumentLengthControl({
  length,
  customWordCount,
  onLengthChange,
  onCustomWordCountChange
}: DocumentLengthControlProps) {
  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold">Document length</h3>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Default is <strong className="font-medium text-foreground">Detailed</strong> — adjust for shorter or
          comprehensive output
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {DOCUMENT_LENGTH_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => onLengthChange(preset.id)}
            className={cn(
              'rounded-lg border bg-card p-3 text-left shadow-sm transition-all hover:bg-accent/30',
              length === preset.id
                ? 'border-primary ring-1 ring-primary/20'
                : 'border-border'
            )}
          >
            <p className="text-sm font-medium">{preset.label}</p>
            <p className="text-xs text-muted-foreground">{preset.description}</p>
          </button>
        ))}
        <button
          type="button"
          onClick={() => onLengthChange('custom')}
          className={cn(
            'rounded-lg border bg-card p-3 text-left shadow-sm transition-all hover:bg-accent/30 sm:col-span-2',
            length === 'custom'
              ? 'border-primary ring-1 ring-primary/20'
              : 'border-border'
          )}
        >
          <p className="text-sm font-medium">Custom word count</p>
          <p className="text-xs text-muted-foreground">Set an exact target for the AI</p>
        </button>
      </div>
      {length === 'custom' && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/30 p-3">
          <label className="shrink-0 text-sm font-medium">Target words</label>
          <Input
            type="number"
            min={500}
            max={25000}
            step={500}
            value={customWordCount}
            onChange={(e) => onCustomWordCountChange(Number(e.target.value) || 4000)}
            className="max-w-[140px]"
          />
          <span className="text-xs text-muted-foreground">≈ {Math.ceil(customWordCount / 250)} pages</span>
        </div>
      )}
    </div>
  )
}

export { DEFAULT_DOCUMENT_LENGTH }
