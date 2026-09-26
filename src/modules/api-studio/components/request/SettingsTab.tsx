import { Input } from '@/shared/components/ui/input'

interface SettingsTabProps {
  timeoutMs: number
  onChange: (timeoutMs: number) => void
}

const PRESETS = [
  { label: '10s', value: 10_000 },
  { label: '30s', value: 30_000 },
  { label: '60s', value: 60_000 },
  { label: '2m', value: 120_000 }
]

export function SettingsTab({ timeoutMs, onChange }: SettingsTabProps) {
  const seconds = Math.round((timeoutMs || 30_000) / 1000)

  return (
    <div className="space-y-4 p-3">
      <div>
        <p className="text-xs font-medium text-foreground">Request timeout</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          How long to wait before cancelling an in-flight request. Default is 30 seconds.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {PRESETS.map((preset) => (
          <button
            key={preset.value}
            type="button"
            onClick={() => onChange(preset.value)}
            className={
              timeoutMs === preset.value
                ? 'rounded-md border border-primary bg-primary/10 px-2.5 py-1 text-xs text-primary'
                : 'rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground hover:bg-accent'
            }
          >
            {preset.label}
          </button>
        ))}
      </div>

      <label className="flex max-w-[220px] items-center gap-2 text-xs">
        <span className="shrink-0 text-muted-foreground">Custom (seconds)</span>
        <Input
          type="number"
          min={1}
          max={300}
          value={seconds}
          onChange={(e) => {
            const next = Math.min(300, Math.max(1, Number(e.target.value) || 1))
            onChange(next * 1000)
          }}
          className="h-7 w-20 text-xs"
        />
      </label>
    </div>
  )
}
