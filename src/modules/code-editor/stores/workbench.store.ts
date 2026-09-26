import { create } from 'zustand'

export type EditorLeftTab = 'files' | 'git' | 'search' | 'problems' | 'outline' | 'seo' | 'ai'
export type EditorBottomTab = 'terminal' | 'problems' | 'changes' | 'debug'
/** Which flavour of Quick Open is showing: files, commands, symbols, or go-to-line. */
export type QuickOpenMode = 'files' | 'commands' | 'fileSymbols' | 'workspaceSymbols' | 'line'

interface WorkbenchLayoutState {
  agentOpen: boolean
  leftTab: EditorLeftTab
  bottomTab: EditorBottomTab | null
  sidebarOpen: boolean
  agentFocusNonce: number
  quickOpen: QuickOpenMode | null
  settingsOpen: boolean
  inlineEditOpen: boolean
  setAgentOpen: (open: boolean) => void
  toggleAgent: () => void
  setLeftTab: (tab: EditorLeftTab) => void
  setBottomTab: (tab: EditorBottomTab | null) => void
  setSidebarOpen: (open: boolean) => void
  toggleSidebar: () => void
  openAgent: () => void
  openProblems: () => void
  openChanges: () => void
  openDebug: () => void
  openQuickOpen: (mode: QuickOpenMode) => void
  closeQuickOpen: () => void
  setSettingsOpen: (open: boolean) => void
  openInlineEdit: () => void
  closeInlineEdit: () => void
  toggleInlineEdit: () => void
}

export const useWorkbenchLayoutStore = create<WorkbenchLayoutState>((set, get) => ({
  agentOpen: false,
  leftTab: 'files',
  bottomTab: null,
  sidebarOpen: true,
  agentFocusNonce: 0,
  quickOpen: null,
  settingsOpen: false,
  inlineEditOpen: false,

  setAgentOpen: (open) => set({ agentOpen: open }),
  toggleAgent: () => set({ agentOpen: !get().agentOpen }),
  setLeftTab: (tab) => set({ leftTab: tab, sidebarOpen: true }),
  setBottomTab: (tab) => set({ bottomTab: tab }),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  toggleSidebar: () => set({ sidebarOpen: !get().sidebarOpen }),
  openAgent: () => set((state) => ({ agentOpen: true, agentFocusNonce: state.agentFocusNonce + 1 })),
  openProblems: () => set({ leftTab: 'problems', bottomTab: 'problems', sidebarOpen: true }),
  openChanges: () => set({ bottomTab: 'changes', agentOpen: true }),
  openDebug: () => set({ bottomTab: 'debug' }),
  openQuickOpen: (mode) => set({ quickOpen: mode }),
  closeQuickOpen: () => set({ quickOpen: null }),
  setSettingsOpen: (open) => set({ settingsOpen: open }),
  openInlineEdit: () => set({ inlineEditOpen: true }),
  closeInlineEdit: () => set({ inlineEditOpen: false }),
  toggleInlineEdit: () => set((state) => ({ inlineEditOpen: !state.inlineEditOpen }))
}))
