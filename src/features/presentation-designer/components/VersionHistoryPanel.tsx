import { useMemo } from 'react'
import { History, RotateCcw, Save } from 'lucide-react'
import { toast } from 'sonner'
import type { PresentationVersion } from '@shared/types/presentation'
import { parsePresentationVersions } from '@shared/lib/presentation-model'
import { usePresentationStore } from '../stores/presentation.store'
import { usePresentationEditorStore } from '../stores/presentation-editor.store'
import { Button } from '@/shared/components/ui/button'

export function VersionHistoryPanel({ onClose }: { onClose: () => void }) {
  const presentation = usePresentationStore((state) => state.currentPresentation)
  const updatePresentation = usePresentationStore((state) => state.updatePresentation)
  const editor = usePresentationEditorStore()
  const versions = useMemo(
    () => parsePresentationVersions(presentation?.versions),
    [presentation?.versions]
  )

  const checkpoint = async () => {
    if (!presentation) return
    const version: PresentationVersion = {
      id: crypto.randomUUID(),
      label: `Checkpoint ${versions.length + 1}`,
      createdAt: new Date().toISOString(),
      summary: `${editor.cards.length} cards`,
      cards: structuredClone(editor.cards),
      themeId: editor.themeId as PresentationVersion['themeId']
    }
    const saved = await updatePresentation(presentation.id, {
      versions: JSON.stringify([version, ...versions].slice(0, 30))
    })
    if (saved) toast.success('Presentation checkpoint created')
  }

  const restore = async (version: PresentationVersion) => {
    if (!presentation) return
    editor.replaceCards(structuredClone(version.cards))
    editor.setThemeId(version.themeId)
    toast.success(`Restored ${version.label}; autosave will persist it`)
    onClose()
  }

  return (
    <aside className="flex h-full w-[300px] shrink-0 flex-col border-l border-border bg-background">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="flex items-center gap-2 text-xs font-semibold">
          <History className="h-3.5 w-3.5" />
          Version history
        </span>
        <Button size="sm" variant="ghost" className="h-7" onClick={onClose}>
          Close
        </Button>
      </div>
      <div className="border-b p-3">
        <Button size="sm" className="w-full" onClick={() => void checkpoint()}>
          <Save className="h-3.5 w-3.5" />
          Create checkpoint
        </Button>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {versions.length === 0 ? (
          <p className="text-xs text-muted-foreground">No checkpoints yet.</p>
        ) : (
          versions.map((version) => (
            <div key={version.id} className="rounded-md border p-2">
              <p className="text-xs font-medium">{version.label}</p>
              <p className="text-[10px] text-muted-foreground">
                {new Date(version.createdAt).toLocaleString()} · {version.summary}
              </p>
              <Button
                size="sm"
                variant="outline"
                className="mt-2 h-6 text-[10px]"
                onClick={() => void restore(version)}
              >
                <RotateCcw className="h-3 w-3" />
                Restore
              </Button>
            </div>
          ))
        )}
      </div>
    </aside>
  )
}
