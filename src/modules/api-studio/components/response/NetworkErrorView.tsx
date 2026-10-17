import { useNavigate } from 'react-router-dom'
import { Globe, ShieldAlert, Unplug, Timer, Network } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import type { NetworkErrorInfo } from '@shared/types/network'

const ICONS = {
  tls: ShieldAlert,
  proxy: Network,
  dns: Globe,
  connection: Unplug,
  timeout: Timer
} as const

const LABELS = {
  tls: 'SSL / TLS error',
  proxy: 'Proxy error',
  dns: 'DNS error',
  connection: 'Connection error',
  timeout: 'Timeout'
} as const

/** Explains a request that never got a response (TLS, proxy, DNS, connection, timeout). */
export function NetworkErrorView({
  info,
  message,
  onDisableVerification
}: {
  info: NetworkErrorInfo
  message?: string
  /** Offered for certificate verification failures. */
  onDisableVerification?: () => void
}) {
  const navigate = useNavigate()
  const Icon = ICONS[info.kind]
  const showSettings = info.kind === 'tls' || info.kind === 'proxy'

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
        <Icon className="h-5 w-5 text-destructive" />
      </div>
      <div className="max-w-md space-y-1.5">
        <p className="text-[10px] font-medium uppercase tracking-wide text-destructive">{LABELS[info.kind]}</p>
        <p className="text-sm font-medium text-foreground">{info.title}</p>
        {info.hint && <p className="text-xs leading-relaxed text-muted-foreground">{info.hint}</p>}
        {(message || info.code) && (
          <p className="break-all font-mono text-[11px] text-muted-foreground/80">
            {info.code && <span className="mr-1 rounded bg-muted px-1 py-px">{info.code}</span>}
            {message}
          </p>
        )}
      </div>
      {(showSettings || onDisableVerification) && (
        <div className="flex flex-wrap items-center justify-center gap-2">
          {onDisableVerification && (
            <Button size="sm" variant="outline" onClick={onDisableVerification}>
              Don't verify SSL for this request
            </Button>
          )}
          {showSettings && (
            <Button size="sm" variant="ghost" onClick={() => navigate('/settings?tab=network')}>
              Network settings
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
