import { useEffect, useState, type ReactNode } from 'react'
import {
  AlignCenter,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignStartVertical,
  ArrowUp,
  Bold,
  Italic,
  Layers3,
  Lock,
  Palette,
  Strikethrough,
  Trash2,
  Underline,
  Unlock
} from 'lucide-react'
import type {
  PresentationSlide,
  SlideElement,
  SlideSize,
  TextElement
} from '@shared/types/presentation-document'
import { applySlideLayout, PRESENTATION_LAYOUTS } from '@shared/lib/presentation-layouts'
import { getSlideElements } from '@shared/lib/presentation-schema'
import { getPresentationTheme } from '@shared/lib/presentation-model'
import { usePresentationDocumentStore } from '../stores/presentation-document.store'
import {
  alignElementToSlide,
  alignElementsGroup,
  FONT_FAMILIES,
  type CanvasAlignMode
} from '../lib/presentation-inspector'
import { ShapeDesignPanel } from './ShapeDesignPanel'
import { ColorField } from './ColorField'
import { Input } from '@/shared/components/ui/input'
import { Textarea } from '@/shared/components/ui/textarea'
import { cn } from '@/shared/lib/utils'

interface DesignInspectorPanelProps {
  slide: PresentationSlide
  element?: SlideElement
  selectedIds: string[]
  slideSize: SlideSize
}

