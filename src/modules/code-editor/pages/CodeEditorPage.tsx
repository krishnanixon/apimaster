import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Group, Panel, Separator } from 'react-resizable-panels'
import {
  AlertCircle,
  ArrowRight,
  Brain,
  Clock3,
  FilePlus,
  FolderCode,
  FolderOpen,
  FolderPlus,
  GitBranch,
  ListTree,
  Save,
  Search,
  SearchCheck,
  Trash2,
  X
} from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Spinner } from '@/shared/components/ui/spinner'
import { useCodeEditorStore } from '../stores/codeEditor.store'
import { useGitStore } from '../stores/git.store'
import { useCodeIndexStore } from '../stores/codeIndex.store'
import { useProblemsStore } from '../stores/problems.store'
import { useDebugStore } from '../stores/debug.store'
import { useWorkbenchLayoutStore } from '../stores/workbench.store'
import { useTerminalStore } from '@/modules/terminal/stores/terminal.store'
import { FileTree } from '../components/FileTree'
import { GitPanel } from '../components/GitPanel'
import { SearchPanel } from '../components/SearchPanel'
import { ProblemsPanel } from '../components/ProblemsPanel'
import { OutlinePanel } from '../components/OutlinePanel'
import { AgentPanel } from '../components/AgentPanel'
import { AgentIntelPanel } from '../components/AgentIntelPanel'
import { TabBar } from '../components/TabBar'
import { CodeEditorPane } from '../components/CodeEditorPane'
import { MergeDiffPane } from '../components/MergeDiffPane'
import { WorkbenchBottomPanel } from '../components/WorkbenchBottomPanel'
import { EditorStatusBar } from '../components/EditorStatusBar'
import { ActivityBar } from '../components/ActivityBar'
import { QuickOpen } from '../components/QuickOpen'
import { EditorSettingsDialog } from '../components/EditorSettingsDialog'
import { InlineAiActions } from '../components/InlineAiActions'
import { NamePromptDialog } from '../components/NamePromptDialog'
import { SeoAuditPanel } from '../components/SeoAuditPanel'
import { useWorkbenchShortcuts } from '../lib/workbench-shortcuts'
import { useAgentStore } from '../stores/agent.store'
import type { IndexerStatus } from '@shared/types/code-intel'
import '../theme/workbench.css'

const SPLITTER_V =
  'relative w-1 shrink-0 bg-transparent before:absolute before:inset-y-0 before:left-1/2 before:w-px before:-translate-x-1/2 before:bg-[var(--wb-border)] hover:before:bg-[var(--wb-accent)]'
const SPLITTER_H =
  'relative h-1 shrink-0 bg-transparent before:absolute before:inset-x-0 before:top-1/2 before:h-px before:-translate-y-1/2 before:bg-[var(--wb-border)] hover:before:bg-[var(--wb-accent)]'

function indexStatusLabel(status: IndexerStatus | null): string {
  if (!status || status.state === 'idle') return ''
  if (status.state === 'scanning') return 'Scanning…'
  if (status.state === 'indexing') {
    return `Indexing ${status.processed}/${status.total}`
  }
  if (status.state === 'error') return status.error ?? 'Index error'
  if (status.files === 0) return 'Watching'
  return `${status.files} files · ${status.symbols} symbols`
}

