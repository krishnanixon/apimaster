import { create } from 'zustand'
import type { Terminal } from '@xterm/xterm'
import { v4 as uuidv4 } from 'uuid'
import { toast } from 'sonner'
import {
  MAX_RECENT_TERMINAL_FOLDERS,
  type PersistedTerminalGroup
} from '@shared/types/terminal'

export interface TerminalTab {
  id: string
  title: string
  cwd: string
  alive: boolean
  groupId: string
}

export interface RecentFolder {
  path: string
  name: string
}

interface TerminalState {
  tabs: TerminalTab[]
  activeTabId: string | null
  panelOpen: boolean
  booting: boolean
  listenersBound: boolean
  xtermMap: Map<string, Terminal>
  outputBuffer: Map<string, string[]>

  workspaceCwd: string | null
  workspaceName: string | null
  recentFolders: RecentFolder[]
  stateLoaded: boolean
  restoring: boolean
  autoStartAllowed: boolean
  isPickingFolder: boolean

  bindListeners: () => void
  registerXterm: (id: string, terminal: Terminal, fit: () => void) => void
  unregisterXterm: (id: string) => void
  resolveDefaultCwd: () => Promise<string>
  loadWorkspaceState: () => Promise<void>
  restoreSavedSessions: () => Promise<void>
  allowAutoStart: () => void
  persistWorkspaceState: () => Promise<void>
  pickFolder: () => Promise<string | null>
  selectFolder: (path: string, openNewTerminal?: boolean) => Promise<boolean>
  removeRecentFolder: (path: string) => void
  addRecentFolder: (path: string, name?: string) => void
  openTerminal: (
    cwd: string,
    title?: string,
    cols?: number,
    rows?: number,
    groupId?: string
  ) => Promise<string>
  splitTerminal: () => Promise<string | null>
  restoreTerminals: (cwds: string[], activeIndex: number) => Promise<void>
  restoreTerminalLayout: (groups: PersistedTerminalGroup[], activeGroupIndex: number) => Promise<void>
  closeTerminal: (id: string) => void
  closeTerminalGroup: (groupId: string) => void
  setActiveTab: (id: string) => void
  focusNextPane: (direction: 1 | -1) => void
  togglePanel: (open?: boolean) => void
  runCommand: (id: string, command: string) => Promise<void>
  stopCommand: (id: string) => void
  clearActiveTerminal: () => void
  disposeAll: () => void
  getPersistedCwds: () => string[]
  getPersistedGroups: () => PersistedTerminalGroup[]
}

function shortCwd(cwd: string): string {
  const parts = cwd.split(/[\\/]/).filter(Boolean)
  return parts[parts.length - 1] || cwd
}

function folderNameOf(path: string): string {
  return shortCwd(path)
}

function groupTabs(tabs: TerminalTab[]): TerminalTab[][] {
  const groups = new Map<string, TerminalTab[]>()
  for (const tab of tabs) {
    const group = groups.get(tab.groupId) ?? []
    group.push(tab)
    groups.set(tab.groupId, group)
  }
  return [...groups.values()]
}

let persistTimer: ReturnType<typeof setTimeout> | null = null

function schedulePersist(get: () => TerminalState): void {
  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = setTimeout(() => {
    void get().persistWorkspaceState()
  }, 400)
}

