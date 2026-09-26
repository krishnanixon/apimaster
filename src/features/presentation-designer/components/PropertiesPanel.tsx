import { useState } from 'react'
import { CARD_LAYOUTS, newBlockId } from '@shared/lib/presentation-model'
import type { Document } from '@shared/types'
import type {
  PresentationAspectRatio,
  PresentationBlock,
  PresentationLayoutId
} from '@shared/types/presentation'
import { usePresentationEditorStore } from '../stores/presentation-editor.store'
import { ThemePicker } from './ThemePicker'
import { DocumentReferencesPanel } from './DocumentReferencesPanel'
import { pickImageAsDataUrl } from '../lib/import-image'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Textarea } from '@/shared/components/ui/textarea'
import { toast } from 'sonner'
import { Switch } from '@/shared/components/ui/switch'
import { ArrowDown, ArrowUp, Copy, Layers3, Palette, Plus, Settings2, Trash2 } from 'lucide-react'

interface PropertiesPanelProps {
  projectId: string
  documents: Document[]
  onOpenGenerate: () => void
}

export function PropertiesPanel({ projectId, documents, onOpenGenerate }: PropertiesPanelProps) {
  const [activeTab, setActiveTab] = useState<'design' | 'slide' | 'sources'>('design')
  const [newSlideLayout, setNewSlideLayout] = useState<PresentationLayoutId>('content')
  const cards = usePresentationEditorStore((s) => s.cards)
  const selectedCardId = usePresentationEditorStore((s) => s.selectedCardId)
  const selectedBlockId = usePresentationEditorStore((s) => s.selectedBlockId)
  const title = usePresentationEditorStore((s) => s.title)
  const description = usePresentationEditorStore((s) => s.description)
  const setTitle = usePresentationEditorStore((s) => s.setTitle)
  const setDescription = usePresentationEditorStore((s) => s.setDescription)
  const updateCard = usePresentationEditorStore((s) => s.updateCard)
  const updateBlock = usePresentationEditorStore((s) => s.updateBlock)
  const moveBlock = usePresentationEditorStore((s) => s.moveBlock)
  const selectBlock = usePresentationEditorStore((s) => s.selectBlock)
  const selectCard = usePresentationEditorStore((s) => s.selectCard)
  const replaceCards = usePresentationEditorStore((s) => s.replaceCards)
  const addCard = usePresentationEditorStore((s) => s.addCard)
  const deleteCard = usePresentationEditorStore((s) => s.deleteCard)
  const moveCard = usePresentationEditorStore((s) => s.moveCard)
  const aspectRatio = usePresentationEditorStore((s) => s.aspectRatio)
  const includeBranding = usePresentationEditorStore((s) => s.includeBranding)
  const setAspectRatio = usePresentationEditorStore((s) => s.setAspectRatio)
  const setIncludeBranding = usePresentationEditorStore((s) => s.setIncludeBranding)

  const selected = cards.find((card) => card.id === selectedCardId) ?? null
  const selectedIndex = selected ? cards.findIndex((card) => card.id === selected.id) : -1
  const selectedBlock = selected?.blocks.find((block) => block.id === selectedBlockId) ?? null
  const selectedBlockIndex = selectedBlock
    ? selected?.blocks.findIndex((block) => block.id === selectedBlock.id) ?? -1
    : -1

  const duplicateSlide = () => {
    if (!selected) return
    const copy = {
      ...structuredClone(selected),
      id: crypto.randomUUID(),
      blocks: selected.blocks.map((block) => ({ ...structuredClone(block), id: crypto.randomUUID() }))
    }
    const next = [...cards]
    next.splice(selectedIndex + 1, 0, copy)
    replaceCards(next)
    selectCard(copy.id)
  }

  const duplicateBlock = () => {
    if (!selected || !selectedBlock || selectedBlockIndex < 0) return
    const copy = { ...structuredClone(selectedBlock), id: crypto.randomUUID() }
    const blocks = [...selected.blocks]
    blocks.splice(selectedBlockIndex + 1, 0, copy)
    updateCard(selected.id, { blocks })
    selectBlock(copy.id)
  }

  const deleteBlock = () => {
    if (!selected || !selectedBlock) return
    updateCard(selected.id, {
      blocks: selected.blocks.filter((block) => block.id !== selectedBlock.id)
    })
    selectBlock(null)
  }

  const addBlock = (type: PresentationBlock['type']) => {
    if (!selected) return
    let block: PresentationBlock
    switch (type) {
      case 'heading':
        block = { id: newBlockId(), type: 'heading', text: 'New heading', level: 2 }
        break
      case 'text':
        block = { id: newBlockId(), type: 'text', text: '' }
        break
      case 'bullets':
        block = { id: newBlockId(), type: 'bullets', items: ['Item'] }
        break
      case 'columns':
        block = {
          id: newBlockId(),
          type: 'columns',
          columns: [
            { title: 'Left', body: '' },
            { title: 'Right', body: '' }
          ]
        }
        break
      case 'callout':
        block = { id: newBlockId(), type: 'callout', text: 'Callout', tone: 'info' }
        break
      case 'divider':
        block = { id: newBlockId(), type: 'divider' }
        break
      case 'metric':
        block = {
          id: newBlockId(),
          type: 'metric',
          metrics: [{ label: 'Metric', value: '0' }]
        }
        break
      case 'image':
        block = { id: newBlockId(), type: 'image', alt: 'Image' }
        break
      default:
        return
    }
    updateCard(selected.id, { blocks: [...selected.blocks, block] })
  }

  return (
    <aside className="flex h-full w-[296px] shrink-0 flex-col border-l border-border/60 bg-background">
      <div className="border-b border-border/60 px-2.5 pb-2 pt-2.5">
        <div className="mb-2 flex items-center justify-between px-1">
        <div>
          <div className="text-xs font-semibold">Design inspector</div>
          <div className="text-[10px] text-muted-foreground">
            {selected ? `Slide ${selectedIndex + 1} selected` : 'Presentation settings'}
          </div>
        </div>
        </div>
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-muted p-1">
          {([
            { id: 'design', label: 'Design', icon: Palette },
            { id: 'slide', label: 'Slide', icon: Layers3 },
            { id: 'sources', label: 'Sources', icon: Settings2 }
          ] as const).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={
                activeTab === tab.id
                  ? 'flex h-8 items-center justify-center gap-1 rounded-lg bg-background text-[10px] font-semibold text-foreground shadow-sm'
                  : 'flex h-8 items-center justify-center gap-1 rounded-lg text-[10px] text-muted-foreground hover:text-foreground'
              }
            >
              <tab.icon className="h-3 w-3" /> {tab.label}
            </button>
          ))}
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto bg-muted/15 p-2.5">
        {activeTab === 'design' ? (
          <>
        <div className="space-y-1.5 rounded-xl border border-border/60 bg-background p-2.5 shadow-sm">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Presentation
          </p>
          <label className="text-[11px] font-medium text-muted-foreground">Deck title</label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="h-8 text-[12px]"
          />
          <label className="text-[11px] font-medium text-muted-foreground">Description</label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="min-h-[48px] text-[11px]"
          />
        </div>

        <ThemePicker />

        <div className="space-y-2 rounded-xl border border-border/60 bg-background p-2.5 shadow-sm">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Export & stage
          </p>
          <label className="block text-[11px] font-medium text-muted-foreground">
            Aspect ratio
          </label>
          <select
            value={aspectRatio}
            onChange={(event) => setAspectRatio(event.target.value as PresentationAspectRatio)}
            className="flex h-8 w-full rounded-md border border-input bg-background px-2 text-[12px]"
          >
            <option value="16:9">Widescreen 16:9</option>
            <option value="4:3">Standard 4:3</option>
            <option value="16:10">Display 16:10</option>
          </select>
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] text-muted-foreground">Project logo and company</span>
            <Switch checked={includeBranding} onCheckedChange={setIncludeBranding} />
          </div>
        </div>

          </>
        ) : null}

        {activeTab === 'sources' ? (
        <DocumentReferencesPanel
          projectId={projectId}
          documents={documents}
          onOpenGenerate={onOpenGenerate}
        />
        ) : null}

        {activeTab === 'slide' ? (
          <>
        <div className="rounded-xl border border-border/60 bg-background p-2.5 shadow-sm">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">New slide</p>
          <div className="flex gap-1.5">
            <select value={newSlideLayout} onChange={(event) => setNewSlideLayout(event.target.value as PresentationLayoutId)} className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-[11px]">
              {CARD_LAYOUTS.map((layout) => <option key={layout.id} value={layout.id}>{layout.label}</option>)}
            </select>
            <Button type="button" size="sm" className="h-8 px-2.5" onClick={() => addCard(newSlideLayout)}><Plus className="h-3.5 w-3.5" /> Add</Button>
          </div>
        </div>

        {selected && (
          <div className="space-y-2.5 rounded-xl border border-primary/25 bg-background p-2.5 shadow-sm ring-1 ring-primary/5">
            <div>
              <p className="text-[12px] font-semibold">Current slide</p>
              <p className="text-[10px] text-muted-foreground">
                Adjust layout, notes, and content blocks.
              </p>
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-medium text-muted-foreground">Layout</label>
              <select
                value={selected.layout}
                onChange={(e) =>
                  updateCard(selected.id, { layout: e.target.value as PresentationLayoutId })
                }
                className="flex h-8 w-full rounded-md border border-input bg-background px-2 text-[12px]"
              >
                {CARD_LAYOUTS.map((layout) => (
                  <option key={layout.id} value={layout.id}>
                    {layout.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-medium text-muted-foreground">Speaker notes</label>
              <Textarea
                value={selected.notes ?? ''}
                onChange={(e) => updateCard(selected.id, { notes: e.target.value })}
                className="min-h-[72px] text-[12px]"
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 text-[11px]"
                disabled={selectedIndex <= 0}
                onClick={() => moveCard(selected.id, selectedIndex - 1)}
              >
                Move up
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 text-[11px]"
                disabled={selectedIndex < 0 || selectedIndex >= cards.length - 1}
                onClick={() => moveCard(selected.id, selectedIndex + 1)}
              >
                Move down
              </Button>
              <Button type="button" size="sm" variant="outline" className="h-7 text-[11px]" onClick={duplicateSlide}>
                <Copy className="h-3 w-3" /> Duplicate
              </Button>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                className="h-7 text-[11px]"
                disabled={cards.length <= 1}
                onClick={() => deleteCard(selected.id)}
              >
                Delete
              </Button>
            </div>
            {selectedBlock ? (
              <div className="space-y-2 rounded-lg border border-violet-500/20 bg-violet-500/5 p-2.5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[11px] font-semibold capitalize">{selectedBlock.type} element</p>
                    <p className="text-[9px] text-muted-foreground">Element {selectedBlockIndex + 1} of {selected.blocks.length}</p>
                  </div>
                  <div className="flex gap-0.5">
                    <Button type="button" size="sm" variant="ghost" className="h-7 w-7 p-0" disabled={selectedBlockIndex <= 0} title="Move up" onClick={() => moveBlock(selected.id, selectedBlock.id, selectedBlockIndex - 1)}><ArrowUp className="h-3.5 w-3.5" /></Button>
                    <Button type="button" size="sm" variant="ghost" className="h-7 w-7 p-0" disabled={selectedBlockIndex >= selected.blocks.length - 1} title="Move down" onClick={() => moveBlock(selected.id, selectedBlock.id, selectedBlockIndex + 1)}><ArrowDown className="h-3.5 w-3.5" /></Button>
                    <Button type="button" size="sm" variant="ghost" className="h-7 w-7 p-0" title="Duplicate" onClick={duplicateBlock}><Copy className="h-3.5 w-3.5" /></Button>
                    <Button type="button" size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive" title="Delete" onClick={deleteBlock}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </div>
                {selectedBlock.type === 'heading' ? (
                  <label className="block text-[10px] text-muted-foreground">Heading size
                    <select value={selectedBlock.level ?? 2} onChange={(event) => updateBlock(selected.id, selectedBlock.id, { level: Number(event.target.value) as 1 | 2 | 3 })} className="mt-1 h-7 w-full rounded-md border border-input bg-background px-2 text-[11px]">
                      <option value={1}>Large</option><option value={2}>Medium</option><option value={3}>Small</option>
                    </select>
                  </label>
                ) : null}
                {selectedBlock.type === 'callout' ? (
                  <label className="block text-[10px] text-muted-foreground">Tone
                    <select value={selectedBlock.tone ?? 'info'} onChange={(event) => updateBlock(selected.id, selectedBlock.id, { tone: event.target.value as 'info' | 'success' | 'warning' | 'neutral' })} className="mt-1 h-7 w-full rounded-md border border-input bg-background px-2 text-[11px]">
                      <option value="info">Info</option><option value="success">Success</option><option value="warning">Warning</option><option value="neutral">Neutral</option>
                    </select>
                  </label>
                ) : null}
                {selectedBlock.type === 'image' ? (
                  <div className="space-y-1.5">
                    <Input value={selectedBlock.alt ?? ''} onChange={(event) => updateBlock(selected.id, selectedBlock.id, { alt: event.target.value })} placeholder="Alt text" className="h-7 text-[11px]" />
                    <Input value={selectedBlock.caption ?? ''} onChange={(event) => updateBlock(selected.id, selectedBlock.id, { caption: event.target.value })} placeholder="Caption" className="h-7 text-[11px]" />
                  </div>
                ) : null}
              </div>
            ) : null}
            <div className="space-y-1.5">
              <p className="text-[11px] text-muted-foreground">Add block</p>
              <div className="flex flex-wrap gap-1">
                {(
                  [
                    'heading',
                    'text',
                    'bullets',
                    'columns',
                    'metric',
                    'callout',
                    'image',
                    'divider'
                  ] as const
                ).map((type) => (
                  <Button
                    key={type}
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="h-6 text-[10px] capitalize"
                    onClick={() => addBlock(type)}
                  >
                    {type}
                  </Button>
                ))}
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="mt-1 h-7 w-full text-[11px]"
                onClick={() => {
                  void (async () => {
                    const picked = await pickImageAsDataUrl()
                    if (!picked || !selected) return
                    const existingImage = selected.blocks.find((block) => block.type === 'image')
                    if (existingImage && existingImage.type === 'image') {
                      updateCard(selected.id, {
                        blocks: selected.blocks.map((block) =>
                          block.id === existingImage.id
                            ? { ...existingImage, src: picked.src, alt: picked.name }
                            : block
                        )
                      })
                    } else {
                      updateCard(selected.id, {
                        blocks: [
                          ...selected.blocks,
                          {
                            id: newBlockId(),
                            type: 'image',
                            src: picked.src,
                            alt: picked.name
                          }
                        ]
                      })
                    }
                    toast.success('Image imported')
                  })()
                }}
              >
                Import image to this page
              </Button>
            </div>
          </div>
        )}
          {!selected ? (
            <div className="rounded-xl border border-dashed border-border bg-background p-6 text-center">
              <Layers3 className="mx-auto mb-2 h-5 w-5 text-muted-foreground" />
              <p className="text-xs font-medium">Select a slide</p>
              <p className="mt-1 text-[10px] text-muted-foreground">
                Slide layout, notes, ordering, and content tools will appear here.
              </p>
            </div>
          ) : null}
          </>
        ) : null}
      </div>
    </aside>
  )
}
