import type { ReactNode } from 'react'
import {
  ArrowRight,
  Circle,
  Copy,
  Minus,
  RotateCw,
  Square,
  Triangle
} from 'lucide-react'
import type { PresentationShapeKind, ShapeElement } from '@shared/types/presentation-document'
import { usePresentationDocumentStore } from '../stores/presentation-document.store'
import { isLineShape } from '../lib/canvas-transform'
import { ColorField, ColorSwatchRow } from './ColorField'
import { Button } from '@/shared/components/ui/button'
import { Slider } from '@/shared/components/ui/slider'
import { cn } from '@/shared/lib/utils'

const FILL_PRESETS = [
  '#6366f1',
  '#8b5cf6',
  '#ec4899',
  '#f59e0b',
  '#10b981',
  '#3b82f6',
  '#ef4444',
  '#0f172a',
  '#ffffff'
] as const

const STROKE_PRESETS = ['#0f172a', '#6366f1', '#ffffff', '#94a3b8', '#ef4444'] as const

const SHAPE_OPTIONS: Array<{ id: PresentationShapeKind; label: string; icon: typeof Square }> = [
  { id: 'rectangle', label: 'Rectangle', icon: Square },
  { id: 'rounded-rectangle', label: 'Rounded', icon: Square },
  { id: 'circle', label: 'Circle', icon: Circle },
  { id: 'triangle', label: 'Triangle', icon: Triangle },
  { id: 'line', label: 'Line', icon: Minus },
  { id: 'arrow', label: 'Arrow', icon: ArrowRight }
]

interface ShapeDesignPanelProps {
  element: ShapeElement
  update: (id: string, patch: Partial<ShapeElement>) => void
}

export function ShapeDesignPanel({ element, update }: ShapeDesignPanelProps) {
  const duplicateSelection = usePresentationDocumentStore((state) => state.duplicateSelection)
  const dispatch = usePresentationDocumentStore((state) => state.dispatch)
  const activeSlideId = usePresentationDocumentStore((state) => state.activeSlideId)
  const line = isLineShape(element.shape)
  const showRadius = element.shape === 'rectangle' || element.shape === 'rounded-rectangle'

  const patch = (changes: Partial<ShapeElement>) => update(element.id, changes)

  return (
    <div className="space-y-4">
      <section>
        <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Shape</p>
        <div className="grid grid-cols-3 gap-1">
          {SHAPE_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              title={option.label}
              onClick={() => patch({ shape: option.id })}
              className={cn(
                'flex flex-col items-center gap-1 rounded-lg py-2 text-[9px] transition-colors',
                element.shape === option.id
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              <option.icon className="h-4 w-4" />
              {option.label}
            </button>
          ))}
        </div>
      </section>

      {!line ? (
        <section className="rounded-lg border border-border/70 bg-muted/25 p-2.5">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Fill</p>
          <ColorSwatchRow
            value={element.fill}
            onChange={(fill) => patch({ fill })}
            presets={FILL_PRESETS}
            allowTransparent
          />
          <div className="mt-1.5">
            <ColorField
              label="Custom"
              value={element.fill}
              allowTransparent
              onChange={(fill) => patch({ fill })}
            />
          </div>
        </section>
      ) : null}

      <section className="rounded-lg border border-border/70 bg-muted/25 p-2.5">
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {line ? 'Line color' : 'Border'}
        </p>
        <ColorSwatchRow
          value={element.stroke}
          onChange={(stroke) => patch({ stroke })}
          presets={STROKE_PRESETS}
          allowTransparent
        />
        <div className="mt-1.5">
          <ColorField
            label={line ? 'Custom line color' : 'Border color'}
            value={element.stroke}
            allowTransparent
            onChange={(stroke) => patch({ stroke })}
          />
        </div>
        <SliderRow
          label="Border width"
          value={element.strokeWidth}
          min={0}
          max={24}
          suffix="px"
          onChange={(strokeWidth) => patch({ strokeWidth })}
        />
      </section>

      <section>
        <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Appearance</p>
        <SliderRow
          label="Opacity"
          value={Math.round(element.opacity * 100)}
          min={0}
          max={100}
          suffix="%"
          onChange={(value) => patch({ opacity: value / 100 })}
        />
        {showRadius ? (
          <SliderRow
            label="Corner radius"
            value={element.borderRadius ?? 0}
            min={0}
            max={120}
            suffix="px"
            onChange={(borderRadius) => patch({ borderRadius })}
          />
        ) : null}
      </section>

      <section>
        <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Size & rotation</p>
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="Width" value={Math.round(element.width)} onChange={(width) => patch({ width: Math.max(20, width) })} />
          <NumberField label="Height" value={Math.round(element.height)} onChange={(height) => patch({ height: Math.max(20, height) })} />
        </div>
        <SliderRow
          label="Rotation"
          value={Math.round(element.rotation)}
          min={-180}
          max={180}
          suffix="°"
          onChange={(rotation) => patch({ rotation })}
        />
        <div className="mt-2 flex gap-1">
          <Button type="button" variant="outline" size="sm" className="h-7 flex-1 text-[10px]" onClick={() => patch({ rotation: element.rotation - 90 })}>
            −90°
          </Button>
          <Button type="button" variant="outline" size="sm" className="h-7 flex-1 text-[10px]" onClick={() => patch({ rotation: element.rotation + 90 })}>
            +90°
          </Button>
          <Button type="button" variant="outline" size="sm" className="h-7 flex-1 text-[10px]" onClick={() => patch({ rotation: 0 })}>
            Reset
          </Button>
        </div>
      </section>

      <section>
        <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Actions</p>
        <div className="grid grid-cols-2 gap-1">
          <Button type="button" variant="outline" size="sm" className="h-8 justify-start gap-1.5 text-[10px]" onClick={() => duplicateSelection()}>
            <Copy className="h-3.5 w-3.5" />
            Duplicate
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 justify-start gap-1.5 text-[10px]"
            onClick={() => activeSlideId && dispatch({ type: 'SET_ELEMENT_ORDER', slideId: activeSlideId, elementId: element.id, direction: 'forward' })}
          >
            <RotateCw className="h-3.5 w-3.5" />
            Forward
          </Button>
        </div>
      </section>
    </div>
  )
}

