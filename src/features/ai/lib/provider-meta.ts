import { Cloud, Cpu, Blend, Sparkles, Bot, Wind, Zap, Braces } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { AIMode, AIProviderId } from '@shared/types'

export interface ModeMeta {
  id: AIMode
  label: string
  description: string
  icon: LucideIcon
}

export const MODE_META: ModeMeta[] = [
  {
    id: 'openai',
    label: 'Cloud',
    description: 'Every request uses the selected cloud provider.',
    icon: Cloud
  },
  {
    id: 'ollama',
    label: 'Ollama (Local)',
    description: 'Every request runs on your local models.',
    icon: Cpu
  },
  {
    id: 'hybrid',
    label: 'Hybrid',
    description: 'Light tasks run locally, heavy tasks use the selected cloud provider.',
    icon: Blend
  }
]

export const PROVIDER_ICON: Record<AIProviderId, LucideIcon> = {
  openai: Cloud,
  ollama: Cpu,
  anthropic: Sparkles,
  gemini: Bot,
  azure: Cloud,
  openrouter: Wind,
  groq: Zap,
  deepseek: Braces
}

export function modeLabel(mode: AIMode): string {
  return MODE_META.find((m) => m.id === mode)?.label ?? mode
}

export function formatCost(usd: number | undefined | null): string {
  if (!usd || usd <= 0) return '$0.00'
  if (usd < 0.01) return `$${usd.toFixed(4)}`
  return `$${usd.toFixed(2)}`
}

export function formatMs(ms: number | undefined | null): string {
  if (!ms || ms <= 0) return '—'
  if (ms < 1000) return `${Math.round(ms)} ms`
  return `${(ms / 1000).toFixed(1)} s`
}

export function formatBytes(bytes: number | undefined | null): string {
  if (!bytes || bytes <= 0) return ''
  const gb = bytes / 1024 ** 3
  if (gb >= 1) return `${gb.toFixed(1)} GB`
  const mb = bytes / 1024 ** 2
  return `${Math.round(mb)} MB`
}

export function formatTokens(tokens: number | undefined | null): string {
  if (!tokens || tokens <= 0) return '0'
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`
  return String(tokens)
}
