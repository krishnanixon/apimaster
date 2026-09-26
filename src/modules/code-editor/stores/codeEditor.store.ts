import { create } from 'zustand'
import { toast } from 'sonner'
import type {
  EditorContextSnapshot,
  FileSearchHit,
  FileSystemEntry,
  FileSystemEntryKind,
  IgnoreRulesState
} from '@shared/types/code-editor'
import { useGitStore } from './git.store'
import { useCodeIndexStore } from './codeIndex.store'
import { useEditorSettingsStore } from './editorSettings.store'
import { useProblemsStore } from './problems.store'
import { formatSource, formatterFor } from '../lib/format'
import { scheduleLanguageBuffer } from '../lib/language-client'

export interface DirNode {
  loading: boolean
  loaded: boolean
  entries: FileSystemEntry[]
}

export interface EditorTab {
  path: string
  name: string
  content: string
  originalContent: string
  dirty: boolean
  loading: boolean
  pinned: boolean
}

export interface RevealTarget {
  path: string
  line: number
  column?: number
  endLine?: number
}

export interface DiffSession {
  path: string
  original: string
  modified: string
  title?: string
}

const MAX_EDITOR_PANES = 3

function assignFocusedPane(panes: string[], focusedPane: number, path: string): string[] {
  if (panes.length === 0) return [path]
  const next = [...panes]
  const index = Math.min(Math.max(focusedPane, 0), next.length - 1)
  next[index] = path
  return next
}

function retargetPanes(panes: string[], closedPath: string, fallback: string | null): string[] {
  const next = panes.map((path) => (path === closedPath ? fallback : path)).filter((path): path is string => Boolean(path))
  return next.length > 0 ? next : fallback ? [fallback] : []
}

function findOpenTab(
  state: Pick<CodeEditorState, 'tabs' | 'rootPath'>,
  path: string
): EditorTab | undefined {
  const root = state.rootPath
  const normalized = path.replace(/\\/g, '/')
  const abs = root && !normalized.includes(':') && !path.startsWith(root) ? `${root}/${normalized}` : path
  const absNorm = abs.replace(/\\/g, '/')
  return state.tabs.find((item) => {
    const itemPath = item.path.replace(/\\/g, '/')
    return itemPath === absNorm || itemPath.endsWith(normalized)
  })
}

interface CodeEditorState {
  rootPath: string | null
  rootName: string | null
  dirCache: Record<string, DirNode>
  expandedPaths: Set<string>
  tabs: EditorTab[]
  activeTabPath: string | null
  isOpeningFolder: boolean
  npmScripts: Record<string, string>
  workspaceRestored: boolean
  showIgnored: boolean
  ignoreRules: IgnoreRulesState | null
  fileSearchQuery: string
  fileSearchHits: FileSearchHit[]
  selectedCode: string
  selectionLineCount: number
  cursor: { line: number; column: number; offset: number } | null
  pendingReveal: RevealTarget | null
  editorPanes: string[]
  focusedPane: number
  diffSession: DiffSession | null
  /** Most-recently-used tab paths, newest first — drives Ctrl+Tab switching. */
  recentTabPaths: string[]
  /** Recently closed editors, newest first — drives Ctrl+Shift+T. */
  closedTabPaths: string[]
  /** File contents at git HEAD, keyed by absolute path, for the change gutter. */
  gitBaselines: Record<string, string | null>
  formatting: boolean
  revealInTreeNonce: number
  revealInTreePath: string | null
  explorerClip: { mode: 'copy' | 'cut'; paths: string[] } | null

  restoreWorkspace: (focusTerminal?: boolean) => Promise<void>
  persistWorkspace: () => Promise<void>
  openFolder: () => Promise<void>
  openFolderAtPath: (path: string) => Promise<boolean>
  closeWorkspace: () => void
  toggleExpand: (path: string) => Promise<void>
  refreshDirectory: (path: string) => Promise<void>
  refreshOpenDirectories: () => Promise<void>
  openFile: (entry: FileSystemEntry) => Promise<void>
  openFileByPath: (path: string) => Promise<void>
  setActiveTab: (path: string) => void
  closeTab: (path: string) => void
  closeOtherTabs: (path: string) => void
  closeAllTabs: () => void
  closeSavedTabs: () => void
  reopenClosedTab: () => Promise<void>
  togglePinTab: (path: string) => void
  moveTab: (fromPath: string, toPath: string) => void
  activateTabByIndex: (index: number) => void
  cycleTab: (direction: 1 | -1) => void
  activateRecentTab: () => void
  updateTabContent: (path: string, content: string) => void
  saveTab: (path: string) => Promise<void>
  saveActiveTab: () => Promise<void>
  saveAllTabs: () => Promise<void>
  formatTab: (path: string) => Promise<boolean>
  formatActiveTab: () => Promise<void>
  loadGitBaseline: (path: string) => Promise<void>
  revealPathInTree: (path: string) => Promise<void>
  createEntry: (parentPath: string, name: string, kind: FileSystemEntryKind) => Promise<void>
  renameEntry: (path: string, newName: string) => Promise<void>
  deleteEntry: (path: string) => Promise<void>
  setShowIgnored: (show: boolean) => Promise<void>
  setCustomIgnoreNames: (names: string[]) => Promise<void>
  loadIgnoreRules: () => Promise<void>
  setFileSearchQuery: (query: string) => void
  searchFiles: (query: string) => Promise<void>
  updateEditorSelection: (
    selectedCode: string,
    cursor: { line: number; column: number; offset: number } | null,
    selectionLineCount?: number
  ) => void
  openFileAtLine: (path: string, line: number, column?: number, endLine?: number) => Promise<void>
  goToLine: (line: number, column?: number) => void
  clearPendingReveal: () => void
  toggleSplit: () => void
  splitRight: (path: string) => void
  closePane: (index: number) => void
  focusPane: (index: number) => void
  openDiff: (path: string) => Promise<void>
  closeDiff: () => void
  reloadFileIfOpen: (path: string) => Promise<void>
  applyAgentContent: (path: string, content: string) => void
  importDroppedPaths: (sourcePaths: string[], destDir: string) => Promise<string[]>
  copyExplorerPaths: (paths: string[]) => void
  cutExplorerPaths: (paths: string[]) => void
  pasteExplorer: (destDir: string) => Promise<void>
  duplicateEntry: (path: string) => Promise<void>
  moveDropped: (sourcePath: string, destDir: string) => Promise<string | null>
  revealInOs: (path: string) => Promise<void>
  replaceInFiles: (input: {
    query: string
    replacement: string
    regex: boolean
    paths: string[]
  }) => Promise<{ files: number; replacements: number }>
  pushEditorContext: () => void
}