export function DesignInspectorPanel({ slide, element, selectedIds, slideSize }: DesignInspectorPanelProps) {
  const [tab, setTab] = useState<'slide' | 'element'>(element ? 'element' : 'slide')
  const activeTab = element ? tab : 'slide'
  const dispatch = usePresentationDocumentStore((state) => state.dispatch)
  const update = usePresentationDocumentStore((state) => state.updateElement)

  useEffect(() => {
    setTab(element ? 'element' : 'slide')
  }, [element?.id])

  return (
    <aside className="app-panel flex h-full w-[18.5rem] shrink-0 flex-col border-l border-border/70 bg-card">
      <header className="flex items-center justify-between gap-2 border-b border-border/70 px-3 py-2.5">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold capitalize leading-none">
            {element ? element.type : 'Slide'}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {element ? 'Element properties' : 'Deck settings'}
          </p>
        </div>
        {element ? (
          <div className="flex shrink-0 items-center gap-0.5 rounded-md border border-border/70 bg-muted/30 p-0.5">
            <IconAction
              icon={element.locked ? Unlock : Lock}
              label={element.locked ? 'Unlock' : 'Lock'}
              onClick={() => update(element.id, { locked: !element.locked } as Partial<SlideElement>)}
            />
            <IconAction
              icon={ArrowUp}
              label="Bring forward"
              onClick={() =>
                dispatch({ type: 'SET_ELEMENT_ORDER', slideId: slide.id, elementId: element.id, direction: 'forward' })
              }
            />
            <IconAction
              icon={Trash2}
              label="Delete"
              destructive
              onClick={() => usePresentationDocumentStore.getState().deleteSelection()}
            />
          </div>
        ) : null}
      </header>

      {element ? (
        <div className="border-b border-border/70 px-2 py-1.5">
          <div className="grid h-7 grid-cols-2 gap-0.5 rounded-lg bg-muted/50 p-0.5">
            {(['slide', 'element'] as const).map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={cn(
                  'rounded-md text-[11px] font-medium capitalize transition-colors',
                  activeTab === id
                    ? 'bg-background text-primary shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {id}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2.5">
        <div key={activeTab === 'element' && element ? element.id : slide.id} className="animate-fade-in space-y-3">
          {activeTab === 'slide' ? <SlideInspector slide={slide} /> : null}
          {activeTab === 'element' && element ? (
            <ElementInspector element={element} slide={slide} selectedIds={selectedIds} slideSize={slideSize} />
          ) : null}
        </div>
      </div>
    </aside>
  )
}

function SlideInspector({ slide }: { slide: PresentationSlide }) {
  const dispatch = usePresentationDocumentStore((state) => state.dispatch)
  const document = usePresentationDocumentStore((state) => state.document)
  if (!document) return null
  const theme = getPresentationTheme(document.themeId, document.themeOverrides)

  return (
    <>
      <InspectorSection title="Layout" icon={Layers3}>
        <select
          value={slide.layout ?? 'blank'}
          onChange={(event) => {
            const next = applySlideLayout(slide, event.target.value)
            dispatch({
              type: 'SET_SLIDE_ELEMENTS',
              slideId: slide.id,
              layout: next.layout,
              elements: next.elements ?? []
            })
          }}
          className="h-7 w-full rounded-md border border-border/70 bg-background px-2 text-[12px] transition-colors focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring/30"
        >
          {PRESENTATION_LAYOUTS.map((layout) => (
            <option key={layout.id} value={layout.id}>
              {layout.name}
            </option>
          ))}
        </select>
      </InspectorSection>

      <InspectorSection title="Theme" icon={Palette}>
        <label className="block text-[10px] text-muted-foreground">Preset</label>
        <select
          value={document.themeId}
          onChange={(event) => dispatch({ type: 'SET_THEME', themeId: event.target.value })}
          className="h-7 w-full rounded-md border border-border/70 bg-background px-2 text-[12px] focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring/30"
        >
          {['professional', 'modern', 'bold', 'minimal', 'warm', 'dark', 'coral', 'forest', 'midnight', 'canvas'].map(
            (value) => (
              <option key={value} value={value}>
                {value}
              </option>
            )
          )}
        </select>
        <div className="mt-1.5 grid grid-cols-1 gap-1.5">
          <ColorField
            label="Background"
            value={theme.colors.background}
            onChange={(background) =>
              dispatch({
                type: 'CUSTOMIZE_THEME',
                colors: { background, text: theme.colors.text, accent: theme.colors.accent }
              })
            }
          />
          <ColorField
            label="Text"
            value={theme.colors.text}
            onChange={(text) =>
              dispatch({
                type: 'CUSTOMIZE_THEME',
                colors: { background: theme.colors.background, text, accent: theme.colors.accent }
              })
            }
          />
          <ColorField
            label="Accent"
            value={theme.colors.accent}
            onChange={(accent) =>
              dispatch({
                type: 'CUSTOMIZE_THEME',
                colors: { background: theme.colors.background, text: theme.colors.text, accent }
              })
            }
          />
        </div>
      </InspectorSection>

      <InspectorSection title="Slide background">
        <ColorField
          label="Background color"
          value={slide.background.color ?? '#ffffff'}
          onChange={(color) =>
            dispatch({
              type: 'UPDATE_SLIDE',
              slideId: slide.id,
              patch: { background: { type: 'solid', color } }
            })
          }
        />
      </InspectorSection>

      <InspectorSection title="Speaker notes">
        <Textarea
          value={slide.speakerNotes ?? ''}
          onChange={(event) =>
            dispatch({ type: 'UPDATE_SLIDE', slideId: slide.id, patch: { speakerNotes: event.target.value } })
          }
          placeholder="Notes for presenter…"
          className="min-h-[72px] resize-none text-[11px]"
        />
      </InspectorSection>
    </>
  )
}

function ElementInspector({
  element,
  slide,
  selectedIds,
  slideSize
}: {
  element: SlideElement
  slide: PresentationSlide
  selectedIds: string[]
  slideSize: SlideSize
}) {
  const update = usePresentationDocumentStore((state) => state.updateElement)
  const dispatch = usePresentationDocumentStore((state) => state.dispatch)
  const selectedElements = getSlideElements(slide).filter((item) => selectedIds.includes(item.id))

  const applyCanvasAlign = (mode: CanvasAlignMode) => {
    if (selectedElements.length === 1) {
      update(element.id, alignElementToSlide(element, slideSize, mode))
      return
    }
    const groupModeMap = {
      'slide-left': 'left',
      'slide-center-h': 'center',
      'slide-right': 'right',
      'slide-top': 'top',
      'slide-center-v': 'middle',
      'slide-bottom': 'bottom'
    } as const
    const aligned = alignElementsGroup(selectedElements, groupModeMap[mode])
    dispatch({
      type: 'SET_SLIDE_ELEMENTS',
      slideId: slide.id,
      elements: getSlideElements(slide).map((item) => aligned.find((next) => next.id === item.id) ?? item)
    })
  }

  return (
    <>
      {element.type === 'text' ? <TextStyleInspector element={element} update={update} /> : null}
      {element.type === 'shape' ? <ShapeDesignPanel element={element} update={update} /> : null}
      {element.type === 'image' ? <ImageStyleInspector element={element} update={update} /> : null}
      {element.type === 'table' ? <TableStyleInspector element={element} update={update} /> : null}
      {element.type === 'code' ? (
        <InspectorSection title="Code">
          <Textarea
            value={element.code}
            onChange={(event) => update(element.id, { code: event.target.value })}
            className="min-h-[100px] font-mono text-[11px]"
          />
        </InspectorSection>
      ) : null}

      <InspectorSection title="Align">
        <div className="grid grid-cols-3 gap-1">
          <AlignButton icon={AlignStartHorizontal} label="Left" onClick={() => applyCanvasAlign('slide-left')} />
          <AlignButton icon={AlignCenter} label="Center H" onClick={() => applyCanvasAlign('slide-center-h')} />
          <AlignButton icon={AlignEndHorizontal} label="Right" onClick={() => applyCanvasAlign('slide-right')} />
          <AlignButton icon={AlignStartVertical} label="Top" onClick={() => applyCanvasAlign('slide-top')} />
          <AlignButton icon={AlignCenterVertical} label="Center V" onClick={() => applyCanvasAlign('slide-center-v')} />
          <AlignButton icon={AlignEndVertical} label="Bottom" onClick={() => applyCanvasAlign('slide-bottom')} />
        </div>
      </InspectorSection>

      {element.type !== 'shape' ? (
        <InspectorSection title="Transform">
          <div className="grid grid-cols-4 gap-1.5">
            {(['x', 'y', 'width', 'height'] as const).map((key) => (
              <label key={key} className="text-[9px] uppercase tracking-wide text-muted-foreground">
                {key}
                <Input
                  type="number"
                  value={Math.round(element[key])}
                  onChange={(event) =>
                    update(element.id, { [key]: Number(event.target.value) } as Partial<SlideElement>)
                  }
                  className="mt-0.5 h-7 px-1.5 text-[11px]"
                />
              </label>
            ))}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <label className="text-[9px] text-muted-foreground">
              Rotation
              <Input
                type="number"
                value={Math.round(element.rotation)}
                onChange={(event) => update(element.id, { rotation: Number(event.target.value) })}
                className="mt-0.5 h-7 text-[11px]"
              />
            </label>
            <label className="text-[9px] text-muted-foreground">
              Opacity %
              <Input
                type="number"
                min={0}
                max={100}
                value={Math.round(element.opacity * 100)}
                onChange={(event) => update(element.id, { opacity: Number(event.target.value) / 100 })}
                className="mt-0.5 h-7 text-[11px]"
              />
            </label>
          </div>
        </InspectorSection>
      ) : null}
    </>
  )
}

function TextStyleInspector({
  element,
  update
}: {
  element: TextElement
  update: (id: string, patch: Partial<SlideElement>) => void
}) {
  const isBold = element.fontWeight >= 600
  const isItalic = element.fontStyle === 'italic'
  const isUnderline = element.textDecoration === 'underline'
  const isStrike = element.textDecoration === 'line-through'

  return (
    <InspectorSection title="Text">
      <Textarea
        value={element.content}
        onChange={(event) => update(element.id, { content: event.target.value })}
        placeholder="Edit text…"
        className="mb-2 min-h-[48px] resize-none border-0 bg-muted/40 text-[12px] focus-visible:ring-1"
      />

      <div className="flex flex-wrap gap-0.5 rounded-md bg-muted/40 p-0.5">
        <FormatToggle active={isBold} label="Bold" icon={Bold} onClick={() => update(element.id, { fontWeight: isBold ? 400 : 700 })} />
        <FormatToggle active={isItalic} label="Italic" icon={Italic} onClick={() => update(element.id, { fontStyle: isItalic ? 'normal' : 'italic' })} />
        <FormatToggle active={isUnderline} label="Underline" icon={Underline} onClick={() => update(element.id, { textDecoration: isUnderline ? 'none' : 'underline' })} />
        <FormatToggle active={isStrike} label="Strikethrough" icon={Strikethrough} onClick={() => update(element.id, { textDecoration: isStrike ? 'none' : 'line-through' })} />
      </div>

      <div className="mt-2 grid grid-cols-[1fr_72px] gap-1.5">
        <select
          value={element.fontFamily}
          onChange={(event) => update(element.id, { fontFamily: event.target.value })}
          className="h-7 rounded-md border-0 bg-muted/40 px-2 text-[11px]"
          style={{ fontFamily: element.fontFamily }}
        >
          {FONT_FAMILIES.map((font) => (
            <option key={font.value} value={font.value}>{font.label}</option>
          ))}
        </select>
        <Input
          type="number"
          min={8}
          max={200}
          value={element.fontSize}
          onChange={(event) => update(element.id, { fontSize: Number(event.target.value) })}
          className="h-7 border-0 bg-muted/40 text-center text-[11px]"
        />
      </div>

      <div className="mt-1.5 grid grid-cols-1 gap-1.5">
        <ColorField label="Color" value={element.textColor} onChange={(textColor) => update(element.id, { textColor })} />
        <ColorField
          label="Highlight"
          value={element.backgroundColor ?? 'transparent'}
          allowTransparent
          onChange={(backgroundColor) =>
            update(element.id, {
              backgroundColor: backgroundColor === 'transparent' ? undefined : backgroundColor
            })
          }
        />
      </div>

      <div className="mt-2 flex gap-0.5">
        {(['left', 'center', 'right', 'justify'] as const).map((align) => (
          <button
            key={align}
            type="button"
            onClick={() => update(element.id, { textAlign: align })}
            className={cn(
              'flex-1 rounded-md py-1 text-[9px] capitalize transition-colors',
              element.textAlign === align ? 'bg-foreground text-background' : 'bg-muted/40 text-muted-foreground hover:text-foreground'
            )}
          >
            {align.slice(0, 1)}
          </button>
        ))}
      </div>
    </InspectorSection>
  )
}

function ImageStyleInspector({
  element,
  update
}: {
  element: Extract<SlideElement, { type: 'image' }>
  update: (id: string, patch: Partial<SlideElement>) => void
}) {
  return (
    <InspectorSection title="Image">
      <label className="block text-[10px] text-muted-foreground">Alt text</label>
      <Input
        value={element.alt}
        onChange={(event) => update(element.id, { alt: event.target.value })}
        className="mt-0.5 h-7 text-[11px]"
      />
      <label className="mt-2 block text-[10px] text-muted-foreground">Object fit</label>
      <select
        value={element.objectFit}
        onChange={(event) => update(element.id, { objectFit: event.target.value as typeof element.objectFit })}
        className="mt-1 h-7 w-full rounded-md border border-input bg-background px-2 text-[11px]"
      >
        <option value="cover">Cover</option>
        <option value="contain">Contain</option>
        <option value="fill">Fill</option>
      </select>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <label className="text-[10px] text-muted-foreground">
          Border radius
          <Input
            type="number"
            min={0}
            value={element.borderRadius}
            onChange={(event) => update(element.id, { borderRadius: Number(event.target.value) })}
            className="mt-0.5 h-7 text-[11px]"
          />
        </label>
        <label className="text-[10px] text-muted-foreground">
          Border width
          <Input
            type="number"
            min={0}
            value={element.borderWidth}
            onChange={(event) => update(element.id, { borderWidth: Number(event.target.value) })}
            className="mt-0.5 h-7 text-[11px]"
          />
        </label>
      </div>
      <ColorField
        label="Border color"
        value={element.borderColor ?? '#cbd5e1'}
        onChange={(borderColor) => update(element.id, { borderColor })}
      />
    </InspectorSection>
  )
}

function TableStyleInspector({
  element,
  update
}: {
  element: Extract<SlideElement, { type: 'table' }>
  update: (id: string, patch: Partial<SlideElement>) => void
}) {
  return (
    <InspectorSection title="Table style">
      <label className="block text-[10px] text-muted-foreground">
        Font size
        <Input
          type="number"
          value={element.fontSize}
          onChange={(event) => update(element.id, { fontSize: Number(event.target.value) })}
          className="mt-0.5 h-7 text-[11px]"
        />
      </label>
      <div className="mt-2">
        <ColorField label="Text color" value={element.textColor} onChange={(textColor) => update(element.id, { textColor })} />
      </div>
      <label className="mt-2 block text-[10px] text-muted-foreground">Cells (tab-separated)</label>
      <Textarea
        value={element.rows.map((row) => row.join('\t')).join('\n')}
        onChange={(event) =>
          update(element.id, { rows: event.target.value.split('\n').map((row) => row.split('\t')) })
        }
        className="mt-1 min-h-[96px] font-mono text-[11px]"
      />
    </InspectorSection>
  )
}

function InspectorSection({
  title,
  icon: Icon,
  children
}: {
  title: string
  icon?: typeof Layers3
  children: ReactNode
}) {
  return (
    <section className="rounded-lg border border-border/70 bg-muted/25 p-2.5">
      <div className="mb-2 flex items-center gap-1.5">
        {Icon ? <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : null}
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </span>
      </div>
      <div className="space-y-1.5">{children}</div>
    </section>
  )
}

function IconAction({
  icon: Icon,
  label,
  onClick,
  destructive
}: {
  icon: typeof Lock
  label: string
  onClick: () => void
  destructive?: boolean
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={cn(
        'flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-background hover:text-foreground',
        destructive && 'hover:bg-destructive/10 hover:text-destructive'
      )}
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  )
}

function FormatToggle({
  active,
  label,
  icon: Icon,
  onClick
}: {
  active: boolean
  label: string
  icon: typeof Bold
  onClick: () => void
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'flex h-7 w-7 items-center justify-center rounded-md transition-colors',
        active ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
      )}
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  )
}

function AlignButton({
  icon: Icon,
  label,
  onClick
}: {
  icon: typeof AlignCenter
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="flex h-7 items-center justify-center rounded-md border border-border/50 bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:scale-95"
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  )
}