export function CodeEditorPage() {
  const [searchParams] = useSearchParams()
  const focusTerminal = searchParams.get('focus') === 'terminal'
  const [newEntryKind, setNewEntryKind] = useState<'file' | 'folder' | null>(null)

  const rootPath = useCodeEditorStore((s) => s.rootPath)
  const rootName = useCodeEditorStore((s) => s.rootName)
  const isOpeningFolder = useCodeEditorStore((s) => s.isOpeningFolder)
  const openFolder = useCodeEditorStore((s) => s.openFolder)
  const closeWorkspace = useCodeEditorStore((s) => s.closeWorkspace)
  const saveActiveTab = useCodeEditorStore((s) => s.saveActiveTab)
  const createEntry = useCodeEditorStore((s) => s.createEntry)
  const restoreWorkspace = useCodeEditorStore((s) => s.restoreWorkspace)
  const activeTabDirty = useCodeEditorStore(
    (s) => s.tabs.find((t) => t.path === s.activeTabPath)?.dirty ?? false
  )
  const activeTabPath = useCodeEditorStore((s) => s.activeTabPath)
  const editorPanes = useCodeEditorStore((s) => s.editorPanes)
  const focusedPane = useCodeEditorStore((s) => s.focusedPane)
  const closePane = useCodeEditorStore((s) => s.closePane)
  const focusPane = useCodeEditorStore((s) => s.focusPane)
  const diffSession = useCodeEditorStore((s) => s.diffSession)

  const disposeAllTerminals = useTerminalStore((s) => s.disposeAll)
  const loadWorkspaceState = useTerminalStore((s) => s.loadWorkspaceState)
  const recentFolders = useTerminalStore((s) => s.recentFolders)
  const removeRecentFolder = useTerminalStore((s) => s.removeRecentFolder)

  const leftTab = useWorkbenchLayoutStore((s) => s.leftTab)
  const agentOpen = useWorkbenchLayoutStore((s) => s.agentOpen)
  const setAgentOpen = useWorkbenchLayoutStore((s) => s.setAgentOpen)
  const bottomTab = useWorkbenchLayoutStore((s) => s.bottomTab)
  const sidebarOpen = useWorkbenchLayoutStore((s) => s.sidebarOpen)
  const problemCount = useProblemsStore((s) => s.items.length)
  const gitRefresh = useGitStore((s) => s.refresh)
  const indexStatus = useCodeIndexStore((s) => s.status)
  const subscribeIndex = useCodeIndexStore((s) => s.subscribe)
  const startIndex = useCodeIndexStore((s) => s.start)
  const subscribeLanguage = useProblemsStore((s) => s.subscribeLanguage)
  const subscribeDebug = useDebugStore((s) => s.subscribe)
  const statusLabel = indexStatusLabel(indexStatus)
  const restoreAgentConversation = useAgentStore((s) => s.restoreConversation)

  useWorkbenchShortcuts()

  useEffect(() => {
    if (focusTerminal) useWorkbenchLayoutStore.getState().setBottomTab('terminal')
  }, [focusTerminal])

  useEffect(() => {
    void restoreWorkspace(focusTerminal)
    void loadWorkspaceState()
  }, [restoreWorkspace, focusTerminal, loadWorkspaceState])

  useEffect(() => {
    if (rootPath) void gitRefresh()
  }, [rootPath, gitRefresh])

  useEffect(() => {
    if (rootPath) void restoreAgentConversation(rootPath)
  }, [rootPath, restoreAgentConversation])

  useEffect(() => {
    if (!rootPath) return
    return subscribeIndex()
  }, [rootPath, subscribeIndex])

  useEffect(() => {
    return subscribeLanguage()
  }, [subscribeLanguage])

  useEffect(() => {
    return subscribeDebug()
  }, [subscribeDebug])

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ kind: 'file' | 'folder' }>).detail
      if (detail?.kind) setNewEntryKind(detail.kind)
    }
    window.addEventListener('workbench:new-entry', handler)
    return () => window.removeEventListener('workbench:new-entry', handler)
  }, [])

  useEffect(() => {
    return () => disposeAllTerminals()
  }, [disposeAllTerminals])

  if (!rootPath) {
    return (
      <div className="flex h-full min-h-0 flex-col bg-[var(--wb-editor)]" data-code-editor>
        <div className="flex h-8 shrink-0 items-center border-b border-[var(--wb-border)] bg-[var(--wb-tabbar)] px-3">
          <div className="flex items-center gap-2 text-[12px] text-[var(--wb-muted)]">
            <FolderCode className="h-3.5 w-3.5 text-[var(--wb-accent)]" />
            <span>Explorer</span>
          </div>
        </div>
        <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-6 py-12">
          <div className="mb-8 flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--wb-accent-soft)] text-[var(--wb-accent)]">
              <FolderCode className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-[var(--wb-fg)]">Welcome to the code editor</h1>
              <p className="mt-1 text-sm text-[var(--wb-muted)]">Open a project or folder to start working.</p>
            </div>
          </div>

          <Button
            className="mb-8 h-11 w-full justify-between rounded-lg bg-[var(--wb-accent)] px-4 text-sm font-medium text-white hover:opacity-90"
            onClick={() => void openFolder()}
            disabled={isOpeningFolder}
          >
            <span className="flex items-center gap-2">
              {isOpeningFolder ? <Spinner size="sm" className="text-current" /> : <FolderOpen className="h-4 w-4" />}
              Open Project or Folder
            </span>
            <ArrowRight className="h-4 w-4" />
          </Button>

          {recentFolders.length > 0 ? (
            <div>
              <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-[var(--wb-muted)]">
                <Clock3 className="h-3.5 w-3.5" />
                Recent folders
              </div>
              <div className="overflow-hidden rounded-lg border border-[var(--wb-border)] bg-[var(--wb-sidebar)]">
                {recentFolders.map((folder) => (
                  <div key={folder.path} className="group flex items-center gap-3 border-b border-[var(--wb-border)] px-3 py-2.5 last:border-b-0 hover:bg-[var(--wb-hover)]">
                    <FolderOpen className="h-4 w-4 shrink-0 text-[var(--wb-accent)]" />
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      onClick={() => void useCodeEditorStore.getState().openFolderAtPath(folder.path)}
                      title={folder.path}
                    >
                      <p className="truncate text-sm font-medium text-[var(--wb-fg)]">{folder.name}</p>
                      <p className="truncate text-xs text-[var(--wb-muted)]">{folder.path}</p>
                    </button>
                    <button
                      type="button"
                      className="rounded p-1.5 text-[var(--wb-muted)] opacity-0 transition-opacity hover:bg-[var(--wb-border)] hover:text-[var(--wb-fg)] group-hover:opacity-100"
                      title="Remove from recent folders"
                      onClick={() => removeRecentFolder(folder.path)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-center text-xs text-[var(--wb-muted)]">Your recently opened folders will appear here.</p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col" data-code-editor>
      <div className="wb-glass-chrome flex h-8 shrink-0 items-center justify-between gap-2 border-b border-[var(--wb-border)] bg-[var(--wb-tabbar)] px-2">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-5 w-5 items-center justify-center rounded-[6px] bg-[var(--wb-accent-soft)]">
            <FolderCode className="h-3.5 w-3.5 text-[var(--wb-accent)]" />
          </div>
          <span className="truncate text-[12px] font-semibold tracking-tight text-[var(--wb-fg)]" title={rootPath}>
            {rootName}
          </span>
          {statusLabel ? (
            <button
              type="button"
              className="truncate rounded-[6px] px-1.5 py-0.5 text-[11px] text-[var(--wb-muted)] hover:bg-[var(--wb-hover)] hover:text-[var(--wb-fg)]"
              title={indexStatus?.error ? indexStatus.error : 'Rebuild code index'}
              onClick={() => void startIndex()}
            >
              {statusLabel}
            </button>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center">
          <Button variant="ghost" size="icon" className="h-6 w-6 text-[var(--wb-muted)] hover:bg-[var(--wb-hover)] hover:text-[var(--wb-fg)]" title="New File" onClick={() => setNewEntryKind('file')}>
            <FilePlus className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-[var(--wb-muted)] hover:bg-[var(--wb-hover)] hover:text-[var(--wb-fg)]"
            title="New Folder"
            onClick={() => setNewEntryKind('folder')}
          >
            <FolderPlus className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-[var(--wb-muted)] hover:bg-[var(--wb-hover)] hover:text-[var(--wb-fg)]"
            onClick={() => void saveActiveTab()}
            disabled={!activeTabDirty}
            title="Save (Ctrl+S)"
          >
            <Save className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-[var(--wb-muted)] hover:bg-[var(--wb-hover)] hover:text-[var(--wb-fg)]"
            onClick={() => void openFolder()}
            disabled={isOpeningFolder}
            title="Open Folder"
          >
            {isOpeningFolder ? <Spinner size="sm" /> : <FolderOpen className="h-3.5 w-3.5" />}
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6 text-[var(--wb-muted)] hover:bg-[var(--wb-hover)] hover:text-[var(--wb-fg)]" onClick={closeWorkspace} title="Close workspace">
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <Group id="code-editor-vertical" orientation="vertical" className="min-h-0 w-full flex-1">
        <Panel id="code-editor-upper" className="min-h-0">
          <div className="flex h-full min-h-0 min-w-0">
            <ActivityBar />
            <Group id="code-editor-layout" orientation="horizontal" className="h-full min-h-0 min-w-0 flex-1">
              {sidebarOpen ? (
                <>
                  <Panel id="code-editor-tree" defaultSize="20%" minSize="160px" maxSize="40%" className="min-w-0">
                    <div className="flex h-full min-w-0 flex-col overflow-hidden border-r border-[var(--wb-border)] bg-[var(--wb-sidebar)]">
                      <div className="wb-panel-header">
                        <span className="wb-panel-title">
                        {leftTab === 'files' ? (
                          <>
                            <FolderCode className="h-3.5 w-3.5" /> Explorer
                          </>
                        ) : leftTab === 'git' ? (
                          <>
                            <GitBranch className="h-3.5 w-3.5" /> Source Control
                          </>
                        ) : leftTab === 'search' ? (
                          <>
                            <Search className="h-3.5 w-3.5" /> Search
                          </>
                        ) : leftTab === 'outline' ? (
                          <>
                            <ListTree className="h-3.5 w-3.5" /> Outline
                          </>
                        ) : leftTab === 'seo' ? (
                          <>
                            <SearchCheck className="h-3.5 w-3.5" /> Search Intelligence
                          </>
                        ) : leftTab === 'ai' ? (
                          <>
                            <Brain className="h-3.5 w-3.5" /> Agent Intel
                          </>
                        ) : (
                          <>
                            <AlertCircle className="h-3.5 w-3.5" />
                            Problems{problemCount > 0 ? ` (${problemCount})` : ''}
                          </>
                        )}
                        </span>
                      </div>
                      <div className="min-h-0 flex-1 overflow-hidden">
                        {leftTab === 'files' ? (
                          <FileTree rootPath={rootPath} rootName={rootName ?? rootPath} />
                        ) : leftTab === 'git' ? (
                          <GitPanel />
                        ) : leftTab === 'search' ? (
                          <SearchPanel />
                        ) : leftTab === 'outline' ? (
                          <OutlinePanel />
                        ) : leftTab === 'seo' ? (
                          <SeoAuditPanel />
                        ) : leftTab === 'ai' ? (
                          <AgentIntelPanel />
                        ) : (
                          <ProblemsPanel />
                        )}
                      </div>
                    </div>
                  </Panel>
                  <Separator className={SPLITTER_V} />
                </>
              ) : null}

              <Panel id="code-editor-main" className="min-w-0">
                <div className="flex h-full min-w-0 flex-col overflow-hidden">
                  <TabBar />
                  {diffSession ? (
                    <MergeDiffPane />
                  ) : (
                    <div className="flex min-h-0 flex-1">
                      {(editorPanes.length ? editorPanes : activeTabPath ? [activeTabPath] : [undefined]).map((path, index, panes) => (
                        <div
                          key={`${index}-${path ?? 'welcome'}`}
                          className="flex min-w-0 flex-1 flex-col border-l border-[var(--wb-border)] first:border-l-0"
                          onMouseDown={() => focusPane(index)}
                        >
                          {panes.length > 1 && path ? (
                            <div className="flex h-6 shrink-0 items-center justify-between border-b border-[var(--wb-border)] bg-[var(--wb-tabbar)] px-2 text-[11px]">
                              <span className={focusedPane === index ? 'font-medium text-[var(--wb-fg)]' : 'text-[var(--wb-muted)]'}>
                                {path.split(/[\\/]/).pop()}
                              </span>
                              {panes.length > 1 ? (
                                <button
                                  type="button"
                                  className="text-[var(--wb-muted)] hover:text-[var(--wb-fg)]"
                                  title="Close editor group"
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    closePane(index)
                                  }}
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              ) : null}
                            </div>
                          ) : null}
                          <div className="min-h-0 flex-1">
                            <CodeEditorPane tabPath={path} paneIndex={index} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </Panel>

              {agentOpen && (
                <>
                  <Separator className={SPLITTER_V} />
                  <Panel id="code-editor-agent" defaultSize="25%" minSize="230px" maxSize="45%" className="min-w-0">
                    <AgentPanel onClose={() => setAgentOpen(false)} />
                  </Panel>
                </>
              )}
            </Group>
          </div>
        </Panel>

        {bottomTab && (
          <>
            <Separator className={SPLITTER_H} />
            <Panel id="code-editor-terminal" defaultSize="20%" minSize="108px" maxSize="55%" className="min-h-0">
              <WorkbenchBottomPanel />
            </Panel>
          </>
        )}
      </Group>

      <EditorStatusBar />
      <InlineAiActions />
      <QuickOpen />
      <EditorSettingsDialog />

      <NamePromptDialog
        open={newEntryKind !== null}
        onOpenChange={(open) => !open && setNewEntryKind(null)}
        title={newEntryKind === 'folder' ? 'New Folder' : 'New File'}
        confirmLabel="Create"
        onSubmit={(name) => {
          if (newEntryKind) void createEntry(rootPath, name, newEntryKind)
        }}
      />
    </div>
  )
}
