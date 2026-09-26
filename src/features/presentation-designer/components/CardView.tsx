import type { CSSProperties } from 'react'
import type { PresentationCard, PresentationTheme } from '@shared/types/presentation'
import type { PresentationAspectRatio } from '@shared/types/presentation'
import { BlockRenderer } from './BlockRenderer'
import { cn } from '@/shared/lib/utils'

interface CardViewProps {
  card: PresentationCard
  theme: PresentationTheme
  selected?: boolean
  editing?: boolean
  selectedBlockId?: string | null
  onSelect?: () => void
  onSelectBlock?: (blockId: string) => void
  onChangeBlock?: (blockId: string, patch: Record<string, unknown>) => void
  onMoveBlock?: (blockId: string, toIndex: number) => void
  onBlockContextMenu?: (event: React.MouseEvent, blockId: string) => void
  compact?: boolean
  /** Fill the stage like a Canva slide (used in present mode). */
  stage?: boolean
  aspectRatio?: PresentationAspectRatio
}

export function CardView({
  card,
  theme,
  selected = false,
  editing = false,
  selectedBlockId,
  onSelect,
  onSelectBlock,
  onChangeBlock,
  onMoveBlock,
  onBlockContextMenu,
  compact = false,
  stage = false,
  aspectRatio = '16:9'
}: CardViewProps) {
  const isTitle = card.layout === 'title'
  const mediaSplit = card.layout === 'media-left' || card.layout === 'media-right'
  const imageBlocks = card.blocks.filter((block) => block.type === 'image')
  const otherBlocks = card.blocks.filter((block) => block.type !== 'image')

  const style: CSSProperties = {
    background: isTitle ? theme.colors.accent : theme.colors.surface,
    color: isTitle ? theme.colors.accentText : theme.colors.text,
    borderColor: theme.colors.border,
    fontFamily: theme.fonts.body,
    padding:
      theme.density === 'compact' ? '1.25rem' : theme.density === 'spacious' ? '2rem' : '1.5rem'
  }

  const renderBlock = (block: (typeof card.blocks)[number]) => {
    const index = card.blocks.findIndex((item) => item.id === block.id)
    return (
      <div
        key={block.id}
        onContextMenu={(event) => onBlockContextMenu?.(event, block.id)}
        draggable={editing && selected}
        onDragStart={(event) =>
          event.dataTransfer.setData('application/x-presentation-block', block.id)
        }
        onDragOver={(event) => editing && event.preventDefault()}
        onDrop={(event) => {
          if (!editing) return
          event.preventDefault()
          const draggedId = event.dataTransfer.getData('application/x-presentation-block')
          if (draggedId && draggedId !== block.id) onMoveBlock?.(draggedId, index)
        }}
      >
        <BlockRenderer
          block={block}
          editing={editing && selected}
          selected={selectedBlockId === block.id}
          onSelect={() => onSelectBlock?.(block.id)}
          onChange={(patch) => onChangeBlock?.(block.id, patch)}
        />
      </div>
    )
  }

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onSelect?.()
      }}
      style={style}
      className={cn(
        'w-full border text-left shadow-sm transition-shadow',
        aspectRatio === '4:3'
          ? 'aspect-[4/3]'
          : aspectRatio === '16:10'
            ? 'aspect-[16/10]'
            : 'aspect-video',
        stage ? 'rounded-xl' : 'rounded-2xl',
        selected && 'shadow-md ring-2 ring-[#0d99ff]',
        !stage && (compact ? 'min-h-[180px]' : 'min-h-[280px]'),
        stage && 'flex min-h-0 flex-col justify-center'
      )}
    >
      <div
        className={cn(
          'mx-auto w-full',
          compact ? 'max-w-xl' : 'max-w-4xl',
          mediaSplit ? 'grid gap-4 md:grid-cols-2 md:items-center' : 'flex flex-col gap-3'
        )}
        style={{ fontFamily: theme.fonts.heading }}
      >
        {mediaSplit ? (
          <>
            <div
              className={cn(
                'space-y-3',
                card.layout === 'media-right' ? 'md:order-1' : 'md:order-2'
              )}
            >
              {otherBlocks.map(renderBlock)}
            </div>
            <div className={cn(card.layout === 'media-right' ? 'md:order-2' : 'md:order-1')}>
              {imageBlocks.length > 0 ? (
                imageBlocks.map(renderBlock)
              ) : otherBlocks.length === 0 ? null : (
                <div className="border-current/20 flex h-40 items-center justify-center rounded-lg border border-dashed text-sm opacity-60">
                  Add an image block
                </div>
              )}
            </div>
          </>
        ) : (
          card.blocks.map(renderBlock)
        )}
      </div>
    </article>
  )
}
