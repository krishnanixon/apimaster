import type { ReactNode } from 'react'
import type { PresentationSlide, SlideSize } from '@shared/types/presentation-document'
import type { PresentationTemplateStyle } from '@shared/lib/presentation-slide-templates'
import { ScaledSlideFrame } from './ScaledSlideFrame'
import { cn } from '@/shared/lib/utils'

const STYLE_LABELS: Record<PresentationTemplateStyle, string> = {
  minimal: 'Minimal',
  bold: 'Bold',
  dark: 'Dark',
  gradient: 'Gradient',
  editorial: 'Editorial',
  glass: 'Glass',
  corporate: 'Corporate',
  warm: 'Warm'
}

interface TemplatePreviewCardProps {
  slide: PresentationSlide
  logicalSize: SlideSize
  title: string
  description: string
  badge?: string
  style?: PresentationTemplateStyle
  slideCount?: number
  accentGradient: string
  accentColor?: string
  selected?: boolean
  compact?: boolean
  onClick: () => void
}

export function TemplatePreviewCard({
  slide,
  logicalSize,
  title,
  description,
  badge,
  style,
  slideCount,
  accentGradient,
  accentColor,
  selected,
  compact,
  onClick
}: TemplatePreviewCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group w-full text-left transition-colors',
        compact ? 'rounded-none' : 'overflow-hidden rounded-lg hover:ring-1 hover:ring-foreground/10',
        !compact && selected && 'ring-2 ring-primary'
      )}
    >
      <div
        className={cn('relative overflow-hidden', compact ? 'aspect-[16/9]' : 'aspect-video')}
        style={{ background: accentGradient }}
      >
        <div
          className={cn(
            'absolute overflow-hidden rounded bg-white shadow-sm ring-1 ring-black/5',
            compact ? 'inset-1.5' : 'inset-2 rounded-md'
          )}
        >
          <ScaledSlideFrame slide={slide} logicalSize={logicalSize} className="h-full w-full" />
        </div>
        <div className="absolute left-1.5 top-1.5 flex flex-wrap gap-1">
          {badge ? (
            <span className="rounded bg-black/45 px-1.5 py-0.5 text-[8px] font-medium capitalize tracking-wide text-white backdrop-blur-sm">
              {badge}
            </span>
          ) : null}
          {style ? (
            <span
              className="rounded px-1.5 py-0.5 text-[8px] font-medium text-white backdrop-blur-sm"
              style={{ backgroundColor: accentColor ?? 'rgba(0,0,0,0.45)' }}
            >
              {STYLE_LABELS[style]}
            </span>
          ) : null}
        </div>
        {slideCount ? (
          <span className="absolute bottom-1.5 right-1.5 rounded bg-black/45 px-1.5 py-0.5 text-[8px] font-medium tabular-nums text-white backdrop-blur-sm">
            {slideCount} slides
          </span>
        ) : null}
      </div>
      <div className={cn(compact ? 'px-2 py-1.5' : 'px-1 py-1.5')}>
        <p className={cn('font-medium leading-tight text-foreground', compact ? 'text-[11px]' : 'text-[11px]')}>
          {title}
        </p>
        {!compact ? (
          <p className="mt-0.5 line-clamp-2 text-[10px] leading-snug text-muted-foreground">{description}</p>
        ) : description ? (
          <p className="mt-0.5 line-clamp-1 text-[9px] text-muted-foreground">{description}</p>
        ) : null}
      </div>
    </button>
  )
}

interface LayoutPreviewCardProps {
  name: string
  preview: ReactNode
  active?: boolean
  onClick: () => void
}

export function LayoutPreviewCard({ name, preview, active, onClick }: LayoutPreviewCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'overflow-hidden rounded-md border border-transparent text-left transition-all',
        'hover:border-border/60 hover:bg-muted/40',
        active && 'border-foreground/15 bg-muted'
      )}
    >
      <div className="aspect-video bg-muted/30 p-1.5">{preview}</div>
      <p className="border-t border-border/30 px-1.5 py-1 text-[9px] font-medium">{name}</p>
    </button>
  )
}

export function LayoutWireframe({ variant }: { variant: string }) {
  const bar = 'rounded-sm bg-foreground/15'
  const block = 'rounded bg-foreground/10'
  switch (variant) {
    case 'title':
      return (
        <div className="flex h-full flex-col items-center justify-center gap-1.5 p-2">
          <div className={cn(bar, 'h-2 w-3/4')} />
          <div className={cn(bar, 'h-1.5 w-1/2 opacity-60')} />
        </div>
      )
    case 'title-content':
      return (
        <div className="flex h-full flex-col gap-2 p-2">
          <div className={cn(bar, 'h-2 w-2/3')} />
          <div className={cn(block, 'min-h-0 flex-1')} />
        </div>
      )
    case 'two-column':
      return (
        <div className="flex h-full flex-col gap-1.5 p-2">
          <div className={cn(bar, 'h-1.5 w-1/2')} />
          <div className="grid flex-1 grid-cols-2 gap-1.5">
            <div className={cn(block, 'h-full')} />
            <div className={cn(block, 'h-full')} />
          </div>
        </div>
      )
    case 'metrics':
      return (
        <div className="flex h-full flex-col gap-1.5 p-2">
          <div className={cn(bar, 'h-1.5 w-1/3')} />
          <div className="grid flex-1 grid-cols-3 gap-1">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex flex-col items-center justify-center gap-0.5 rounded bg-foreground/5 p-1">
                <div className={cn(bar, 'h-2 w-full')} />
                <div className={cn(bar, 'h-1 w-2/3 opacity-50')} />
              </div>
            ))}
          </div>
        </div>
      )
    case 'image-left':
    case 'image-right':
      return (
        <div className="flex h-full gap-1.5 p-2">
          {variant === 'image-left' ? (
            <>
              <div className={cn(block, 'w-2/5')} />
              <div className="flex flex-1 flex-col gap-1">
                <div className={cn(bar, 'h-1.5 w-3/4')} />
                <div className={cn(block, 'flex-1')} />
              </div>
            </>
          ) : (
            <>
              <div className="flex flex-1 flex-col gap-1">
                <div className={cn(bar, 'h-1.5 w-3/4')} />
                <div className={cn(block, 'flex-1')} />
              </div>
              <div className={cn(block, 'w-2/5')} />
            </>
          )}
        </div>
      )
    default:
      return <div className={cn(block, 'h-full w-full opacity-30')} />
  }
}
