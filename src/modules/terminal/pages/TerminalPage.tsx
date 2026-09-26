import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { FolderCode, SquareTerminal } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { useTerminalStore } from '../stores/terminal.store'
import { useCodeEditorStore } from '@/modules/code-editor/stores/codeEditor.store'
import { TerminalPanel } from '../components/TerminalPanel'
import { RecentFolderSelect } from '../components/RecentFolderSelect'

export function TerminalPage() {
  const navigate = useNavigate()
  const togglePanel = useTerminalStore((s) => s.togglePanel)
  const disposeAllTerminals = useTerminalStore((s) => s.disposeAll)
  const loadWorkspaceState = useTerminalStore((s) => s.loadWorkspaceState)
  const restoreSavedSessions = useTerminalStore((s) => s.restoreSavedSessions)
  const persistWorkspaceState = useTerminalStore((s) => s.persistWorkspaceState)
  const openFolder = useCodeEditorStore((s) => s.openFolder)

  useEffect(() => {
    togglePanel(true)
    void loadWorkspaceState().then(() => restoreSavedSessions())

    return () => {
      void persistWorkspaceState()
      disposeAllTerminals()
    }
  }, [
    togglePanel,
    disposeAllTerminals,
    loadWorkspaceState,
    restoreSavedSessions,
    persistWorkspaceState
  ])

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--wb-editor)] text-[var(--wb-fg)]">
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-[var(--wb-border)] bg-[var(--wb-tabbar)] px-3">
        <div className="flex min-w-0 items-center gap-2">
          <SquareTerminal className="h-4 w-4 shrink-0 text-[var(--wb-accent)]" />
          <span className="shrink-0 text-sm font-medium text-[var(--wb-fg)]">Terminal</span>
          <RecentFolderSelect />
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            className="text-[var(--wb-fg)] hover:bg-[var(--wb-hover)] hover:text-[var(--wb-fg)]"
            onClick={() => void openFolder().then(() => navigate('/code-editor'))}
          >
            <FolderCode className="h-3.5 w-3.5" /> Open Folder in Editor
          </Button>
        </div>
      </div>
      <div className="min-h-0 flex-1">
        <TerminalPanel fullPage />
      </div>
    </div>
  )
}