function fileNameOf(path: string): string {
  const parts = path.split(/[\\/]/)
  return parts[parts.length - 1] || path
}

function parentDirOf(path: string): string {
  return path.slice(0, Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')))
}

let persistTimer: ReturnType<typeof setTimeout> | null = null
let contextTimer: ReturnType<typeof setTimeout> | null = null
let searchTimer: ReturnType<typeof setTimeout> | null = null
const autoSaveTimers = new Map<string, ReturnType<typeof setTimeout>>()

function scheduleAutoSave(path: string, get: () => CodeEditorState): void {
  const { autoSave, autoSaveDelayMs } = useEditorSettingsStore.getState()
  if (autoSave !== 'afterDelay') return
  const existing = autoSaveTimers.get(path)
  if (existing) clearTimeout(existing)
  autoSaveTimers.set(
    path,
    setTimeout(() => {
      autoSaveTimers.delete(path)
      void get().saveTab(path)
    }, Math.max(250, autoSaveDelayMs))
  )
}

/** Pinned tabs stay to the left of unpinned ones, mirroring VS Code. */
function sortTabs(tabs: EditorTab[]): EditorTab[] {
  const pinned = tabs.filter((tab) => tab.pinned)
  const rest = tabs.filter((tab) => !tab.pinned)
  return [...pinned, ...rest]
}

function touchRecent(recent: string[], path: string): string[] {
  return [path, ...recent.filter((item) => item !== path)].slice(0, 30)
}

function schedulePersist(get: () => CodeEditorState): void {
  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = setTimeout(() => {
    void get().persistWorkspace()
  }, 500)
}

function scheduleContextPush(get: () => CodeEditorState): void {
  if (contextTimer) clearTimeout(contextTimer)
  contextTimer = setTimeout(() => {
    get().pushEditorContext()
  }, 400)
}

async function loadNpmScripts(rootPath: string): Promise<Record<string, string>> {
  const result = await window.electronAPI.codeEditor.readFile(`${rootPath}/package.json`)
  if (!result.success || !result.data) return {}
  try {
    const parsed = JSON.parse(result.data) as { scripts?: Record<string, string> }
    return parsed.scripts ?? {}
  } catch {
    return {}
  }
}

export const useCodeEditorStore = create<CodeEditorState>((set, get) => ({
  rootPath: null,
  rootName: null,
  dirCache: {},
  expandedPaths: new Set(),
  tabs: [],
  activeTabPath: null,
  isOpeningFolder: false,
  npmScripts: {},
  workspaceRestored: false,
  showIgnored: false,
  ignoreRules: null,
  fileSearchQuery: '',
  fileSearchHits: [],
  selectedCode: '',
  selectionLineCount: 0,
  cursor: null,
  pendingReveal: null,
  editorPanes: [],
  focusedPane: 0,
  diffSession: null,
  recentTabPaths: [],
  closedTabPaths: [],
  gitBaselines: {},
  formatting: false,
  revealInTreeNonce: 0,
  revealInTreePath: null,
  explorerClip: null,

  persistWorkspace: async () => {
    const { rootPath, tabs, activeTabPath, expandedPaths } = get()
    const { useTerminalStore } = await import('@/modules/terminal/stores/terminal.store')
    const terminal = useTerminalStore.getState()
    const terminalGroups = terminal.getPersistedGroups()
    const activeTerminal = terminal.tabs.find((tab) => tab.id === terminal.activeTabId)
    const groupIds = [...new Set(terminal.tabs.map((tab) => tab.groupId))]

    await window.electronAPI.codeEditor.saveWorkspaceState({
      lastRootPath: rootPath,
      openTabPaths: tabs.map((t) => t.path),
      pinnedTabPaths: tabs.filter((t) => t.pinned).map((t) => t.path),
      activeTabPath,
      expandedPaths: [...expandedPaths],
      terminalPanelOpen: terminal.panelOpen,
      terminalCwds: terminal.getPersistedCwds(),
      activeTerminalIndex: Math.max(
        0,
        terminal.tabs.findIndex((t) => t.id === terminal.activeTabId)
      ),
      terminalGroups,
      activeTerminalGroupIndex: Math.max(
        0,
        groupIds.findIndex((groupId) => groupId === activeTerminal?.groupId)
      )
    })
  },

  restoreWorkspace: async (focusTerminal = false) => {
    if (get().workspaceRestored) return
    set({ workspaceRestored: true })

    const { useTerminalStore } = await import('@/modules/terminal/stores/terminal.store')
    const terminal = useTerminalStore.getState()

    const stateResult = await window.electronAPI.codeEditor.getWorkspaceState()
    if (!stateResult.success || !stateResult.data?.lastRootPath) {
      terminal.allowAutoStart()
      return
    }

    const saved = stateResult.data
    const savedRootPath = saved.lastRootPath
    if (!savedRootPath) {
      terminal.allowAutoStart()
      return
    }
    const opened = await get().openFolderAtPath(savedRootPath)
    if (!opened) {
      terminal.allowAutoStart()
      return
    }

    if (saved.expandedPaths.length > 0) {
      set({ expandedPaths: new Set(saved.expandedPaths) })
    }
    if (saved.showIgnored) set({ showIgnored: true })

    for (const filePath of saved.openTabPaths) {
      await get().openFileByPath(filePath)
    }
    if (saved.pinnedTabPaths.length > 0) {
      const pinned = new Set(saved.pinnedTabPaths)
      set((state) => ({
        tabs: sortTabs(state.tabs.map((tab) => (pinned.has(tab.path) ? { ...tab, pinned: true } : tab)))
      }))
    }
    if (saved.activeTabPath) {
      set((state) => ({
        activeTabPath: saved.activeTabPath,
        editorPanes: assignFocusedPane(
          state.editorPanes.length ? state.editorPanes : [saved.activeTabPath!],
          0,
          saved.activeTabPath!
        ),
        focusedPane: 0
      }))
    }

    terminal.togglePanel(focusTerminal ? true : saved.terminalPanelOpen)
    if (focusTerminal || saved.terminalPanelOpen) {
      const { useWorkbenchLayoutStore } = await import('./workbench.store')
      useWorkbenchLayoutStore.getState().setBottomTab('terminal')
    }
    if (saved.terminalGroups.length > 0) {
      await terminal.restoreTerminalLayout(saved.terminalGroups, saved.activeTerminalGroupIndex)
    } else if (saved.terminalCwds.length > 0) {
      await terminal.restoreTerminals(saved.terminalCwds, saved.activeTerminalIndex)
    } else if (saved.lastRootPath) {
      useTerminalStore.setState({ restoring: true })
      try {
        await terminal.openTerminal(saved.lastRootPath)
      } finally {
        useTerminalStore.setState({ restoring: false, autoStartAllowed: true })
      }
    } else {
      terminal.allowAutoStart()
    }
  },

  openFolder: async () => {
    set({ isOpeningFolder: true })
    try {
      const result = await window.electronAPI.codeEditor.openFolder()
      if (!result.success) {
        toast.error(result.error ?? 'Failed to open folder')
        return
      }
      if (!result.data) return

      const { rootPath, rootName, entries } = result.data
      const scripts = await loadNpmScripts(rootPath)
      const { useTerminalStore } = await import('@/modules/terminal/stores/terminal.store')
      useTerminalStore.getState().addRecentFolder(rootPath, rootName)
      set({
        rootPath,
        rootName,
        npmScripts: scripts,
        dirCache: { [rootPath]: { loading: false, loaded: true, entries } },
        expandedPaths: new Set([rootPath]),
        tabs: [],
        activeTabPath: null
      })
      await get().loadIgnoreRules()
      void useGitStore.getState().refresh()
      schedulePersist(get)
    } finally {
      set({ isOpeningFolder: false })
    }
  },

  openFolderAtPath: async (rootPath) => {
    const result = await window.electronAPI.codeEditor.openFolderPath(rootPath)
    if (!result.success || !result.data) return false

    const { rootName, entries } = result.data
    const scripts = await loadNpmScripts(rootPath)
    const { useTerminalStore } = await import('@/modules/terminal/stores/terminal.store')
    useTerminalStore.getState().addRecentFolder(rootPath, rootName)
    set({
      rootPath,
      rootName,
      npmScripts: scripts,
      dirCache: { [rootPath]: { loading: false, loaded: true, entries } },
      expandedPaths: new Set([rootPath])
    })
    await get().loadIgnoreRules()
    void useGitStore.getState().refresh()
    schedulePersist(get)
    return true
  },

  closeWorkspace: () => {
    void window.electronAPI.codeEditor.closeWorkspace()
    useGitStore.getState().reset()
    useCodeIndexStore.getState().reset()
    void import('./problems.store').then(({ useProblemsStore }) => useProblemsStore.getState().clear())
    void import('./debug.store').then(({ useDebugStore }) => useDebugStore.getState().reset())
    set({
      rootPath: null,
      rootName: null,
      dirCache: {},
      expandedPaths: new Set(),
      tabs: [],
      activeTabPath: null,
      npmScripts: {},
      fileSearchQuery: '',
      fileSearchHits: [],
      selectedCode: '',
      selectionLineCount: 0,
      cursor: null,
      pendingReveal: null,
      editorPanes: [],
      focusedPane: 0,
      diffSession: null,
      recentTabPaths: [],
      closedTabPaths: [],
      gitBaselines: {},
      explorerClip: null
    })
    void get().persistWorkspace()
  },

  toggleExpand: async (path) => {
    const expanded = new Set(get().expandedPaths)
    if (expanded.has(path)) {
      expanded.delete(path)
      set({ expandedPaths: expanded })
      schedulePersist(get)
      return
    }
    expanded.add(path)
    set({ expandedPaths: expanded })
    if (!get().dirCache[path]?.loaded) {
      await get().refreshDirectory(path)
    }
    schedulePersist(get)
  },

  refreshDirectory: async (path) => {
    set((state) => ({
      dirCache: { ...state.dirCache, [path]: { loading: true, loaded: false, entries: [] } }
    }))
    const result = await window.electronAPI.codeEditor.readDirectory(path, {
      includeIgnored: get().showIgnored
    })
    if (!result.success || !result.data) {
      toast.error(result.error ?? 'Failed to read directory')
      set((state) => ({
        dirCache: { ...state.dirCache, [path]: { loading: false, loaded: false, entries: [] } }
      }))
      return
    }
    set((state) => ({
      dirCache: {
        ...state.dirCache,
        [path]: { loading: false, loaded: true, entries: result.data!.entries }
      }
    }))
  },

  refreshOpenDirectories: async () => {
    const paths = Object.keys(get().dirCache)
    await Promise.all(paths.map((path) => get().refreshDirectory(path)))
  },

  openFileByPath: async (path) => {
    await get().openFile({ path, name: fileNameOf(path), isDirectory: false })
  },

  openFile: async (entry) => {
    if (entry.isDirectory) return
    const existing = get().tabs.find((t) => t.path === entry.path)
    if (existing) {
      set((state) => ({
        activeTabPath: entry.path,
        editorPanes: assignFocusedPane(state.editorPanes.length ? state.editorPanes : [entry.path], state.focusedPane, entry.path),
        recentTabPaths: touchRecent(state.recentTabPaths, entry.path)
      }))
      schedulePersist(get)
      return
    }

    const placeholderTab: EditorTab = {
      path: entry.path,
      name: entry.name,
      content: '',
      originalContent: '',
      dirty: false,
      loading: true,
      pinned: false
    }
    set((state) => ({
      tabs: [...state.tabs, placeholderTab],
      activeTabPath: entry.path,
      editorPanes: assignFocusedPane(
        state.editorPanes.length ? state.editorPanes : [entry.path],
        state.focusedPane,
        entry.path
      ),
      recentTabPaths: touchRecent(state.recentTabPaths, entry.path)
    }))

    const result = await window.electronAPI.codeEditor.readFile(entry.path)
    if (!result.success || result.data === undefined) {
      toast.error(result.error ?? 'Failed to open file')
      set((state) => ({
        tabs: state.tabs.filter((t) => t.path !== entry.path),
        activeTabPath: state.activeTabPath === entry.path ? null : state.activeTabPath
      }))
      return
    }

    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.path === entry.path
          ? { ...t, content: result.data!, originalContent: result.data!, loading: false }
          : t
      )
    }))
    schedulePersist(get)
    void get().loadGitBaseline(entry.path)
  },

  setActiveTab: (path) => {
    set((state) => ({
      activeTabPath: path,
      editorPanes: assignFocusedPane(state.editorPanes.length ? state.editorPanes : [path], state.focusedPane, path),
      recentTabPaths: touchRecent(state.recentTabPaths, path)
    }))
    schedulePersist(get)
    scheduleContextPush(get)
  },

  closeTab: (path) => {
    const { tabs, activeTabPath, editorPanes, focusedPane } = get()
    const remaining = tabs.filter((t) => t.path !== path)
    let nextActive = activeTabPath
    if (activeTabPath === path) {
      const closedIndex = tabs.findIndex((t) => t.path === path)
      nextActive = remaining[Math.min(closedIndex, remaining.length - 1)]?.path ?? null
    }
    const nextPanes = retargetPanes(editorPanes, path, nextActive)
    set((state) => ({
      tabs: remaining,
      activeTabPath: nextActive,
      editorPanes: nextPanes,
      focusedPane: Math.min(focusedPane, Math.max(0, nextPanes.length - 1)),
      diffSession: state.diffSession?.path === path ? null : state.diffSession,
      recentTabPaths: state.recentTabPaths.filter((item) => item !== path),
      closedTabPaths: [path, ...state.closedTabPaths.filter((item) => item !== path)].slice(0, 30)
    }))
    schedulePersist(get)
    scheduleContextPush(get)
  },

  closeOtherTabs: (path) => {
    set((state) => {
      const closed = state.tabs.filter((tab) => tab.path !== path && !tab.pinned).map((tab) => tab.path)
      return {
        tabs: state.tabs.filter((tab) => tab.path === path || tab.pinned),
        activeTabPath: path,
        editorPanes: [path],
        focusedPane: 0,
        recentTabPaths: [path],
        closedTabPaths: [...closed, ...state.closedTabPaths].slice(0, 30)
      }
    })
    schedulePersist(get)
    scheduleContextPush(get)
  },

  closeAllTabs: () => {
    set((state) => {
      const remaining = state.tabs.filter((tab) => tab.pinned)
      const closed = state.tabs.filter((tab) => !tab.pinned).map((tab) => tab.path)
      return {
        tabs: remaining,
        activeTabPath: remaining[0]?.path ?? null,
        editorPanes: remaining[0] ? [remaining[0].path] : [],
        focusedPane: 0,
        recentTabPaths: remaining.map((tab) => tab.path),
        closedTabPaths: [...closed, ...state.closedTabPaths].slice(0, 30)
      }
    })
    schedulePersist(get)
    scheduleContextPush(get)
  },

  closeSavedTabs: () => {
    set((state) => {
      const remaining = state.tabs.filter((tab) => tab.dirty || tab.pinned)
      const closed = state.tabs.filter((tab) => !tab.dirty && !tab.pinned).map((tab) => tab.path)
      const activeTabPath =
        state.activeTabPath && remaining.some((tab) => tab.path === state.activeTabPath)
          ? state.activeTabPath
          : (remaining[0]?.path ?? null)
      return {
        tabs: remaining,
        activeTabPath,
        editorPanes: remaining[0]
          ? state.editorPanes
              .map((path) => (remaining.some((tab) => tab.path === path) ? path : remaining[0]!.path))
              .slice(0, Math.max(1, state.editorPanes.length))
          : [],
        focusedPane: remaining.length === 0 ? 0 : Math.min(state.focusedPane, Math.max(0, remaining.length - 1)),
        recentTabPaths: state.recentTabPaths.filter((item) => remaining.some((tab) => tab.path === item)),
        closedTabPaths: [...closed, ...state.closedTabPaths].slice(0, 30)
      }
    })
    schedulePersist(get)
    scheduleContextPush(get)
  },

  reopenClosedTab: async () => {
    const path = get().closedTabPaths[0]
    if (!path) return
    set((state) => ({ closedTabPaths: state.closedTabPaths.slice(1) }))
    await get().openFileByPath(path)
  },

  togglePinTab: (path) => {
    set((state) => ({
      tabs: sortTabs(state.tabs.map((tab) => (tab.path === path ? { ...tab, pinned: !tab.pinned } : tab)))
    }))
    schedulePersist(get)
  },

  moveTab: (fromPath, toPath) => {
    if (fromPath === toPath) return
    set((state) => {
      const tabs = [...state.tabs]
      const fromIndex = tabs.findIndex((tab) => tab.path === fromPath)
      const toIndex = tabs.findIndex((tab) => tab.path === toPath)
      if (fromIndex < 0 || toIndex < 0) return state
      const [moved] = tabs.splice(fromIndex, 1)
      tabs.splice(toIndex, 0, moved)
      return { tabs: sortTabs(tabs) }
    })
    schedulePersist(get)
  },

  activateTabByIndex: (index) => {
    const tab = get().tabs[index]
    if (tab) get().setActiveTab(tab.path)
  },

  cycleTab: (direction) => {
    const { tabs, activeTabPath } = get()
    if (tabs.length < 2) return
    const current = tabs.findIndex((tab) => tab.path === activeTabPath)
    const next = (current + direction + tabs.length) % tabs.length
    get().setActiveTab(tabs[next].path)
  },

  activateRecentTab: () => {
    const { recentTabPaths, tabs } = get()
    const target = recentTabPaths.slice(1).find((path) => tabs.some((tab) => tab.path === path))
    if (target) get().setActiveTab(target)
    else get().cycleTab(1)
  },

  updateTabContent: (path, content) => {
    const current = get().tabs.find((t) => t.path === path)
    if (current && current.content === content) return
    const dirty = !current || content !== current.originalContent
    set((state) => ({
      tabs: state.tabs.map((t) => (t.path === path ? { ...t, content, dirty } : t)),
      diffSession:
        state.diffSession?.path === path ? { ...state.diffSession, modified: content } : state.diffSession
    }))
    // Workspace persistence only stores tab paths, not content — skip on every keystroke.
    scheduleAutoSave(path, get)
    scheduleLanguageBuffer(path, content)
  },

  saveTab: async (path) => {
    const tab = get().tabs.find((t) => t.path === path)
    if (!tab || !tab.dirty) return
    if (useEditorSettingsStore.getState().formatOnSave && formatterFor(path)) {
      await get().formatTab(path)
    }
    const content = get().tabs.find((t) => t.path === path)?.content ?? tab.content
    const result = await window.electronAPI.codeEditor.writeFile(path, content)
    if (!result.success) {
      toast.error(result.error ?? 'Failed to save file')
      return
    }
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.path === path ? { ...t, originalContent: t.content, dirty: false } : t
      )
    }))
    schedulePersist(get)
    void useGitStore.getState().refresh()
  },

  saveActiveTab: async () => {
    const { activeTabPath, saveTab } = get()
    if (activeTabPath) await saveTab(activeTabPath)
  },

  saveAllTabs: async () => {
    const dirty = get().tabs.filter((tab) => tab.dirty)
    for (const tab of dirty) await get().saveTab(tab.path)
    if (dirty.length > 0) toast.success(`Saved ${dirty.length} file(s)`)
  },

  formatTab: async (path) => {
    const tab = get().tabs.find((t) => t.path === path)
    if (!tab || tab.loading) return false
    set({ formatting: true })
    try {
      const settings = useEditorSettingsStore.getState()
      const outcome = await formatSource(path, tab.content, settings, get().rootPath)
      if (outcome.unsupported) {
        toast.error(`No formatter available for ${tab.name}`)
        return false
      }
      if (outcome.error || outcome.formatted === undefined) {
        toast.error(outcome.error ?? 'Formatting failed')
        return false
      }
      if (outcome.formatted === tab.content) return true
      set((state) => ({
        tabs: state.tabs.map((t) =>
          t.path === path
            ? { ...t, content: outcome.formatted!, dirty: outcome.formatted !== t.originalContent }
            : t
        )
      }))
      return true
    } finally {
      set({ formatting: false })
    }
  },

  formatActiveTab: async () => {
    const { activeTabPath } = get()
    if (activeTabPath) await get().formatTab(activeTabPath)
  },

  loadGitBaseline: async (path) => {
    if (!useEditorSettingsStore.getState().gitGutter) return
    const api = window.electronAPI.git
    if (!api?.fileAtHead) return
    const result = await api.fileAtHead(path)
    set((state) => ({
      gitBaselines: { ...state.gitBaselines, [path]: result.success ? (result.data ?? null) : null }
    }))
  },

  revealPathInTree: async (path) => {
    const { rootPath } = get()
    if (!rootPath) return
    const normalizedRoot = rootPath.replace(/\\/g, '/')
    const normalized = path.replace(/\\/g, '/')
    const expanded = new Set(get().expandedPaths)
    const segments = normalized.slice(normalizedRoot.length + 1).split('/')
    let current = rootPath
    expanded.add(current)
    for (const segment of segments.slice(0, -1)) {
      current = `${current}/${segment}`
      expanded.add(current)
      if (!get().dirCache[current]?.loaded) await get().refreshDirectory(current)
    }
    set((state) => ({
      expandedPaths: expanded,
      revealInTreePath: path,
      revealInTreeNonce: state.revealInTreeNonce + 1
    }))
    schedulePersist(get)
  },

  createEntry: async (parentPath, name, kind) => {
    const result = await window.electronAPI.codeEditor.createEntry({ parentPath, name, kind })
    if (!result.success || !result.data) {
      toast.error(result.error ?? 'Failed to create entry')
      return
    }
    await get().refreshDirectory(parentPath)
    toast.success(`${kind === 'folder' ? 'Folder' : 'File'} created`)
    if (kind === 'file') {
      await get().openFile(result.data)
    } else {
      const expanded = new Set(get().expandedPaths)
      expanded.add(parentPath)
      set({ expandedPaths: expanded })
      schedulePersist(get)
    }
  },

  renameEntry: async (path, newName) => {
    const result = await window.electronAPI.codeEditor.renameEntry({ path, newName })
    if (!result.success || !result.data) {
      toast.error(result.error ?? 'Failed to rename entry')
      return
    }
    const newPath = result.data.path
    const parentPath = parentDirOf(path)

    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.path === path ? { ...t, path: newPath, name: fileNameOf(newPath) } : t
      ),
      activeTabPath: state.activeTabPath === path ? newPath : state.activeTabPath
    }))

    if (parentPath) await get().refreshDirectory(parentPath)
    schedulePersist(get)
    toast.success('Renamed')
  },

  deleteEntry: async (path) => {
    const result = await window.electronAPI.codeEditor.deleteEntry(path)
    if (!result.success) {
      toast.error(result.error ?? 'Failed to delete entry')
      return
    }
    const parentPath = parentDirOf(path)

    set((state) => {
      const tabs = state.tabs.filter(
        (t) => t.path !== path && !t.path.startsWith(path + '/') && !t.path.startsWith(path + '\\')
      )
      const activeTabPath =
        state.activeTabPath && tabs.some((t) => t.path === state.activeTabPath)
          ? state.activeTabPath
          : (tabs[0]?.path ?? null)
      const expandedPaths = new Set(state.expandedPaths)
      expandedPaths.delete(path)
      const dirCache = { ...state.dirCache }
      delete dirCache[path]
      return { tabs, activeTabPath, expandedPaths, dirCache }
    })

    if (parentPath) await get().refreshDirectory(parentPath)
    schedulePersist(get)
    toast.success('Deleted')
  },

  loadIgnoreRules: async () => {
    const result = await window.electronAPI.codeEditor.getIgnoreRules()
    if (result.success && result.data) {
      set({ ignoreRules: result.data, showIgnored: result.data.showIgnored })
    }
  },

  setShowIgnored: async (show) => {
    const result = await window.electronAPI.codeEditor.setIgnoreRules({ showIgnored: show })
    if (!result.success || !result.data) {
      toast.error(result.error ?? 'Failed to update ignore rules')
      return
    }
    set({ showIgnored: show, ignoreRules: result.data })
    await get().refreshOpenDirectories()
    schedulePersist(get)
  },

  setCustomIgnoreNames: async (names) => {
    const result = await window.electronAPI.codeEditor.setIgnoreRules({ customIgnoreNames: names })
    if (!result.success || !result.data) {
      toast.error(result.error ?? 'Failed to update ignore rules')
      return
    }
    set({ ignoreRules: result.data })
    await get().refreshOpenDirectories()
  },

  setFileSearchQuery: (query) => {
    set({ fileSearchQuery: query })
    if (!query.trim()) {
      set({ fileSearchHits: [] })
      return
    }
    if (searchTimer) clearTimeout(searchTimer)
    searchTimer = setTimeout(() => {
      void get().searchFiles(query)
    }, 180)
  },

  searchFiles: async (query) => {
    const result = await window.electronAPI.codeEditor.searchFiles(query)
    if (!result.success) {
      set({ fileSearchHits: [] })
      return
    }
    set({ fileSearchHits: result.data ?? [] })
  },

  updateEditorSelection: (selectedCode, cursor, selectionLineCount = 0) => {
    const state = get()
    const sameCursor =
      state.cursor?.line === cursor?.line &&
      state.cursor?.column === cursor?.column &&
      state.cursor?.offset === cursor?.offset
    if (
      state.selectedCode === selectedCode &&
      state.selectionLineCount === selectionLineCount &&
      sameCursor
    ) {
      return
    }
    set({ selectedCode, cursor, selectionLineCount })
    scheduleContextPush(get)
  },

  openFileAtLine: async (path, line, column, endLine) => {
    set({ pendingReveal: { path, line, column, endLine } })
    await get().openFileByPath(path)
  },

  goToLine: (line, column) => {
    const { activeTabPath } = get()
    if (activeTabPath) set({ pendingReveal: { path: activeTabPath, line, column } })
  },

  clearPendingReveal: () => set({ pendingReveal: null }),

  splitRight: (path) => {
    const { editorPanes, activeTabPath } = get()
    const source = path || activeTabPath
    if (!source) return
    if (editorPanes.length === 0) {
      set({ editorPanes: [source, source], focusedPane: 1, activeTabPath: source })
      return
    }
    if (editorPanes.length >= MAX_EDITOR_PANES) {
      const next = [...editorPanes]
      next[next.length - 1] = source
      set({ editorPanes: next, focusedPane: next.length - 1, activeTabPath: source })
      return
    }
    set({
      editorPanes: [...editorPanes, source],
      focusedPane: editorPanes.length,
      activeTabPath: source
    })
  },

  closePane: (index) => {
    const { editorPanes, focusedPane, activeTabPath } = get()
    if (editorPanes.length <= 1 || index < 0 || index >= editorPanes.length) return
    const next = editorPanes.filter((_, i) => i !== index)
    const nextFocus = Math.min(
      index === focusedPane ? 0 : focusedPane > index ? focusedPane - 1 : focusedPane,
      next.length - 1
    )
    set({
      editorPanes: next,
      focusedPane: nextFocus,
      activeTabPath: next[nextFocus] ?? activeTabPath
    })
  },

  focusPane: (index) => {
    const { editorPanes } = get()
    const path = editorPanes[index]
    if (!path) return
    set((state) => ({
      focusedPane: index,
      activeTabPath: path,
      recentTabPaths: touchRecent(state.recentTabPaths, path)
    }))
    scheduleContextPush(get)
  },

  toggleSplit: () => {
    const { editorPanes, activeTabPath, tabs, focusedPane } = get()
    if (!activeTabPath) return
    if (editorPanes.length >= MAX_EDITOR_PANES) {
      const keep = editorPanes[focusedPane] ?? activeTabPath
      set({ editorPanes: [keep], focusedPane: 0, activeTabPath: keep })
      return
    }
    const panes = editorPanes.length ? editorPanes : [activeTabPath]
    const other = tabs.find((tab) => !panes.includes(tab.path))?.path ?? activeTabPath
    set({ editorPanes: [...panes, other], focusedPane: panes.length, activeTabPath: other })
  },

  openDiff: async (path) => {
    const state = get()
    const tab = findOpenTab(state, path)
    const root = state.rootPath
    const normalized = path.replace(/\\/g, '/')
    const resolvedPath =
      tab?.path ??
      (root && !/^[a-zA-Z]:/.test(normalized) && !normalized.startsWith(root.replace(/\\/g, '/'))
        ? `${root.replace(/\\/g, '/')}/${normalized}`
        : path)
    let modified = tab?.content
    if (modified === undefined) {
      const read = await window.electronAPI.codeEditor.readFile(resolvedPath)
      // Deleted / missing working-tree files compare as empty against HEAD.
      modified = read.success && read.data !== undefined ? read.data : ''
    }
    const head = await window.electronAPI.git.fileAtHead(resolvedPath)
    const original = head.success ? (head.data ?? '') : ''
    set({
      diffSession: {
        path: resolvedPath,
        original,
        modified,
        title: fileNameOf(resolvedPath)
      }
    })
  },

  closeDiff: () => set({ diffSession: null }),


  reloadFileIfOpen: async (path) => {
    const tab = findOpenTab(get(), path)
    if (!tab || tab.dirty || tab.loading) return
    const result = await window.electronAPI.codeEditor.readFile(tab.path)
    if (!result.success || result.data === undefined) return
    set((state) => ({
      tabs: state.tabs.map((item) =>
        item.path === tab.path
          ? { ...item, content: result.data!, originalContent: result.data!, dirty: false }
          : item
      )
    }))
    void get().loadGitBaseline(tab.path)
  },

  applyAgentContent: (path, content) => {
    const tab = findOpenTab(get(), path)
    if (!tab) return
    set((state) => ({
      tabs: state.tabs.map((item) =>
        item.path === tab.path
          ? { ...item, content, originalContent: content, dirty: false }
          : item
      )
    }))
    void get().loadGitBaseline(tab.path)
  },

  importDroppedPaths: async (sourcePaths, destDir) => {
    const api = window.electronAPI.codeEditor
    if (!api.importPaths) return []
    const result = await api.importPaths(sourcePaths, destDir)
    if (!result.success || !result.data) {
      toast.error(result.error ?? 'Failed to import files')
      return []
    }
    await get().refreshDirectory(destDir)
    await get().refreshOpenDirectories()
    if (result.data.copied.length > 0) toast.success(`Imported ${result.data.copied.length} item(s)`)
    return result.data.copied
  },

  copyExplorerPaths: (paths) => {
    const unique = [...new Set(paths.filter(Boolean))]
    if (unique.length === 0) return
    set({ explorerClip: { mode: 'copy', paths: unique } })
    toast.success(unique.length === 1 ? 'Copied' : `Copied ${unique.length} items`)
  },

  cutExplorerPaths: (paths) => {
    const unique = [...new Set(paths.filter(Boolean))]
    if (unique.length === 0) return
    set({ explorerClip: { mode: 'cut', paths: unique } })
    toast.success(unique.length === 1 ? 'Cut' : `Cut ${unique.length} items`)
  },

  pasteExplorer: async (destDir) => {
    const clip = get().explorerClip
    if (!clip) return
    const api = window.electronAPI.codeEditor
    if (clip.mode === 'copy' && !api.copyEntry) {
      toast.error('Restart the app to enable copy/paste in the explorer')
      return
    }
    if (clip.mode === 'cut' && !api.moveEntry) {
      toast.error('Restart the app to enable cut/paste in the explorer')
      return
    }
    let done = 0
    for (const sourcePath of clip.paths) {
      const result =
        clip.mode === 'cut'
          ? await api.moveEntry({ sourcePath, destDir })
          : await api.copyEntry({ sourcePath, destDir })
      if (!result.success) {
        toast.error(result.error ?? 'Paste failed')
        continue
      }
      done += 1
    }
    if (clip.mode === 'cut') set({ explorerClip: null })
    await get().refreshDirectory(destDir)
    await get().refreshOpenDirectories()
    if (done > 0) toast.success(`Pasted ${done} item(s)`)
  },

  duplicateEntry: async (path) => {
    const destDir = parentDirOf(path)
    const api = window.electronAPI.codeEditor
    if (!api.copyEntry) {
      toast.error('Restart the app to enable duplicate')
      return
    }
    const result = await api.copyEntry({ sourcePath: path, destDir })
    if (!result.success || !result.data) {
      toast.error(result.error ?? 'Duplicate failed')
      return
    }
    await get().refreshDirectory(destDir)
    toast.success(`Duplicated as ${result.data.name}`)
  },

  moveDropped: async (sourcePath, destDir) => {
    const api = window.electronAPI.codeEditor
    if (!api.moveEntry) {
      toast.error('Restart the app to enable drag-to-move')
      return null
    }
    const result = await api.moveEntry({ sourcePath, destDir })
    if (!result.success || !result.data) {
      toast.error(result.error ?? 'Move failed')
      return null
    }
    await get().refreshOpenDirectories()
    toast.success(`Moved ${result.data.name}`)
    return result.data.path
  },

  revealInOs: async (path) => {
    const api = window.electronAPI.codeEditor
    if (!api.revealInOs) {
      toast.error('Restart the app to enable Reveal in Explorer')
      return
    }
    const result = await api.revealInOs(path)
    if (!result.success) toast.error(result.error ?? 'Could not reveal in OS')
  },

  replaceInFiles: async ({ query, replacement, regex, paths }) => {
    const unique = [...new Set(paths)]
    let files = 0
    let replacements = 0
    for (const path of unique) {
      const tab = get().tabs.find((item) => item.path === path)
      let content = tab?.content
      if (content == null) {
        const read = await window.electronAPI.codeEditor.readFile(path)
        if (!read.success || read.data == null) continue
        content = read.data
      }
      let next: string
      let count: number
      try {
        const applied = applyTextReplace(content, query, replacement, { regex })
        next = applied.next
        count = applied.count
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Invalid regular expression')
        return { files, replacements }
      }
      if (count === 0) continue
      if (tab) {
        get().updateTabContent(path, next)
        if (!tab.dirty) await get().saveTab(path)
      } else {
        const write = await window.electronAPI.codeEditor.writeFile(path, next)
        if (!write.success) continue
      }
      files += 1
      replacements += count
    }
    return { files, replacements }
  },

  pushEditorContext: () => {
    const state = get()
    const active = state.tabs.find((t) => t.path === state.activeTabPath)
    const diagnostics = useProblemsStore
      .getState()
      .items.slice(0, 40)
      .map((item) => ({
        file: item.file,
        line: item.line,
        column: item.column,
        code: item.code,
        message: item.message,
        severity: item.severity,
        source: item.source
      }))
    const snapshot: EditorContextSnapshot = {
      rootPath: state.rootPath,
      currentFile: state.activeTabPath,
      selectedCode: state.selectedCode,
      cursor: state.cursor,
      openTabs: state.tabs.map((t) => ({
        path: t.path,
        name: t.name,
        dirty: t.dirty,
        content: t.path === state.activeTabPath ? undefined : t.content.slice(0, 8_000)
      })),
      visibleContent: active?.content.slice(0, 80_000) ?? '',
      diagnostics
    }
    void window.electronAPI.codeEditor.setContext(snapshot)
  }
}))
