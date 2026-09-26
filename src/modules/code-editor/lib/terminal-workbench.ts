import { useTerminalStore } from '@/modules/terminal/stores/terminal.store'
import { useCodeEditorStore } from '../stores/codeEditor.store'
import { useWorkbenchLayoutStore } from '../stores/workbench.store'

/** Keeps the workbench panel and terminal session state in sync. */
export async function setWorkbenchTerminalOpen(open: boolean): Promise<void> {
  const layout = useWorkbenchLayoutStore.getState()
  const terminal = useTerminalStore.getState()
  if (!open) {
    if (layout.bottomTab === 'terminal') layout.setBottomTab(null)
    terminal.togglePanel(false)
    return
  }

  layout.setBottomTab('terminal')
  terminal.togglePanel(true)
  terminal.bindListeners()
  await terminal.loadWorkspaceState()
  terminal.allowAutoStart()

  if (useTerminalStore.getState().tabs.length === 0 && !useTerminalStore.getState().booting) {
    const cwd = useCodeEditorStore.getState().rootPath ?? (await terminal.resolveDefaultCwd())
    if (cwd) await terminal.openTerminal(cwd)
  }
}

export async function toggleWorkbenchTerminal(): Promise<void> {
  const layout = useWorkbenchLayoutStore.getState()
  await setWorkbenchTerminalOpen(layout.bottomTab !== 'terminal')
}

