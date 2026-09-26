import { AlertCircle, Bot, GitBranch, SquareTerminal } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { useAIStore } from '@/features/ai/stores/ai.store'
import { useCodeEditorStore } from '../stores/codeEditor.store'
import { useCodeIndexStore } from '../stores/codeIndex.store'
import { useGitStore } from '../stores/git.store'
import { useProblemsStore } from '../stores/problems.store'
import { useAgentStore } from '../stores/agent.store'
import { useWorkbenchLayoutStore } from '../stores/workbench.store'
import { useEditorSettingsStore } from '../stores/editorSettings.store'
import { languageLabelFor } from '../lib/file-icons'
import { toggleWorkbenchTerminal } from '../lib/terminal-workbench'
import { useTerminalStore } from '@/modules/terminal/stores/terminal.store'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/shared/components/ui/dropdown-menu'

export function EditorStatusBar() {
  const activeTabPath = useCodeEditorStore((s) => s.activeTabPath)
  const cursor = useCodeEditorStore((s) => s.cursor)
  const selectionLineCount = useCodeEditorStore((s) => s.selectionLineCount)
  const selectedCode = useCodeEditorStore((s) => s.selectedCode)
  const formatting = useCodeEditorStore((s) => s.formatting)
  const branch = useGitStore((s) => s.snapshot?.branch)
  const ahead = useGitStore((s) => s.snapshot?.ahead ?? 0)
  const behind = useGitStore((s) => s.snapshot?.behind ?? 0)
  const problems = useProblemsStore((s) => s.items.length)
  const indexStatus = useCodeIndexStore((s) => s.status)
  const agentStatus = useAgentStore(
    (s) =>
      s.chats.find((chat) => chat.id === s.activeChatId)?.run?.status ??
      s.chats.find((chat) =>
        chat.run ? ['planning', 'running', 'waiting', 'paused'].includes(chat.run.status) : false
      )?.run?.status
  )
  const model = useAIStore((s) => s.activeModel)
  const openProblems = useWorkbenchLayoutStore((s) => s.openProblems)
  const openAgent = useWorkbenchLayoutStore((s) => s.openAgent)
  const openQuickOpen = useWorkbenchLayoutStore((s) => s.openQuickOpen)
  const setSettingsOpen = useWorkbenchLayoutStore((s) => s.setSettingsOpen)
  const tabSize = useEditorSettingsStore((s) => s.tabSize)
  const insertSpaces = useEditorSettingsStore((s) => s.insertSpaces)
  const wordWrap = useEditorSettingsStore((s) => s.wordWrap)
  const setSetting = useEditorSettingsStore((s) => s.set)
  const pendingPatches = useAgentStore(
    (s) => s.patches.filter((patch) => patch.status === 'pending').length
  )
  const terminalCount = useTerminalStore((s) => s.tabs.length)

  const selectionLabel =
    selectedCode && selectionLineCount > 1
      ? `${selectionLineCount} lines`
      : selectedCode
        ? `${selectedCode.length} chars`
        : null

  return (
    <div className="wb-glass-chrome flex h-[22px] shrink-0 items-center justify-between border-t border-[var(--wb-border)] bg-[var(--wb-status)] px-0.5 text-[10.5px] text-[var(--wb-muted)]">
      <div className="flex min-w-0 items-center">
        <button type="button" className="wb-status-item" title="Toggle Terminal (Ctrl+`)" onClick={() => void toggleWorkbenchTerminal()}>
          <SquareTerminal className="h-3 w-3" /> Terminal{terminalCount > 0 ? ` ${terminalCount}` : ''}
        </button>
        {branch ? (
          <button
            type="button"
            className="wb-status-item"
            title="Source Control"
            onClick={() => useWorkbenchLayoutStore.getState().setLeftTab('git')}
          >
            <GitBranch className="h-3 w-3" />
            {branch}
            {ahead || behind ? (
              <span>
                {behind ? `↓${behind}` : ''}
                {ahead ? ` ↑${ahead}` : ''}
              </span>
            ) : null}
          </button>
        ) : null}
        <button
          type="button"
          className={cn('wb-status-item', problems > 0 && 'text-amber-500')}
          onClick={openProblems}
        >
          <AlertCircle className="h-3 w-3" />
          {problems} {problems === 1 ? 'problem' : 'problems'}
        </button>
        {agentStatus && agentStatus !== 'idle' && agentStatus !== 'done' ? (
          <button type="button" className="wb-status-item" onClick={openAgent}>
            <Bot className="h-3 w-3" />
            {agentStatus}
          </button>
        ) : null}
        {pendingPatches > 0 ? (
          <button
            type="button"
            className="wb-status-item text-amber-500"
            title="Review staged agent edits"
            onClick={() => useWorkbenchLayoutStore.getState().openChanges()}
          >
            {pendingPatches} pending
          </button>
        ) : null}
        {formatting ? <span className="wb-status-item">Formatting…</span> : null}
      </div>
      <div className="flex min-w-0 items-center">
        {indexStatus?.files ? <span className="wb-status-item">{indexStatus.files} indexed</span> : null}
        {model ? <span className="wb-status-item truncate">{model}</span> : null}
        {activeTabPath ? (
          <button
            type="button"
            className="wb-status-item truncate"
            title="Go to line (Ctrl+G)"
            onClick={() => openQuickOpen('line')}
          >
            Ln {cursor?.line ?? 1}, Col {cursor?.column ?? 1}
            {selectionLabel ? ` (${selectionLabel})` : ''}
          </button>
        ) : null}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="wb-status-item" title="Indentation">
              {insertSpaces ? 'Spaces' : 'Tabs'}: {tabSize}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setSetting('insertSpaces', true)}>Indent Using Spaces</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setSetting('insertSpaces', false)}>Indent Using Tabs</DropdownMenuItem>
            {[2, 4, 8].map((size) => (
              <DropdownMenuItem key={size} onSelect={() => setSetting('tabSize', size)}>
                Tab Size: {size}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <button
          type="button"
          className="wb-status-item"
          title="Toggle word wrap (Alt+Z)"
          onClick={() => setSetting('wordWrap', wordWrap === 'off' ? 'on' : 'off')}
        >
          {wordWrap === 'off' ? 'No Wrap' : 'Wrap'}
        </button>
        {activeTabPath ? (
          <button
            type="button"
            className="wb-status-item truncate"
            title={activeTabPath}
            onClick={() => setSettingsOpen(true)}
          >
            {languageLabelFor(activeTabPath)}
          </button>
        ) : null}
        <span className="wb-status-item">UTF-8</span>
      </div>
    </div>
  )
}
