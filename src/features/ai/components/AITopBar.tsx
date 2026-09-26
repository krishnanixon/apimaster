import { useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { isStandaloneModuleRoute } from '@/shared/lib/app-chrome'
import { useAIStore } from '@/features/ai/stores/ai.store'
import { getModelLabel } from '@shared/lib/ai-models'
import { cn } from '@/shared/lib/utils'
import { modeLabel } from '../lib/provider-meta'

function StatusDot({ online }: { online: boolean }) {
  return (
    <span className="relative flex h-1.5 w-1.5">
      {online && (
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
      )}
      <span
        className={cn(
          'relative inline-flex h-1.5 w-1.5 rounded-full',
          online ? 'bg-emerald-500' : 'bg-muted-foreground/40'
        )}
      />
    </span>
  )
}

export function AIStatusButton() {
  const { pathname } = useLocation()
  const { config, providers, activeProvider, activeModel, loadStatus } = useAIStore()

  useEffect(() => {
    if (isStandaloneModuleRoute(pathname)) return
    void loadStatus()
    const timer = setInterval(() => void loadStatus(), 30_000)
    return () => clearInterval(timer)
  }, [loadStatus, pathname])

  const active = providers.find((p) => p.id === activeProvider)
  const openai = providers.find((p) => p.id === 'openai')
  const ollama = providers.find((p) => p.id === 'ollama')
  const online = Boolean(active?.online || openai?.online || ollama?.online)
  const modelLabel = activeModel
    ? activeProvider === 'ollama'
      ? activeModel
      : getModelLabel(activeModel)
    : 'AI'
  const routingLabel = config ? modeLabel(config.mode) : 'AI'

  return (
    <Link
      to="/settings?tab=ai"
      title={`${routingLabel} · ${modelLabel}`}
      className="inline-flex h-8 min-w-0 max-w-[150px] shrink items-center gap-2 rounded-lg border border-border/70 bg-muted/30 px-2 text-[11px] text-muted-foreground shadow-sm transition-colors hover:border-primary/25 hover:bg-accent hover:text-foreground"
    >
      <StatusDot online={online} />
      <span className="min-w-0 truncate">{modelLabel}</span>
    </Link>
  )
}
