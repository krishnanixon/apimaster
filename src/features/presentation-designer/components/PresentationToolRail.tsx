import {
  BarChart3,
  Columns3,
  Heading2,
  ImagePlus,
  LayoutTemplate,
  List,
  MessageSquareText,
  Minus,
  Plus,
  Type
} from 'lucide-react'
import { newBlockId } from '@shared/lib/presentation-model'
import type { PresentationBlock } from '@shared/types/presentation'
import { Button } from '@/shared/components/ui/button'
import { usePresentationEditorStore } from '../stores/presentation-editor.store'
import { pickImageAsDataUrl } from '../lib/import-image'
import { toast } from 'sonner'

const tools: Array<{
  type: PresentationBlock['type']
  label: string
  icon: typeof Type
}> = [
  { type: 'heading', label: 'Heading', icon: Heading2 },
  { type: 'text', label: 'Text', icon: Type },
  { type: 'bullets', label: 'List', icon: List },
  { type: 'columns', label: 'Columns', icon: Columns3 },
  { type: 'metric', label: 'Metrics', icon: BarChart3 },
  { type: 'callout', label: 'Callout', icon: MessageSquareText },
  { type: 'divider', label: 'Divider', icon: Minus }
]

function createBlock(type: PresentationBlock['type']): PresentationBlock {
  switch (type) {
    case 'heading':
      return { id: newBlockId(), type, text: 'New heading', level: 2 }
    case 'text':
      return { id: newBlockId(), type, text: 'Add your text' }
    case 'bullets':
      return { id: newBlockId(), type, items: ['First point', 'Second point'] }
    case 'columns':
      return {
        id: newBlockId(),
        type,
        columns: [
          { title: 'Left', body: 'Add content' },
          { title: 'Right', body: 'Add content' }
        ]
      }
    case 'metric':
      return { id: newBlockId(), type, metrics: [{ label: 'Metric', value: '0' }] }
    case 'callout':
      return { id: newBlockId(), type, text: 'Add a callout', tone: 'info' }
    case 'divider':
      return { id: newBlockId(), type }
    case 'image':
      return { id: newBlockId(), type, alt: 'Image' }
  }
}

export function PresentationToolRail() {
  const cards = usePresentationEditorStore((state) => state.cards)
  const selectedCardId = usePresentationEditorStore((state) => state.selectedCardId)
  const updateCard = usePresentationEditorStore((state) => state.updateCard)
  const addCard = usePresentationEditorStore((state) => state.addCard)
  const selected = cards.find((card) => card.id === selectedCardId) ?? cards[0]

  const insert = (block: PresentationBlock) => {
    if (!selected) return
    updateCard(selected.id, { blocks: [...selected.blocks, block] })
  }

  return (
    <aside className="flex w-[72px] shrink-0 flex-col items-center gap-1 border-r border-border/60 bg-background px-1.5 py-2">
      <ToolButton label="New slide" icon={Plus} onClick={() => addCard('content')} featured />
      <ToolButton label="Layouts" icon={LayoutTemplate} onClick={() => addCard('content')} />
      <div className="my-1 h-px w-10 bg-border/70" />
      {tools.map((tool) => (
        <ToolButton
          key={tool.type}
          label={tool.label}
          icon={tool.icon}
          onClick={() => insert(createBlock(tool.type))}
        />
      ))}
      <ToolButton
        label="Image"
        icon={ImagePlus}
        onClick={() => {
          void (async () => {
            const picked = await pickImageAsDataUrl()
            if (!picked) return
            insert({ id: newBlockId(), type: 'image', src: picked.src, alt: picked.name })
            toast.success('Image added')
          })()
        }}
      />
    </aside>
  )
}

function ToolButton({
  label,
  icon: Icon,
  onClick,
  featured = false
}: {
  label: string
  icon: typeof Type
  onClick: () => void
  featured?: boolean
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      className={
        featured
          ? 'h-12 w-full flex-col gap-0.5 rounded-xl bg-violet-600 p-1 text-[9px] text-white hover:bg-violet-700 hover:text-white'
          : 'h-12 w-full flex-col gap-0.5 rounded-xl p-1 text-[9px] text-muted-foreground hover:bg-violet-500/10 hover:text-violet-600'
      }
      onClick={onClick}
      title={`Add ${label.toLowerCase()}`}
    >
      <Icon className="h-4 w-4" />
      <span>{label}</span>
    </Button>
  )
}
