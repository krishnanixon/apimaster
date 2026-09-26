import { GripVertical, ImageIcon, Plus } from 'lucide-react'
import { cardHeading, getPresentationTheme } from '@shared/lib/presentation-model'
import type { PresentationCard, PresentationTheme } from '@shared/types/presentation'
import { usePresentationEditorStore } from '../stores/presentation-editor.store'
import { Button } from '@/shared/components/ui/button'
import { cn } from '@/shared/lib/utils'

function firstImageSrc(card: PresentationCard): string | undefined {
  const image = card.blocks.find((block) => block.type === 'image' && block.src)
  return image && image.type === 'image' ? image.src : undefined
}

function CardThumbnail({
  card,
  theme,
  index,
  selected
}: {
  card: PresentationCard
  theme: PresentationTheme
  index: number
  selected: boolean
}) {
  const imageSrc = firstImageSrc(card)
  const isTitle = card.layout === 'title'
  const heading = cardHeading(card)

  return (
    <div
      className={cn(
        'relative aspect-video w-full overflow-hidden rounded-md border shadow-sm transition-transform',
        selected
          ? 'ring-2 ring-[#0d99ff] ring-offset-1 ring-offset-[#1e1e1e]'
          : 'hover:scale-[1.01]'
      )}
      style={{
        borderColor: selected ? '#0d99ff' : theme.colors.border,
        background: isTitle ? theme.colors.accent : theme.colors.surface
      }}
    >
      {imageSrc ? (
        <img src={imageSrc} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : null}
      <div
        className={cn(
          'absolute inset-0 flex flex-col justify-between p-2',
          imageSrc && 'bg-gradient-to-t from-black/55 via-black/10 to-transparent'
        )}
      >
        <div
          className="line-clamp-2 text-[9px] font-semibold leading-tight"
          style={{
            color: imageSrc ? '#fff' : isTitle ? theme.colors.accentText : theme.colors.text,
            fontFamily: theme.fonts.heading
          }}
        >
          {heading}
        </div>
        <div className="flex items-end justify-between gap-1">
          <span className="rounded bg-black/55 px-1.5 py-0.5 text-[9px] font-medium text-white">
            {index + 1}
          </span>
          {imageSrc ? <ImageIcon className="h-3 w-3 text-white/90" /> : null}
        </div>
      </div>
    </div>
  )
}

export function OutlineSidebar({ orientation = 'left' }: { orientation?: 'left' | 'bottom' }) {
  const cards = usePresentationEditorStore((s) => s.cards)
  const selectedCardId = usePresentationEditorStore((s) => s.selectedCardId)
  const selectedCardIds = usePresentationEditorStore((s) => s.selectedCardIds)
  const themeId = usePresentationEditorStore((s) => s.themeId)
  const themeOverrides = usePresentationEditorStore((s) => s.themeOverrides)
  const selectCard = usePresentationEditorStore((s) => s.selectCard)
  const toggleCardSelection = usePresentationEditorStore((s) => s.toggleCardSelection)
  const moveCard = usePresentationEditorStore((s) => s.moveCard)
  const setPresenting = usePresentationEditorStore((s) => s.setPresenting)
  const addCard = usePresentationEditorStore((s) => s.addCard)
  const theme = getPresentationTheme(themeId, themeOverrides)

  if (orientation === 'bottom') {
    return (
      <aside className="flex h-[152px] shrink-0 flex-col border-t border-white/10 bg-[#17181b] text-white">
        <div className="flex h-8 items-center justify-between px-3">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-white/55">
            Slides · {cards.length}
          </span>
          <Button type="button" variant="ghost" size="sm" className="h-6 text-[10px] text-white/70 hover:bg-white/10 hover:text-white" onClick={() => addCard('content')}>
            <Plus className="h-3 w-3" /> Add slide
          </Button>
        </div>
        <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto px-3 pb-3">
          {cards.map((card, index) => {
            const selected = selectedCardIds.includes(card.id) || card.id === selectedCardId
            return (
              <button
                key={card.id}
                type="button"
                draggable
                onDragStart={(event) => event.dataTransfer.setData('application/x-presentation-card', card.id)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault()
                  const draggedId = event.dataTransfer.getData('application/x-presentation-card')
                  if (draggedId && draggedId !== card.id) moveCard(draggedId, index)
                }}
                onClick={(event) => {
                  if (event.ctrlKey || event.metaKey || event.shiftKey) toggleCardSelection(card.id)
                  else selectCard(card.id)
                }}
                onDoubleClick={() => setPresenting(true, index)}
                className="w-36 shrink-0 text-left"
              >
                <CardThumbnail card={card} theme={theme} index={index} selected={selected} />
              </button>
            )
          })}
        </div>
      </aside>
    )
  }

  return (
    <aside className="flex h-full w-[224px] shrink-0 flex-col border-r border-border/60 bg-[#17181b] text-white">
      <div className="flex h-12 items-center justify-between border-b border-white/10 px-3">
        <div>
          <div className="text-xs font-semibold tracking-wide text-white/90">Slides</div>
          <div className="text-[10px] text-white/45">
            {cards.length} total
            {selectedCardIds.length > 1 ? ` · ${selectedCardIds.length} selected` : ''}
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 text-white/70 hover:bg-white/10 hover:text-white"
          onClick={() => addCard('content')}
          title="Add slide"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3.5">
        {cards.map((card, index) => {
          const selected = selectedCardIds.includes(card.id) || card.id === selectedCardId
          return (
            <button
              key={card.id}
              type="button"
              draggable
              onDragStart={(event) =>
                event.dataTransfer.setData('application/x-presentation-card', card.id)
              }
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault()
                const draggedId = event.dataTransfer.getData('application/x-presentation-card')
                if (draggedId && draggedId !== card.id) moveCard(draggedId, index)
              }}
              onClick={(event) => {
                if (event.ctrlKey || event.metaKey || event.shiftKey) toggleCardSelection(card.id)
                else selectCard(card.id)
                const el = document.querySelector(`[data-card-id="${card.id}"]`)
                el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
              }}
              onDoubleClick={() => setPresenting(true, index)}
              className="group relative w-full pl-5 text-left"
            >
              <span
                className={cn(
                  'absolute left-0 top-1 flex h-5 w-4 items-center justify-center text-[10px]',
                  selected ? 'font-semibold text-[#55b7ff]' : 'text-white/35'
                )}
              >
                <GripVertical className="absolute h-3 w-3 opacity-0 transition-opacity group-hover:opacity-70" />
                <span className="group-hover:opacity-0">{index + 1}</span>
              </span>
              <CardThumbnail card={card} theme={theme} index={index} selected={selected} />
              <div className="mt-1 truncate px-0.5 text-[10px] text-white/50 group-hover:text-white/75">
                {cardHeading(card)}
              </div>
            </button>
          )
        })}
      </div>

      <div className="border-t border-white/10 p-2.5">
        <Button
          type="button"
          size="sm"
          className="h-8 w-full bg-[#0d99ff] text-[11px] text-white hover:bg-[#0b87e0]"
          onClick={() => addCard('content')}
        >
          <Plus className="h-3.5 w-3.5" />
          Add slide
        </Button>
      </div>
    </aside>
  )
}
