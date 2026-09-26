import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { Check, Pipette } from 'lucide-react'
import { cn } from '@/shared/lib/utils'

export const COLOR_PRESETS = [
  '#ffffff',
  '#f8fafc',
  '#e2e8f0',
  '#94a3b8',
  '#64748b',
  '#334155',
  '#0f172a',
  '#000000',
  '#ef4444',
  '#f97316',
  '#f59e0b',
  '#eab308',
  '#84cc16',
  '#22c55e',
  '#10b981',
  '#14b8a6',
  '#06b6d4',
  '#0ea5e9',
  '#3b82f6',
  '#6366f1',
  '#8b5cf6',
  '#a855f7',
  '#d946ef',
  '#ec4899',
  '#f43f5e',
  '#be123c',
  '#7c2d12',
  '#365314',
  '#164e63',
  '#1e3a8a',
  '#4c1d95',
  '#831843'
] as const

function normalizeHex(value: string): string {
  const trimmed = value.trim()
  if (trimmed === 'transparent' || trimmed === 'none') return trimmed
  if (!trimmed.startsWith('#')) {
    if (/^[0-9a-fA-F]{3}$/.test(trimmed) || /^[0-9a-fA-F]{6}$/.test(trimmed)) {
      return `#${trimmed.toLowerCase()}`
    }
    return trimmed
  }
  if (/^#[0-9a-fA-F]{3}$/.test(trimmed)) {
    const [, r, g, b] = trimmed
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase()
  }
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed.toLowerCase()
  return trimmed
}

