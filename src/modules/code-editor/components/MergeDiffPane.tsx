import { useEffect, useRef } from 'react'
import { MergeView } from '@codemirror/merge'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { X } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { useSettingsStore } from '@/shared/stores/settings.store'
import { useCodeEditorStore } from '../stores/codeEditor.store'
import { cursorDark, cursorLight } from '../theme/cursorTheme'

export function MergeDiffPane() {
  const session = useCodeEditorStore((s) => s.diffSession)
  const closeDiff = useCodeEditorStore((s) => s.closeDiff)
  const updateTabContent = useCodeEditorStore((s) => s.updateTabContent)
  const getEffectiveTheme = useSettingsStore((s) => s.getEffectiveTheme)
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<MergeView | null>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host || !session) return
    const theme = getEffectiveTheme() === 'dark' ? cursorDark : cursorLight
    const view = new MergeView({
      parent: host,
      orientation: 'a-b',
      revertControls: 'a-to-b',
      highlightChanges: true,
      gutter: true,
      collapseUnchanged: { margin: 3, minSize: 6 },
      a: {
        doc: session.original,
        extensions: [theme, EditorView.editable.of(false), EditorState.readOnly.of(true)]
      },
      b: {
        doc: session.modified,
        extensions: [
          theme,
          EditorView.updateListener.of((update) => {
            if (update.docChanged) updateTabContent(session.path, update.state.doc.toString())
          })
        ]
      }
    })
    viewRef.current = view
    return () => {
      view.destroy()
      viewRef.current = null
    }
  }, [session?.path, session?.original, getEffectiveTheme, updateTabContent])

  if (!session) return null

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--wb-editor)]">
      <div className="flex h-8 shrink-0 items-center justify-between border-b border-[var(--wb-border)] px-2 text-[12px]">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate font-medium">{session.title ?? session.path}</span>
          <span className="shrink-0 text-[11px] text-[var(--wb-muted)]">Working Tree ↔ HEAD</span>
        </div>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={closeDiff} title="Close diff">
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div ref={hostRef} className="cm-merge-host min-h-0 flex-1 overflow-auto" />
    </div>
  )
}
