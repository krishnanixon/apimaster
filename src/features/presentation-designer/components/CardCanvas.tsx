import { useEffect, useState } from 'react'
import { getPresentationTheme } from '@shared/lib/presentation-model'
import { usePresentationEditorStore } from '../stores/presentation-editor.store'
import { CardView } from './CardView'
import { Plus } from 'lucide-react'
import { ArrowDown, ArrowUp, Copy, Edit3, Trash2 } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { cn } from '@/shared/lib/utils'

export function CardCanvas({ zoom = 100 }: { zoom?: number }) {
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    blockId: string
  } | null>(null)
  const cards = usePresentationEditorStore((s) => s.cards)
  const themeId = usePresentationEditorStore((s) => s.themeId)
  const themeOverrides = usePresentationEditorStore((s) => s.themeOverrides)
  const selectedCardId = usePresentationEditorStore((s) => s.selectedCardId)
  const selectedBlockId = usePresentationEditorStore((s) => s.selectedBlockId)
  const aspectRatio = usePresentationEditorStore((s) => s.aspectRatio)
  const selectCard = usePresentationEditorStore((s) => s.selectCard)
  const selectBlock = usePresentationEditorStore((s) => s.selectBlock)
  const updateBlock = usePresentationEditorStore((s) => s.updateBlock)
  const moveBlock = usePresentationEditorStore((s) => s.moveBlock)
  const addCard = usePresentationEditorStore((s) => s.addCard)
  const cardsForActions = usePresentationEditorStore((s) => s.cards)
  const theme = getPresentationTheme(themeId, themeOverrides)

  useEffect(() => {
    if (!contextMenu) return
    const close = () => setContextMenu(null)
    window.addEventListener('pointerdown', close)
    window.addEventListener('blur', close)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('blur', close)
    }
  }, [contextMenu])

  const selectedCard = cardsForActions.find((card) => card.id === selectedCardId)
  const selectedBlockIndex = selectedCard?.blocks.findIndex(
    (block) => block.id === selectedBlockId
  ) ?? -1

  const duplicateSelectedBlock = () => {
    if (!selectedCard || selectedBlockIndex < 0) return
    const source = selectedCard.blocks[selectedBlockIndex]
    const copy = { ...structuredClone(source), id: crypto.randomUUID() }
    const blocks = [...selectedCard.blocks]
    blocks.splice(selectedBlockIndex + 1, 0, copy)
    usePresentationEditorStore.getState().updateCard(selectedCard.id, { blocks })
    selectBlock(copy.id)
  }

  const deleteSelectedBlock = () => {
    if (!selectedCard || selectedBlockIndex < 0) return
    usePresentationEditorStore.getState().updateCard(selectedCard.id, {
      blocks: selectedCard.blocks.filter((block) => block.id !== selectedBlockId)
    })
    selectBlock(null)
  }

  return (
    <div
      className="presentation-canvas h-full overflow-y-auto px-6 py-8"
      style={{
        backgroundColor: theme.colors.background,
        backgroundImage: `radial-gradient(${theme.colors.border} 0.7px, transparent 0.7px)`,
        backgroundSize: '18px 18px'
      }}
    >
      {selectedCard && selectedBlockIndex >= 0 ? (
        <div className="sticky top-3 z-20 mx-auto mb-3 flex w-fit items-center gap-1 rounded-xl border border-border/70 bg-background/95 p-1 shadow-lg backdrop-blur">
          <span className="px-2 text-[10px] font-medium text-muted-foreground">Selected element</span>
          <Button type="button" size="sm" variant="ghost" className="h-7 w-7 p-0" disabled={selectedBlockIndex === 0} title="Move up" onClick={() => moveBlock(selectedCard.id, selectedBlockId!, selectedBlockIndex - 1)}>
            <ArrowUp className="h-3.5 w-3.5" />
          </Button>
          <Button type="button" size="sm" variant="ghost" className="h-7 w-7 p-0" disabled={selectedBlockIndex === selectedCard.blocks.length - 1} title="Move down" onClick={() => moveBlock(selectedCard.id, selectedBlockId!, selectedBlockIndex + 1)}>
            <ArrowDown className="h-3.5 w-3.5" />
          </Button>
          <Button type="button" size="sm" variant="ghost" className="h-7 w-7 p-0" title="Duplicate element (Ctrl+D)" onClick={duplicateSelectedBlock}>
            <Copy className="h-3.5 w-3.5" />
          </Button>
          <Button type="button" size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive" title="Delete element" onClick={deleteSelectedBlock}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ) : null}
      <div
        className="mx-auto flex max-w-5xl flex-col gap-8 transition-[width] duration-150"
        style={{ width: `${zoom}%` }}
      >
        {cards.filter((card) => card.id === selectedCardId).map((card) => {
          const index = cards.findIndex((item) => item.id === card.id)
          return (
          <div key={card.id} data-card-id={card.id} className="group/slide space-y-2">
            <div
              className="flex items-center justify-between px-1 text-[11px]"
              style={{ color: theme.colors.muted }}
            >
              <span className="font-medium uppercase tracking-[0.12em]">Slide {index + 1}</span>
              {card.notes ? (
                <span className="max-w-[50%] truncate">Notes: {card.notes}</span>
              ) : null}
            </div>
            <CardView
              card={card}
              theme={theme}
              aspectRatio={aspectRatio}
              selected={selectedCardId === card.id}
              editing
              selectedBlockId={selectedBlockId}
              onSelect={() => selectCard(card.id)}
              onSelectBlock={(blockId) => {
                selectCard(card.id)
                selectBlock(blockId)
              }}
              onChangeBlock={(blockId, patch) => updateBlock(card.id, blockId, patch as never)}
              onMoveBlock={(blockId, toIndex) => moveBlock(card.id, blockId, toIndex)}
              onBlockContextMenu={(event, blockId) => {
                event.preventDefault()
                event.stopPropagation()
                selectCard(card.id)
                selectBlock(blockId)
                setContextMenu({
                  x: Math.min(event.clientX, window.innerWidth - 210),
                  y: Math.min(event.clientY, window.innerHeight - 250),
                  blockId
                })
              }}
            />
            <div className="flex h-4 items-center justify-center opacity-0 transition-opacity group-hover/slide:opacity-100">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 rounded-full bg-background px-3 text-[10px] shadow-sm"
                onClick={() => addCard('content', index + 1)}
              >
                <Plus className="h-3 w-3" /> Add slide
              </Button>
            </div>
          </div>
          )
        })}
      </div>
      {contextMenu && selectedCard ? (
        <div
          role="menu"
          className="fixed z-[100] w-52 rounded-xl border border-border/70 bg-popover p-1.5 text-popover-foreground shadow-2xl"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <ContextAction icon={Edit3} label="Edit element" onClick={() => { selectBlock(contextMenu.blockId); setContextMenu(null) }} />
          <ContextAction icon={Copy} label="Copy" shortcut="Ctrl+C" onClick={() => { usePresentationEditorStore.getState().copySelection(); setContextMenu(null) }} />
          <ContextAction icon={Copy} label="Duplicate" shortcut="Ctrl+D" onClick={() => { duplicateSelectedBlock(); setContextMenu(null) }} />
          <div className="my-1 h-px bg-border/70" />
          <ContextAction icon={ArrowUp} label="Move up" disabled={selectedBlockIndex <= 0} onClick={() => { moveBlock(selectedCard.id, contextMenu.blockId, selectedBlockIndex - 1); setContextMenu(null) }} />
          <ContextAction icon={ArrowDown} label="Move down" disabled={selectedBlockIndex >= selectedCard.blocks.length - 1} onClick={() => { moveBlock(selectedCard.id, contextMenu.blockId, selectedBlockIndex + 1); setContextMenu(null) }} />
          <div className="my-1 h-px bg-border/70" />
          <ContextAction icon={Trash2} label="Delete" shortcut="Del" destructive onClick={() => { deleteSelectedBlock(); setContextMenu(null) }} />
        </div>
      ) : null}
    </div>
  )
}

function ContextAction({
  icon: Icon,
  label,
  shortcut,
  onClick,
  disabled = false,
  destructive = false
}: {
  icon: typeof Copy
  label: string
  shortcut?: string
  onClick: () => void
  disabled?: boolean
  destructive?: boolean
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex h-8 w-full items-center gap-2 rounded-lg px-2 text-left text-xs hover:bg-accent disabled:pointer-events-none disabled:opacity-35',
        destructive && 'text-destructive hover:bg-destructive/10'
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      <span>{label}</span>
      {shortcut ? <span className="ml-auto text-[10px] text-muted-foreground">{shortcut}</span> : null}
    </button>
  )
}
