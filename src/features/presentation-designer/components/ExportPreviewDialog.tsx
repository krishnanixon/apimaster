import { getPresentationTheme } from '@shared/lib/presentation-model'
import { usePresentationEditorStore } from '../stores/presentation-editor.store'
import { CardView } from './CardView'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog'

export function ExportPreviewDialog({
  open,
  onOpenChange
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const cards = usePresentationEditorStore((state) => state.cards)
  const themeId = usePresentationEditorStore((state) => state.themeId)
  const themeOverrides = usePresentationEditorStore((state) => state.themeOverrides)
  const aspectRatio = usePresentationEditorStore((state) => state.aspectRatio)
  const theme = getPresentationTheme(themeId, themeOverrides)
  const ratioClass =
    aspectRatio === '4:3'
      ? 'aspect-[4/3]'
      : aspectRatio === '16:10'
        ? 'aspect-[16/10]'
        : 'aspect-video'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-5xl overflow-hidden">
        <DialogHeader>
          <DialogTitle>Export preview · {aspectRatio}</DialogTitle>
        </DialogHeader>
        <div className="min-h-0 space-y-4 overflow-y-auto bg-muted/40 p-4">
          {cards.map((card, index) => (
            <div key={card.id} className="mx-auto max-w-4xl">
              <div className={`overflow-hidden rounded-md shadow-lg ${ratioClass}`}>
                <CardView card={card} theme={theme} stage aspectRatio={aspectRatio} />
              </div>
              <p className="mt-1 text-center text-[10px] text-muted-foreground">
                {index + 1} / {cards.length}
              </p>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