function toPickerHex(value: string, fallback = '#6366f1'): string {
  const hex = normalizeHex(value)
  if (/^#[0-9a-fA-F]{6}$/.test(hex)) return hex
  return fallback
}

function isTransparent(value: string): boolean {
  const v = value.trim().toLowerCase()
  return v === 'transparent' || v === 'none' || v === ''
}

interface ColorFieldProps {
  label?: string
  value: string
  onChange: (value: string) => void
  presets?: readonly string[]
  allowTransparent?: boolean
  size?: 'sm' | 'md'
  className?: string
}

export function ColorField({
  label,
  value,
  onChange,
  presets = COLOR_PRESETS,
  allowTransparent = false,
  size = 'sm',
  className
}: ColorFieldProps) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(value)
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({})
  const rootRef = useRef<HTMLDivElement>(null)
  const panelId = useId()
  const transparent = isTransparent(value)
  const displayHex = transparent ? 'Transparent' : normalizeHex(value).replace(/^#/, '').toUpperCase()
  const swatch = transparent ? undefined : toPickerHex(value)

  useEffect(() => {
    setDraft(transparent ? '' : normalizeHex(value).replace(/^#/, ''))
  }, [value, transparent])

  useLayoutEffect(() => {
    if (!open || !rootRef.current) return
    const rect = rootRef.current.getBoundingClientRect()
    const width = Math.max(rect.width, 220)
    const left = Math.min(rect.left, window.innerWidth - width - 8)
    const spaceBelow = window.innerHeight - rect.bottom
    const openUp = spaceNearBottom(spaceBelow, rect.top)
    setPanelStyle({
      position: 'fixed',
      left: Math.max(8, left),
      width,
      top: openUp ? undefined : rect.bottom + 4,
      bottom: openUp ? window.innerHeight - rect.top + 4 : undefined,
      zIndex: 80
    })
  }, [open])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      const panel = document.getElementById(panelId)
      if (rootRef.current?.contains(event.target as Node) || panel?.contains(event.target as Node)) return
      setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open, panelId])

  const commitHex = (raw: string) => {
    const next = normalizeHex(raw.startsWith('#') ? raw : `#${raw}`)
    if (/^#[0-9a-fA-F]{6}$/.test(next) || next === 'transparent') {
      onChange(next)
      setDraft(next === 'transparent' ? '' : next.replace(/^#/, ''))
    }
  }

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      {label ? (
        <p className="mb-1 text-[9px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      ) : null}

      <div
        className={cn(
          'flex items-center gap-1 rounded-md border border-border/60 bg-background',
          size === 'sm' ? 'h-7 px-1' : 'h-8 px-1.5'
        )}
      >
        <button
          type="button"
          title="Choose color"
          aria-label={label ? `${label} color` : 'Choose color'}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((current) => !current)}
          className={cn(
            'relative shrink-0 overflow-hidden rounded border border-border/70 shadow-sm transition-transform hover:scale-105',
            size === 'sm' ? 'h-5 w-5' : 'h-6 w-6',
            open && 'ring-2 ring-primary/40 ring-offset-1 ring-offset-background'
          )}
          style={
            transparent
              ? {
                  backgroundImage:
                    'linear-gradient(45deg,#e2e8f0 25%,transparent 25%),linear-gradient(-45deg,#e2e8f0 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#e2e8f0 75%),linear-gradient(-45deg,transparent 75%,#e2e8f0 75%)',
                  backgroundSize: '8px 8px',
                  backgroundPosition: '0 0,0 4px,4px -4px,-4px 0'
                }
              : { backgroundColor: swatch }
          }
        />

        <span className="select-none text-[10px] text-muted-foreground">#</span>
        <input
          value={transparent ? '' : draft}
          placeholder={transparent ? 'none' : 'FFFFFF'}
          onChange={(event) => {
            const next = event.target.value.replace(/[^0-9a-fA-F]/g, '').slice(0, 6)
            setDraft(next)
            if (next.length === 3 || next.length === 6) commitHex(next)
          }}
          onBlur={() => {
            if (draft) commitHex(draft)
            else if (allowTransparent) onChange('transparent')
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur()
          }}
          className="h-full min-w-0 flex-1 bg-transparent font-mono text-[10px] uppercase tracking-wide text-foreground outline-none placeholder:normal-case placeholder:tracking-normal placeholder:text-muted-foreground"
          spellCheck={false}
          aria-label={label ? `${label} hex` : 'Hex color'}
        />

        <label
          className="flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          title="Color picker"
        >
          <Pipette className="h-3 w-3" />
          <input
            type="color"
            value={toPickerHex(value)}
            onChange={(event) => onChange(event.target.value)}
            className="sr-only"
            aria-label="Native color picker"
          />
        </label>
      </div>

      {open ? (
        <div
          id={panelId}
          role="dialog"
          aria-label={label ? `${label} palette` : 'Color palette'}
          style={panelStyle}
          className="rounded-lg border border-border/70 bg-popover p-2 shadow-xl animate-fade-in"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
              Presets
            </span>
            <span className="truncate font-mono text-[9px] text-muted-foreground">
              {transparent ? 'transparent' : `#${displayHex}`}
            </span>
          </div>

          <div className="grid grid-cols-8 gap-1">
            {allowTransparent ? (
              <button
                type="button"
                title="Transparent"
                onClick={() => {
                  onChange('transparent')
                  setOpen(false)
                }}
                className={cn(
                  'relative h-5 w-full overflow-hidden rounded border border-border/70',
                  transparent && 'ring-2 ring-primary ring-offset-1 ring-offset-popover'
                )}
                style={{
                  backgroundImage:
                    'linear-gradient(45deg,#cbd5e1 25%,transparent 25%),linear-gradient(-45deg,#cbd5e1 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#cbd5e1 75%),linear-gradient(-45deg,transparent 75%,#cbd5e1 75%)',
                  backgroundSize: '6px 6px',
                  backgroundPosition: '0 0,0 3px,3px -3px,-3px 0'
                }}
              >
                {transparent ? <Check className="absolute inset-0 m-auto h-3 w-3 text-foreground" /> : null}
              </button>
            ) : null}
            {presets.map((color) => {
              const active = !transparent && toPickerHex(value).toLowerCase() === color.toLowerCase()
              const light = ['#ffffff', '#f8fafc', '#e2e8f0', '#fefce8'].includes(color.toLowerCase())
              return (
                <button
                  key={color}
                  type="button"
                  title={color}
                  onClick={() => {
                    onChange(color)
                    setOpen(false)
                  }}
                  className={cn(
                    'relative h-5 w-full rounded border transition-transform hover:scale-110',
                    light ? 'border-border/80' : 'border-black/10',
                    active && 'ring-2 ring-primary ring-offset-1 ring-offset-popover'
                  )}
                  style={{ backgroundColor: color }}
                >
                  {active ? (
                    <Check
                      className={cn(
                        'absolute inset-0 m-auto h-3 w-3',
                        light ? 'text-foreground' : 'text-white'
                      )}
                    />
                  ) : null}
                </button>
              )
            })}
          </div>

          <div className="mt-2 flex items-center gap-2 border-t border-border/50 pt-2">
            <label className="relative flex h-7 w-7 shrink-0 cursor-pointer overflow-hidden rounded-md border border-border/70 shadow-sm">
              <span className="absolute inset-0" style={{ backgroundColor: toPickerHex(value) }} />
              <input
                type="color"
                value={toPickerHex(value)}
                onChange={(event) => onChange(event.target.value)}
                className="absolute inset-0 cursor-pointer opacity-0"
              />
            </label>
            <div className="flex h-7 min-w-0 flex-1 items-center rounded-md border border-border/60 bg-background px-2">
              <span className="mr-1 text-[10px] text-muted-foreground">#</span>
              <input
                value={transparent ? '' : draft}
                onChange={(event) => {
                  const next = event.target.value.replace(/[^0-9a-fA-F]/g, '').slice(0, 6)
                  setDraft(next)
                  if (next.length === 6) commitHex(next)
                }}
                onBlur={() => draft && commitHex(draft)}
                className="h-full w-full bg-transparent font-mono text-[11px] uppercase outline-none"
                spellCheck={false}
              />
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="h-7 shrink-0 rounded-md bg-primary px-2 text-[10px] font-medium text-primary-foreground hover:opacity-90"
            >
              Done
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function spaceNearBottom(spaceBelow: number, spaceAbove: number) {
  return spaceBelow < 220 && spaceAbove > spaceBelow
}

interface ColorSwatchRowProps {
  value: string
  onChange: (value: string) => void
  presets: readonly string[]
  allowTransparent?: boolean
}

export function ColorSwatchRow({ value, onChange, presets, allowTransparent }: ColorSwatchRowProps) {
  return (
    <div className="flex flex-wrap gap-1">
      {allowTransparent ? (
        <button
          type="button"
          title="Transparent"
          onClick={() => onChange('transparent')}
          className={cn(
            'h-6 w-6 rounded-md border border-dashed border-border/70',
            isTransparent(value) && 'ring-2 ring-primary ring-offset-1'
          )}
          style={{
            backgroundImage:
              'linear-gradient(45deg,#e2e8f0 25%,transparent 25%),linear-gradient(-45deg,#e2e8f0 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#e2e8f0 75%),linear-gradient(-45deg,transparent 75%,#e2e8f0 75%)',
            backgroundSize: '8px 8px',
            backgroundPosition: '0 0,0 4px,4px -4px,-4px 0'
          }}
        />
      ) : null}
      {presets.map((color) => (
        <button
          key={color}
          type="button"
          title={color}
          onClick={() => onChange(color)}
          className={cn(
            'h-6 w-6 rounded-md border transition-transform hover:scale-105',
            !isTransparent(value) && toPickerHex(value).toLowerCase() === color.toLowerCase()
              ? 'ring-2 ring-primary ring-offset-1'
              : 'border-border/60'
          )}
          style={{ background: color === 'transparent' ? undefined : color }}
        />
      ))}
    </div>
  )
}
