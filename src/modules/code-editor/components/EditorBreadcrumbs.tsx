import { useEffect } from 'react'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { useCodeEditorStore } from '../stores/codeEditor.store'
import { useEditorSettingsStore } from '../stores/editorSettings.store'
import { useOutlineStore } from '../stores/outline.store'
import { useWorkbenchLayoutStore } from '../stores/workbench.store'
import { fileIconFor } from '../lib/file-icons'
import { relativeTo } from '../lib/paths'

export function EditorBreadcrumbs() {
  const enabled = useEditorSettingsStore((s) => s.stickyBreadcrumbs)
  const rootPath = useCodeEditorStore((s) => s.rootPath)
  const activeTabPath = useCodeEditorStore((s) => s.activeTabPath)
  const cursor = useCodeEditorStore((s) => s.cursor)
  const revealPathInTree = useCodeEditorStore((s) => s.revealPathInTree)
  const goToLine = useCodeEditorStore((s) => s.goToLine)
  const loadOutline = useOutlineStore((s) => s.load)
  const symbolAtLine = useOutlineStore((s) => s.symbolAtLine)
  const symbols = useOutlineStore((s) => s.symbols)
  const setLeftTab = useWorkbenchLayoutStore((s) => s.setLeftTab)

  useEffect(() => {
    if (activeTabPath) void loadOutline(activeTabPath)
  }, [activeTabPath, loadOutline])

  if (!enabled || !activeTabPath) return null

  const relative = relativeTo(rootPath, activeTabPath)
  const segments = relative.split('/').filter(Boolean)
  const currentSymbol = cursor ? symbolAtLine(cursor.line) : null
  const fileSpec = fileIconFor(activeTabPath)
  const FileIcon = fileSpec.icon

  const pathToSegment = (index: number) => {
    if (!rootPath) return activeTabPath
    return [rootPath, ...segments.slice(0, index + 1)].join('/')
  }

  return (
    <div className="flex h-[22px] shrink-0 items-center gap-0.5 overflow-x-auto border-b border-[var(--wb-border)] bg-[var(--wb-editor)] px-2 text-[11px] text-[var(--wb-muted)]">
      <FileIcon className={cn('h-3 w-3 shrink-0', fileSpec.className)} />
      {segments.map((segment, index) => {
        const isLast = index === segments.length - 1
        return (
          <span key={`${segment}-${index}`} className="flex min-w-0 items-center gap-0.5">
            {index > 0 ? <ChevronRight className="h-3 w-3 shrink-0 opacity-50" /> : null}
            <button
              type="button"
              className={cn('max-w-[180px] truncate hover:text-[var(--wb-fg)]', isLast && 'text-[var(--wb-fg)]')}
              onClick={() => {
                setLeftTab('files')
                void revealPathInTree(isLast ? activeTabPath : pathToSegment(index))
              }}
              title={pathToSegment(index)}
            >
              {segment}
            </button>
          </span>
        )
      })}
      {currentSymbol ? (
        <span className="flex min-w-0 items-center gap-0.5">
          <ChevronRight className="h-3 w-3 shrink-0 opacity-50" />
          <button
            type="button"
            className="max-w-[200px] truncate text-[var(--wb-fg)] hover:underline"
            onClick={() => goToLine(currentSymbol.startLine, 1)}
            title={`${currentSymbol.kind} · ${symbols.length} symbols`}
          >
            {currentSymbol.container ? `${currentSymbol.container}.` : ''}
            {currentSymbol.name}
          </button>
        </span>
      ) : null}
    </div>
  )
}