export const useTerminalStore = create<TerminalState>((set, get) => ({
  tabs: [],
  activeTabId: null,
  panelOpen: false,
  booting: false,
  listenersBound: false,
  xtermMap: new Map(),
  outputBuffer: new Map(),

  workspaceCwd: null,
  workspaceName: null,
  recentFolders: [],
  stateLoaded: false,
  restoring: false,
  autoStartAllowed: false,
  isPickingFolder: false,

  bindListeners: () => {
    if (get().listenersBound) return
    set({ listenersBound: true })

    window.electronAPI.terminal.onData(({ id, chunk }) => {
      const terminal = get().xtermMap.get(id)
      if (terminal) {
        terminal.write(chunk)
        return
      }
      const buffer = get().outputBuffer.get(id) ?? []
      buffer.push(chunk)
      get().outputBuffer.set(id, buffer)
    })

    window.electronAPI.terminal.onExit(({ id }) => {
      set((state) => ({
        tabs: state.tabs.map((t) => (t.id === id ? { ...t, alive: false } : t))
      }))
    })
  },

  registerXterm: (id, terminal, fit) => {
    get().xtermMap.set(id, terminal)
    const buffered = get().outputBuffer.get(id)
    if (buffered?.length) {
      for (const chunk of buffered) terminal.write(chunk)
      get().outputBuffer.delete(id)
    }
    fit()
  },

  unregisterXterm: (id) => {
    get().xtermMap.delete(id)
    get().outputBuffer.delete(id)
  },

  resolveDefaultCwd: async () => {
    const { workspaceCwd } = get()
    if (workspaceCwd) return workspaceCwd
    try {
      return await window.electronAPI.app.getPath('home')
    } catch {
      return ''
    }
  },

  loadWorkspaceState: async () => {
    if (get().stateLoaded) return
    const result = await window.electronAPI.terminal.getWorkspaceState()
    if (!result.success || !result.data) {
      set({ stateLoaded: true })
      return
    }

    const saved = result.data
    const recentFolders: RecentFolder[] = []
    for (const path of saved.recentFolderPaths) {
      const valid = await window.electronAPI.terminal.openFolderPath(path)
      if (valid.success && valid.data) {
        recentFolders.push({ path: valid.data.rootPath, name: valid.data.rootName })
      }
    }

    let workspaceCwd = saved.lastCwd
    let workspaceName: string | null = null
    if (workspaceCwd) {
      const valid = await window.electronAPI.terminal.openFolderPath(workspaceCwd)
      if (valid.success && valid.data) {
        workspaceCwd = valid.data.rootPath
        workspaceName = valid.data.rootName
      } else {
        workspaceCwd = recentFolders[0]?.path ?? null
        workspaceName = recentFolders[0]?.name ?? null
      }
    } else if (recentFolders[0]) {
      workspaceCwd = recentFolders[0].path
      workspaceName = recentFolders[0].name
    }

    set({ recentFolders, workspaceCwd, workspaceName, stateLoaded: true })
  },

  restoreSavedSessions: async () => {
    set({ restoring: true })
    try {
      const result = await window.electronAPI.terminal.getWorkspaceState()
      if (!result.success || !result.data) return

      const saved = result.data
      const { workspaceCwd } = get()

      if (saved.terminalGroups.length > 0) {
        await get().restoreTerminalLayout(saved.terminalGroups, saved.activeTerminalGroupIndex)
      } else if (saved.terminalCwds.length > 0) {
        await get().restoreTerminals(saved.terminalCwds, saved.activeTerminalIndex)
      } else if (workspaceCwd) {
        await get().openTerminal(workspaceCwd)
      }
    } finally {
      set({ restoring: false, autoStartAllowed: true })
    }
  },

  allowAutoStart: () => set({ autoStartAllowed: true }),

  persistWorkspaceState: async () => {
    const { workspaceCwd, recentFolders, tabs, activeTabId } = get()
    const groups = groupTabs(tabs)
    const activeTab = tabs.find((tab) => tab.id === activeTabId)
    await window.electronAPI.terminal.saveWorkspaceState({
      lastCwd: workspaceCwd,
      recentFolderPaths: recentFolders.map((f) => f.path),
      terminalCwds: tabs.map((t) => t.cwd),
      activeTerminalIndex: Math.max(0, tabs.findIndex((t) => t.id === activeTabId)),
      terminalGroups: groups.map((group) => ({
        cwds: group.map((tab) => tab.cwd),
        activeIndex: Math.max(0, group.findIndex((tab) => tab.id === activeTabId))
      })),
      activeTerminalGroupIndex: Math.max(
        0,
        groups.findIndex((group) => group[0]?.groupId === activeTab?.groupId)
      )
    })
  },

  addRecentFolder: (path, name) => {
    const folderName = name ?? folderNameOf(path)
    set((state) => {
      const filtered = state.recentFolders.filter((f) => f.path !== path)
      const recentFolders = [{ path, name: folderName }, ...filtered].slice(
        0,
        MAX_RECENT_TERMINAL_FOLDERS
      )
      return { recentFolders }
    })
    schedulePersist(get)
  },

  removeRecentFolder: (path) => {
    set((state) => ({
      recentFolders: state.recentFolders.filter((f) => f.path !== path),
      workspaceCwd: state.workspaceCwd === path ? (state.recentFolders.find((f) => f.path !== path)?.path ?? null) : state.workspaceCwd,
      workspaceName:
        state.workspaceCwd === path
          ? (state.recentFolders.find((f) => f.path !== path)?.name ?? null)
          : state.workspaceName
    }))
    schedulePersist(get)
  },

  pickFolder: async () => {
    set({ isPickingFolder: true })
    try {
      const result = await window.electronAPI.terminal.pickFolder()
      if (!result.success) {
        toast.error(result.error ?? 'Failed to pick folder')
        return null
      }
      if (!result.data) return null
      await get().selectFolder(result.data.rootPath, true)
      return result.data.rootPath
    } finally {
      set({ isPickingFolder: false })
    }
  },

  selectFolder: async (path, openNewTerminal = false) => {
    const result = await window.electronAPI.terminal.openFolderPath(path)
    if (!result.success || !result.data) {
      toast.error('Folder no longer exists')
      get().removeRecentFolder(path)
      return false
    }

    const { rootPath, rootName } = result.data
    get().addRecentFolder(rootPath, rootName)
    set({ workspaceCwd: rootPath, workspaceName: rootName })
    schedulePersist(get)

    if (openNewTerminal) {
      await get().openTerminal(rootPath, rootName)
    }
    return true
  },

  openTerminal: async (cwd, title, cols = 80, rows = 24, groupId) => {
    const id = uuidv4()
    const tab: TerminalTab = {
      id,
      title: title ?? shortCwd(cwd),
      cwd,
      alive: true,
      groupId: groupId ?? id
    }
    set((state) => ({
      tabs: [...state.tabs, tab],
      activeTabId: id,
      panelOpen: true,
      booting: true
    }))
    schedulePersist(get)
    try {
      const res = await window.electronAPI.terminal.create(id, cwd, cols, rows)
      if (!res.success) {
        toast.error(res.error ?? 'Failed to start terminal')
        set((state) => ({
          tabs: state.tabs.filter((t) => t.id !== id),
          activeTabId:
            state.activeTabId === id
              ? (state.tabs.find((t) => t.id !== id)?.id ?? null)
              : state.activeTabId
        }))
        get().outputBuffer.delete(id)
        schedulePersist(get)
        return id
      }
      return id
    } finally {
      set({ booting: false })
    }
  },

  splitTerminal: async () => {
    const { tabs, activeTabId } = get()
    const active = tabs.find((tab) => tab.id === activeTabId)
    if (!active) {
      const cwd = await get().resolveDefaultCwd()
      return cwd ? get().openTerminal(cwd) : null
    }
    const panes = tabs.filter((tab) => tab.groupId === active.groupId)
    if (panes.length >= 4) {
      toast.message('A terminal group can contain up to four panes')
      return null
    }
    return get().openTerminal(active.cwd, active.title, 80, 24, active.groupId)
  },

  restoreTerminals: async (cwds, activeIndex) => {
    if (cwds.length === 0) return
    const ids: string[] = []
    for (const cwd of cwds) {
      const valid = await window.electronAPI.terminal.openFolderPath(cwd)
      const target = valid.success && valid.data ? valid.data.rootPath : cwd
      const id = await get().openTerminal(target)
      ids.push(id)
    }
    const activeId = ids[Math.min(activeIndex, ids.length - 1)]
    if (activeId) set({ activeTabId: activeId, panelOpen: true })
  },

  restoreTerminalLayout: async (groups, activeGroupIndex) => {
    if (groups.length === 0) return
    const restoredGroups: string[][] = []
    for (const savedGroup of groups.slice(0, 20)) {
      const groupId = uuidv4()
      const ids: string[] = []
      for (const cwd of savedGroup.cwds.slice(0, 4)) {
        const valid = await window.electronAPI.terminal.openFolderPath(cwd)
        const target = valid.success && valid.data ? valid.data.rootPath : cwd
        ids.push(await get().openTerminal(target, undefined, 80, 24, groupId))
      }
      if (ids.length > 0) {
        const activeIndex = Math.min(Math.max(savedGroup.activeIndex, 0), ids.length - 1)
        const activeId = ids[activeIndex]
        if (activeId) {
          ids.splice(activeIndex, 1)
          ids.push(activeId)
        }
        restoredGroups.push(ids)
      }
    }
    const group = restoredGroups[Math.min(Math.max(activeGroupIndex, 0), restoredGroups.length - 1)]
    const activeId = group?.at(-1)
    if (activeId) set({ activeTabId: activeId, panelOpen: true })
  },

  closeTerminal: (id) => {
    void window.electronAPI.terminal.dispose(id)
    get().xtermMap.delete(id)
    get().outputBuffer.delete(id)
    set((state) => {
      const closing = state.tabs.find((tab) => tab.id === id)
      const tabs = state.tabs.filter((t) => t.id !== id)
      const activeTabId =
        state.activeTabId === id
          ? (tabs.find((tab) => tab.groupId === closing?.groupId)?.id ?? tabs[tabs.length - 1]?.id ?? null)
          : state.activeTabId
      return { tabs, activeTabId }
    })
    schedulePersist(get)
  },

  closeTerminalGroup: (groupId) => {
    const closing = get().tabs.filter((tab) => tab.groupId === groupId)
    for (const tab of closing) {
      void window.electronAPI.terminal.dispose(tab.id)
      get().xtermMap.delete(tab.id)
      get().outputBuffer.delete(tab.id)
    }
    set((state) => {
      const tabs = state.tabs.filter((tab) => tab.groupId !== groupId)
      const activeTabId =
        state.tabs.find((tab) => tab.id === state.activeTabId)?.groupId === groupId
          ? (tabs.at(-1)?.id ?? null)
          : state.activeTabId
      return { tabs, activeTabId }
    })
    schedulePersist(get)
  },

  setActiveTab: (id) => {
    if (!get().tabs.some((tab) => tab.id === id)) return
    set({ activeTabId: id })
    schedulePersist(get)
  },

  focusNextPane: (direction) => {
    const { tabs, activeTabId } = get()
    const active = tabs.find((tab) => tab.id === activeTabId)
    if (!active) return
    const panes = tabs.filter((tab) => tab.groupId === active.groupId)
    if (panes.length < 2) return
    const current = panes.findIndex((tab) => tab.id === activeTabId)
    const next = panes[(current + direction + panes.length) % panes.length]
    if (next) get().setActiveTab(next.id)
  },

  togglePanel: (open) => set((state) => ({ panelOpen: open ?? !state.panelOpen })),

  runCommand: async (id, command) => {
    await window.electronAPI.terminal.run(id, command)
  },

  stopCommand: (id) => {
    void window.electronAPI.terminal.stop(id)
  },

  clearActiveTerminal: () => {
    const { activeTabId, xtermMap } = get()
    if (!activeTabId) return
    xtermMap.get(activeTabId)?.clear()
  },

  disposeAll: () => {
    for (const tab of get().tabs) void window.electronAPI.terminal.dispose(tab.id)
    get().xtermMap.clear()
    get().outputBuffer.clear()
    set({ tabs: [], activeTabId: null, booting: false })
  },

  getPersistedCwds: () => get().tabs.map((t) => t.cwd),

  getPersistedGroups: () =>
    groupTabs(get().tabs).map((group) => ({
      cwds: group.map((tab) => tab.cwd),
      activeIndex: Math.max(0, group.findIndex((tab) => tab.id === get().activeTabId))
    }))
}))
