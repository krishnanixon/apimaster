import { useEffect, useMemo, useRef } from 'react'
import {
  ChevronDown,
  Columns2,
  Eraser,
  FolderCode,
  Package,
  Play,
  Plus,
  SquareTerminal,
  Square,
  Trash2,
  X
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/shared/components/ui/dropdown-menu'
import { Button } from '@/shared/components/ui/button'
import { Spinner } from '@/shared/components/ui/spinner'
import { cn } from '@/shared/lib/utils'
import { useTerminalStore } from '../stores/terminal.store'
import { useCodeEditorStore } from '@/modules/code-editor/stores/codeEditor.store'
import { XtermView } from './XtermView'

interface TerminalPanelProps {
  onClose?: () => void
  /** Working directory when no workspace folder is selected */
  defaultCwd?: string
  fullPage?: boolean
  showEditorLink?: boolean
  onOpenEditor?: () => void
}

export function TerminalPanel({
  onClose,
  defaultCwd,
  fullPage = false,
  showEditorLink = false,
  onOpenEditor
}: TerminalPanelProps) {
  const codeEditorRoot = useCodeEditorStore((s) => s.rootPath)
  const workspaceCwd = useTerminalStore((s) => s.workspaceCwd)
  const tabs = useTerminalStore((s) => s.tabs)
  const activeTabId = useTerminalStore((s) => s.activeTabId)
  const booting = useTerminalStore((s) => s.booting)
  const restoring = useTerminalStore((s) => s.restoring)
  const autoStartAllowed = useTerminalStore((s) => s.autoStartAllowed)
  const stateLoaded = useTerminalStore((s) => s.stateLoaded)
  const openTerminal = useTerminalStore((s) => s.openTerminal)
  const splitTerminal = useTerminalStore((s) => s.splitTerminal)
  const closeTerminal = useTerminalStore((s) => s.closeTerminal)
  const closeTerminalGroup = useTerminalStore((s) => s.closeTerminalGroup)
  const setActiveTab = useTerminalStore((s) => s.setActiveTab)
  const focusNextPane = useTerminalStore((s) => s.focusNextPane)
  const runCommand = useTerminalStore((s) => s.runCommand)
  const stopCommand = useTerminalStore((s) => s.stopCommand)
  const clearActiveTerminal = useTerminalStore((s) => s.clearActiveTerminal)
  const resolveDefaultCwd = useTerminalStore((s) => s.resolveDefaultCwd)
  const bindListeners = useTerminalStore((s) => s.bindListeners)

  const cwd = codeEditorRoot ?? workspaceCwd ?? defaultCwd
  const activeTab = tabs.find((t) => t.id === activeTabId)
  const groups = useMemo(() => {
    const grouped = new Map<string, typeof tabs>()
    for (const tab of tabs) {
      const group = grouped.get(tab.groupId) ?? []
      group.push(tab)
      grouped.set(tab.groupId, group)
    }
    return [...grouped.values()]
  }, [tabs])
  const activeGroupId = activeTab?.groupId ?? groups[0]?.[0]?.groupId ?? null
  const activeGroupTabs = useMemo(
    () => tabs.filter((tab) => tab.groupId === activeGroupId),
    [tabs, activeGroupId]
  )
  const autoStartAttemptedRef = useRef(false)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bindListeners()
  }, [bindListeners])

  useEffect(() => {
    if (
      !stateLoaded ||
      !autoStartAllowed ||
      restoring ||
      booting ||
      tabs.length > 0 ||
      autoStartAttemptedRef.current
    ) return
    autoStartAttemptedRef.current = true
    const start = async () => {
      const target = cwd ?? defaultCwd ?? (await resolveDefaultCwd())
      if (target) void openTerminal(target)
      else autoStartAttemptedRef.current = false
    }
    void start()
  }, [
    tabs.length,
    cwd,
    defaultCwd,
    openTerminal,
    resolveDefaultCwd,
    stateLoaded,
    autoStartAllowed,
    restoring,
    booting
  ])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const panel = panelRef.current
      if (!panel || !(event.target instanceof Node) || !panel.contains(event.target)) return
      if (event.ctrlKey && event.shiftKey && event.key === '5') {
        event.preventDefault()
        void splitTerminal()
        return
      }
      if (event.altKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
        event.preventDefault()
        focusNextPane(event.key === 'ArrowRight' ? 1 : -1)
      }
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [splitTerminal, focusNextPane])

  const handleNewTerminal = () => {
    const target = cwd ?? defaultCwd
    if (target) void openTerminal(target)
    else {
      void resolveDefaultCwd().then((home) => {
        if (home) void openTerminal(home)
      })
    }
  }

  const handleRunScript = (name: string) => {
    if (!activeTab) return
    void runCommand(activeTab.id, `npm run ${name}`)
  }

  const handleNpmInstall = () => {
    if (!activeTab) return
    void runCommand(activeTab.id, 'npm install')
  }

  const scripts = useCodeEditorStore((s) => s.npmScripts)

  return (
    <div
      ref={panelRef}
      className={cn(
        'wb-terminal-panel flex h-full min-h-0 flex-col bg-[var(--wb-editor)] text-[var(--wb-fg)]',
        !fullPage && 'border-t border-[var(--wb-border)]'
      )}
    >
      <div className="flex h-7 shrink-0 items-center justify-between border-b border-[var(--wb-border)] bg-[var(--wb-tabbar)] pl-0.5 pr-1">
        <div className="flex h-full min-w-0 flex-1 items-center overflow-x-auto">
          {groups.map((group) => {
            const groupId = group[0]?.groupId
            if (!groupId) return null
            const selected = groupId === activeGroupId
            const representative = selected
              ? (group.find((tab) => tab.id === activeTabId) ?? group[0])
              : group[0]
            if (!representative) return null
            return (
              <div
                key={groupId}
                className={cn(
                  'group flex h-full shrink-0 items-center border-r border-[var(--wb-border)] transition-colors',
                  selected
                    ? 'bg-[var(--wb-tab-active)] text-[var(--wb-fg)]'
                    : 'text-[var(--wb-tab-inactive-fg)] hover:bg-[var(--wb-hover)] hover:text-[var(--wb-fg)]'
                )}
              >
                <button
                  onClick={() => setActiveTab(representative.id)}
                  className="flex h-full min-w-0 items-center gap-1.5 pl-2 pr-0.5 text-[11px]"
                  title={group.map((tab) => tab.cwd).join('\n')}
                >
                  <SquareTerminal className="h-3 w-3 shrink-0" />
                  <span className="max-w-[112px] truncate">{representative.title}</span>
                  {group.length > 1 && (
                    <span className="rounded bg-[var(--wb-badge-bg,var(--wb-hover))] px-1 text-[10px] tabular-nums">
                      {group.length}
                    </span>
                  )}
                  {group.every((tab) => !tab.alive) && (
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#ff5f56]"
                      title="Sessions ended"
                    />
                  )}
                </button>
                <button
                  onClick={() => closeTerminalGroup(groupId)}
                  aria-label={`Close terminal group ${representative.title}`}
                  title="Close terminal group"
                  className="mr-1 flex h-5 w-5 shrink-0 items-center justify-center rounded opacity-0 hover:bg-[var(--wb-hover)] focus:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            )
          })}
          <button
            onClick={handleNewTerminal}
            title="New Terminal"
            className="flex h-full shrink-0 items-center px-2 text-[var(--wb-muted)] hover:bg-[var(--wb-hover)] hover:text-[var(--wb-fg)]"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {showEditorLink && onOpenEditor && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 gap-1 px-2 text-[11px] text-[var(--wb-muted)] hover:bg-[var(--wb-hover)] hover:text-[var(--wb-fg)]"
              onClick={onOpenEditor}
            >
              <FolderCode className="h-3 w-3" /> Open Editor
            </Button>
          )}
          {activeTab && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 gap-1 px-2 text-[11px] text-[var(--wb-muted)] hover:bg-[var(--wb-hover)] hover:text-[var(--wb-fg)]"
              onClick={handleNpmInstall}
              title="Run npm install"
            >
              <Package className="h-3 w-3" /> npm install
            </Button>
          )}
          {activeTab && (
            <button
              onClick={clearActiveTerminal}
              title="Clear terminal"
              className="flex h-6 items-center gap-1 rounded px-2 text-[11px] text-[var(--wb-muted)] hover:bg-[var(--wb-hover)] hover:text-[var(--wb-fg)]"
            >
              <Eraser className="h-3 w-3" /> Clear
            </button>
          )}
          {Object.keys(scripts).length > 0 && activeTab && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 gap-1 px-2 text-[11px] text-[var(--wb-muted)] hover:bg-[var(--wb-hover)] hover:text-[var(--wb-fg)]"
                >
                  <Play className="h-3 w-3" /> Run <ChevronDown className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {Object.keys(scripts).map((name) => (
                  <DropdownMenuItem key={name} onSelect={() => handleRunScript(name)}>
                    <Play className="h-3.5 w-3.5" /> {name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {activeTab && (
            <button
              onClick={() => void splitTerminal()}
              title="Split terminal (Ctrl+Shift+5)"
              aria-label="Split terminal"
              className="flex h-6 w-6 items-center justify-center rounded text-[var(--wb-muted)] hover:bg-[var(--wb-hover)] hover:text-[var(--wb-fg)]"
            >
              <Columns2 className="h-3.5 w-3.5" />
            </button>
          )}
          {activeTab && (
            <button
              onClick={() => stopCommand(activeTab.id)}
              title="Interrupt (Ctrl+C)"
              className="flex h-6 w-6 items-center justify-center rounded text-[var(--wb-muted)] hover:bg-[var(--wb-hover)] hover:text-red-500"
            >
              <Square className="h-3 w-3" />
            </button>
          )}
          {activeTab && (
            <button
              onClick={() => closeTerminal(activeTab.id)}
              title="Kill active terminal"
              aria-label="Kill active terminal"
              className="flex h-6 w-6 items-center justify-center rounded text-[var(--wb-muted)] hover:bg-[var(--wb-hover)] hover:text-red-500"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
          {onClose && (
            <button
              onClick={onClose}
              title="Close Panel"
              className="flex h-6 w-6 items-center justify-center rounded text-[var(--wb-muted)] hover:bg-[var(--wb-hover)] hover:text-[var(--wb-fg)]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      <div
        className="relative grid min-h-0 flex-1"
        style={{
          gridTemplateColumns: `repeat(${Math.max(activeGroupTabs.length, 1)}, minmax(0, 1fr))`
        }}
      >
        {tabs.map((tab) => {
          const visible = tab.groupId === activeGroupId
          const focused = tab.id === activeTabId
          const paneIndex = activeGroupTabs.findIndex((pane) => pane.id === tab.id)
          return (
            <div
              key={tab.id}
              className={cn(
                'min-h-0 min-w-0 flex-col bg-[var(--wb-editor)]',
                visible ? 'flex' : 'hidden',
                paneIndex > 0 && 'border-l border-[var(--wb-border)]'
              )}
              onMouseDown={() => setActiveTab(tab.id)}
            >
              {visible && activeGroupTabs.length > 1 && (
                <div
                  className={cn(
                    'flex h-7 shrink-0 items-center gap-2 border-b px-2 text-[11px]',
                    focused
                      ? 'border-b-[var(--wb-accent)] text-[var(--wb-fg)]'
                      : 'border-b-[var(--wb-border)] text-[var(--wb-muted)]'
                  )}
                >
                  <SquareTerminal className="h-3 w-3 shrink-0" />
                  <span className="min-w-0 flex-1 truncate" title={tab.cwd}>
                    {tab.title}
                  </span>
                  {!tab.alive && <span className="text-[10px] text-red-500">exited</span>}
                  <button
                    onClick={(event) => {
                      event.stopPropagation()
                      closeTerminal(tab.id)
                    }}
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded hover:bg-[var(--wb-hover)]"
                    title="Kill terminal"
                    aria-label={`Kill terminal ${tab.title}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )}
              <div className="min-h-0 flex-1">
                <XtermView
                  tabId={tab.id}
                  visible={visible}
                  focused={focused}
                  onFocus={() => setActiveTab(tab.id)}
                />
              </div>
            </div>
          )
        })}
        {tabs.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[var(--wb-editor)] text-xs text-[var(--wb-muted)]">
            {booting ? (
              <div className="flex items-center gap-2">
                <Spinner size="sm" className="text-[var(--wb-muted)]" />
                Starting terminal…
              </div>
            ) : (
              <>
                <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--wb-border)] bg-[var(--wb-surface)]">
                  <SquareTerminal className="h-4 w-4" />
                </div>
                <span className="font-medium text-[var(--wb-fg)]">Terminal is ready</span>
                <span className="text-[11px]">Start a shell in the current workspace.</span>
                <button
                  onClick={handleNewTerminal}
                  className="mt-1 rounded-md border border-[var(--wb-border)] bg-[var(--wb-surface)] px-2.5 py-1.5 font-medium text-[var(--wb-fg)] shadow-sm transition hover:bg-[var(--wb-hover)]"
                >
                  Start Terminal
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
