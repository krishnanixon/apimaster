import { useEffect, useState, type DragEvent, type MouseEvent } from 'react'
import { ArrowDown, ArrowUp, ChevronDown, Copy, LayoutTemplate, Layers3, Plus, Trash2 } from 'lucide-react'
import type { PresentationDocument, PresentationSlide } from '@shared/types/presentation-document'
import { PRESENTATION_LAYOUTS } from '@shared/lib/presentation-layouts'
import { usePresentationDocumentStore } from '../stores/presentation-document.store'
import { ScaledSlideFrame } from './ScaledSlideFrame'
import { TemplatesPanel } from './TemplatesPanel'
import { LayoutWireframe } from './TemplatePreviewCard'
import { Button } from '@/shared/components/ui/button'
import { cn } from '@/shared/lib/utils'

interface PresentationLeftRailProps {
  document: PresentationDocument
  activeSlideId: string
  projectId: string
  onSlideContextMenu?: (event: MouseEvent, slideId: string) => void
  onOpenDesign: (mode: 'deck' | 'slide' | 'redesign') => void
  openTemplatesSignal?: number
}

export function PresentationLeftRail({
  document,
  activeSlideId,
  projectId,
  onSlideContextMenu,
  onOpenDesign,
  openTemplatesSignal
}: PresentationLeftRailProps) {
  const [tab, setTab] = useState<'slides' | 'templates'>('slides')

  useEffect(() => {
    if (openTemplatesSignal) setTab('templates')
  }, [openTemplatesSignal])

  return (
    <aside className="app-panel flex w-56 shrink-0 flex-col border-r border-border/70 bg-card">
      <div className="m-1.5 grid grid-cols-2 gap-0.5 rounded-lg bg-muted/50 p-0.5">
        {([
          { id: 'slides' as const, label: 'Slides', icon: Layers3 },
          { id: 'templates' as const, label: 'Templates', icon: LayoutTemplate }
        ]).map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={cn(
              'flex h-7 items-center justify-center gap-1 rounded-md text-[11px] font-medium transition-colors',
              tab === item.id
                ? 'bg-background text-primary shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <item.icon className="h-3 w-3" />
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'slides' ? (
        <SlideNavigatorPanel
          document={document}
          activeSlideId={activeSlideId}
          onSlideContextMenu={onSlideContextMenu}
        />
      ) : (
        <TemplatesPanel
          projectId={projectId}
          onOpenDesign={onOpenDesign}
          onApplied={() => setTab('slides')}
        />
      )}
    </aside>
  )
}

function SlideNavigatorPanel({
  document,
  activeSlideId,
  onSlideContextMenu
}: {
  document: PresentationDocument
  activeSlideId: string
  onSlideContextMenu?: (event: MouseEvent, slideId: string) => void
}) {
  const state = usePresentationDocumentStore()
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const activeIndex = document.slides.findIndex((slide) => slide.id === activeSlideId)

  useEffect(() => {
    if (!addMenuOpen) return
    const close = () => setAddMenuOpen(false)
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [addMenuOpen])

  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        <div className="relative mb-2">
          <Button
            size="sm"
            variant="ghost"
            className="h-8 w-full justify-start gap-2 text-[11px] text-muted-foreground hover:text-foreground"
            onClick={(event) => {
              event.stopPropagation()
              setAddMenuOpen((value) => !value)
            }}
          >
            <Plus className="h-3.5 w-3.5" />
            Add slide
            <ChevronDown className="ml-auto h-3 w-3" />
          </Button>
          {addMenuOpen ? (
            <div
              className="absolute left-0 right-0 top-full z-30 mt-1 max-h-72 overflow-y-auto rounded-lg border bg-popover p-1 shadow-lg"
              onPointerDown={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[10px] hover:bg-muted"
                onClick={() => {
                  state.addSlide()
                  setAddMenuOpen(false)
                }}
              >
                Blank slide
              </button>
              <p className="px-2 py-1 text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
                With layout
              </p>
              {PRESENTATION_LAYOUTS.filter((layout) => layout.id !== 'blank').map((layout) => (
                <button
                  key={layout.id}
                  type="button"
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted"
                  onClick={() => {
                    state.addSlideWithLayout(layout.id)
                    setAddMenuOpen(false)
                  }}
                >
                  <div className="h-8 w-12 shrink-0 overflow-hidden rounded border border-border/40 bg-muted/30">
                    <div className="h-full w-full origin-top-left scale-[0.35]">
                      <LayoutWireframe variant={layout.id} />
                    </div>
                  </div>
                  <span className="text-[10px] font-medium">{layout.name}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {document.slides.map((slide, index) => (
          <SlideThumb
            key={slide.id}
            index={index}
            slide={slide}
            logicalSize={document.logicalSize}
            active={activeSlideId === slide.id}
            dragging={draggingId === slide.id}
            onSelect={() => state.setActiveSlide(slide.id)}
            onDragStart={(event) => {
              setDraggingId(slide.id)
              event.dataTransfer.effectAllowed = 'move'
              event.dataTransfer.setData('application/x-presentation-slide', slide.id)
            }}
            onDragEnd={() => setDraggingId(null)}
            onDragOver={(event) => {
              event.preventDefault()
              event.dataTransfer.dropEffect = 'move'
            }}
            onDrop={(event) => {
              event.preventDefault()
              const id = event.dataTransfer.getData('application/x-presentation-slide') || draggingId
              if (id && id !== slide.id) state.dispatch({ type: 'MOVE_SLIDE', slideId: id, toIndex: index })
              setDraggingId(null)
            }}
            onContextMenu={(event) => {
              event.preventDefault()
              state.setActiveSlide(slide.id)
              onSlideContextMenu?.(event, slide.id)
            }}
          />
        ))}
      </div>

      <div className="grid grid-cols-4 gap-0.5 border-t border-border/70 bg-card p-1.5">
        <NavAction
          icon={ArrowUp}
          label="Move up"
          disabled={activeIndex <= 0}
          onClick={() => state.dispatch({ type: 'MOVE_SLIDE', slideId: activeSlideId, toIndex: activeIndex - 1 })}
        />
        <NavAction
          icon={ArrowDown}
          label="Move down"
          disabled={activeIndex >= document.slides.length - 1}
          onClick={() => state.dispatch({ type: 'MOVE_SLIDE', slideId: activeSlideId, toIndex: activeIndex + 1 })}
        />
        <NavAction icon={Copy} label="Duplicate" onClick={state.duplicateActiveSlide} />
        <NavAction icon={Trash2} label="Delete" destructive onClick={state.deleteActiveSlide} />
      </div>
    </>
  )
}

function SlideThumb({
  index,
  slide,
  logicalSize,
  active,
  dragging,
  onSelect,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  onContextMenu
}: {
  index: number
  slide: PresentationSlide
  logicalSize: { width: number; height: number }
  active: boolean
  dragging: boolean
  onSelect: () => void
  onDragStart: (event: DragEvent) => void
  onDragEnd: () => void
  onDragOver: (event: DragEvent) => void
  onDrop: (event: DragEvent) => void
  onContextMenu: (event: MouseEvent) => void
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') onSelect()
      }}
      onContextMenu={onContextMenu}
      className={cn(
        'group mb-1.5 w-full cursor-grab rounded-lg border border-transparent p-1 text-left transition-all active:cursor-grabbing',
        active ? 'border-border/70 bg-accent text-foreground' : 'hover:bg-muted/60',
        dragging && 'opacity-40',
        slide.hidden && 'opacity-50'
      )}
    >
      <div className="mb-1 flex items-center justify-between px-0.5">
        <span
          className={cn(
            'flex h-5 min-w-[1.25rem] items-center justify-center rounded-md px-1 text-[10px] font-medium tabular-nums',
            active ? 'bg-primary text-primary-foreground' : 'bg-muted/80 text-muted-foreground'
          )}
        >
          {index + 1}
        </span>
        <span className="truncate text-[10px] text-muted-foreground">{slide.title || slide.layout || 'Slide'}</span>
      </div>
      <div className="aspect-video overflow-hidden rounded-md border border-border/60 bg-muted/30">
        <ScaledSlideFrame slide={slide} logicalSize={logicalSize} className="h-full w-full" />
      </div>
    </div>
  )
}

function NavAction({
  icon: Icon,
  label,
  onClick,
  disabled,
  destructive
}: {
  icon: typeof ArrowUp
  label: string
  onClick: () => void
  disabled?: boolean
  destructive?: boolean
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn(
        'h-7 w-full rounded-md p-0 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
        destructive && 'text-destructive hover:bg-destructive/10 hover:text-destructive'
      )}
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon className="h-3.5 w-3.5" />
    </Button>
  )
}

export function useCloseOnOutsidePointer(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return
    const close = () => onClose()
    window.addEventListener('pointerdown', close)
    window.addEventListener('blur', close)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('blur', close)
    }
  }, [open, onClose])
}
