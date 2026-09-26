import {
  applyAllConflictResolutions,
  applyConflictResolution,
  parseConflictMarkers,
  type ConflictResolution
} from '@shared/lib/merge-conflicts'
import { Button } from '@/shared/components/ui/button'
import { useCodeEditorStore } from '../stores/codeEditor.store'

export function ConflictBanner({ path, content }: { path: string; content: string }) {
  const hunks = parseConflictMarkers(content)
  if (hunks.length === 0) return null
  const current = hunks[0]!
  const update = (next: string) => useCodeEditorStore.getState().updateTabContent(path, next)

  const apply = (mode: ConflictResolution, all = false) => {
    update(all ? applyAllConflictResolutions(content, mode) : applyConflictResolution(content, current, mode))
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[11px]">
      <span className="font-medium text-amber-200">
        {hunks.length} merge conflict{hunks.length === 1 ? '' : 's'}
      </span>
      <span className="text-muted-foreground">
        {current.currentLabel} ↔ {current.incomingLabel}
      </span>
      <Button size="sm" variant="outline" className="h-6 px-1.5 text-[10px]" onClick={() => apply('current')}>
        Accept current
      </Button>
      <Button size="sm" variant="outline" className="h-6 px-1.5 text-[10px]" onClick={() => apply('incoming')}>
        Accept incoming
      </Button>
      <Button size="sm" variant="outline" className="h-6 px-1.5 text-[10px]" onClick={() => apply('both')}>
        Accept both
      </Button>
      <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[10px]" onClick={() => apply('current', true)}>
        All current
      </Button>
      <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[10px]" onClick={() => apply('incoming', true)}>
        All incoming
      </Button>
    </div>
  )
}
