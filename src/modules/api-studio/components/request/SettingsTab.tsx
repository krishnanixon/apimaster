import { Input } from '@/shared/components/ui/input'
import { Switch } from '@/shared/components/ui/switch'
import type { RequestNetworkOptions } from '@shared/types/network'

interface SettingsTabProps {
  timeoutMs: number
  onChange: (timeoutMs: number) => void
  network?: RequestNetworkOptions
  onNetworkChange: (network: RequestNetworkOptions | undefined) => void
}

const SSL_CHOICES: Array<{ label: string; value: boolean | undefined }> = [
  { label: 'Use global setting', value: undefined },
  { label: 'Verify', value: true },
  { label: "Don't verify", value: false }
]

function chipClass(active: boolean): string {
  return active
    ? 'rounded-md border border-primary bg-primary/10 px-2.5 py-1 text-xs text-primary'
    : 'rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground hover:bg-accent'
}

/** Drops empty override objects so untouched requests stay unchanged on disk. */
function cleanNetwork(next: RequestNetworkOptions): RequestNetworkOptions | undefined {
  const out: RequestNetworkOptions = {}
  if (next.verifySsl !== undefined) out.verifySsl = next.verifySsl
  if (next.disableCookies) out.disableCookies = true
  return Object.keys(out).length ? out : undefined
}

const PRESETS = [
  { label: '10s', value: 10_000 },
  { label: '30s', value: 30_000 },
  { label: '60s', value: 60_000 },
  { label: '2m', value: 120_000 }
]

export function SettingsTab({ timeoutMs, onChange, network, onNetworkChange }: SettingsTabProps) {
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

      <div className="border-t border-border pt-4">
        <p className="text-xs font-medium text-foreground">SSL certificate verification</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          Turn off only for servers you trust, such as local dev servers with self-signed certificates.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {SSL_CHOICES.map((choice) => (
            <button
              key={choice.label}
              type="button"
              onClick={() => onNetworkChange(cleanNetwork({ ...network, verifySsl: choice.value }))}
              className={chipClass(network?.verifySsl === choice.value)}
            >
              {choice.label}
            </button>
          ))}
        </div>
      </div>

      <label className="flex cursor-pointer items-start justify-between gap-4 border-t border-border pt-4">
        <span>
          <span className="block text-xs font-medium text-foreground">Don't send cookies</span>
          <span className="mt-0.5 block text-[11px] text-muted-foreground">
            Skip cookies from the cookie jar for this request. Cookies the server sets are still saved.
          </span>
        </span>
        <Switch
          checked={Boolean(network?.disableCookies)}
          onCheckedChange={(checked) => onNetworkChange(cleanNetwork({ ...network, disableCookies: checked }))}
        />
      </label>
    </div>
  )
}