export function ShapeFloatingToolbar({
  element,
  onUpdate,
  onDuplicate
}: {
  element: ShapeElement
  onUpdate: (patch: Partial<ShapeElement>) => void
  onDuplicate: () => void
}) {
  const line = isLineShape(element.shape)

  return (
    <div className="pointer-events-auto flex items-center gap-1 rounded-lg border border-border/70 bg-background/95 px-2 py-1 shadow-md backdrop-blur-sm">
      {!line ? (
        <>
          {FILL_PRESETS.slice(0, 6).map((color) => (
            <button
              key={color}
              type="button"
              title={`Fill ${color}`}
              onClick={() => onUpdate({ fill: color })}
              className={cn(
                'h-5 w-5 rounded-md border border-border/60 transition-transform hover:scale-110',
                element.fill === color && 'ring-2 ring-primary ring-offset-1 ring-offset-background'
              )}
              style={{ background: color }}
            />
          ))}
          <span className="mx-0.5 h-5 w-px bg-border" />
        </>
      ) : null}
      <ToolbarBtn label="Border" onClick={() => onUpdate({ stroke: element.stroke === '#0f172a' ? '#6366f1' : '#0f172a' })}>
        <span className="h-3 w-3 rounded-full border-2" style={{ borderColor: element.stroke, background: line ? element.stroke : 'transparent' }} />
      </ToolbarBtn>
      <ToolbarBtn label="Opacity" onClick={() => onUpdate({ opacity: element.opacity >= 1 ? 0.5 : 1 })}>
        <span className="text-[10px] font-medium tabular-nums">{Math.round(element.opacity * 100)}%</span>
      </ToolbarBtn>
      <ToolbarBtn label="Rotate 90°" onClick={() => onUpdate({ rotation: element.rotation + 90 })}>
        <RotateCw className="h-3.5 w-3.5" />
      </ToolbarBtn>
      <ToolbarBtn label="Duplicate" onClick={onDuplicate}>
        <Copy className="h-3.5 w-3.5" />
      </ToolbarBtn>
    </div>
  )
}

function ToolbarBtn({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="flex h-7 min-w-[1.75rem] items-center justify-center rounded-md px-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      {children}
    </button>
  )
}

function SliderRow({
  label,
  value,
  min,
  max,
  suffix,
  onChange
}: {
  label: string
  value: number
  min: number
  max: number
  suffix?: string
  onChange: (value: number) => void
}) {
  return (
    <label className="mt-2 block">
      <div className="mb-1 flex items-center justify-between text-[9px] text-muted-foreground">
        <span>{label}</span>
        <span className="tabular-nums">
          {value}
          {suffix ?? ''}
        </span>
      </div>
      <Slider
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full"
      />
    </label>
  )
}

function NumberField({
  label,
  value,
  onChange
}: {
  label: string
  value: number
  onChange: (value: number) => void
}) {
  return (
    <label className="text-[9px] text-muted-foreground">
      {label}
      <input
        type="number"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-0.5 h-7 w-full rounded-md border-0 bg-muted/40 px-2 text-[11px] tabular-nums outline-none focus:ring-1 focus:ring-primary/30"
      />
    </label>
  )
}
