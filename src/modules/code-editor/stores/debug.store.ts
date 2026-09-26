import { create } from 'zustand'
import { toast } from 'sonner'
import type { DebugBreakpoint, DebugConsoleLine, DebugSnapshot } from '@shared/types/debug'
import { getDesktopApi } from '@/shared/lib/desktop-api'
import { useCodeEditorStore } from './codeEditor.store'
import { useWorkbenchLayoutStore } from './workbench.store'

const idleSnapshot: DebugSnapshot = {
  state: 'idle',
  scriptPath: null,
  frames: [],
  scopes: [],
  console: []
}

interface DebugState {
  snapshot: DebugSnapshot
  breakpoints: DebugBreakpoint[]
  expr: string
  lastResult: string | null
  toggleBreakpoint: (path: string, line: number) => void
  hasBreakpoint: (path: string, line: number) => boolean
  start: (scriptPath?: string) => Promise<void>
  stop: () => Promise<void>
  continue: () => Promise<void>
  pause: () => Promise<void>
  stepOver: () => Promise<void>
  stepInto: () => Promise<void>
  stepOut: () => Promise<void>
  evaluate: () => Promise<void>
  setExpr: (expr: string) => void
  subscribe: () => () => void
  reset: () => void
}

async function syncBreakpoints(breakpoints: DebugBreakpoint[]): Promise<void> {
  await getDesktopApi()?.debug?.setBreakpoints(breakpoints)
}

export const useDebugStore = create<DebugState>((set, get) => ({
  snapshot: idleSnapshot,
  breakpoints: [],
  expr: '',
  lastResult: null,

  hasBreakpoint: (path, line) =>
    get().breakpoints.some((bp) => bp.enabled && bp.path === path && bp.line === line),

  toggleBreakpoint: (path, line) => {
    const existing = get().breakpoints.find((bp) => bp.path === path && bp.line === line)
    const breakpoints = existing
      ? get().breakpoints.filter((bp) => !(bp.path === path && bp.line === line))
      : [...get().breakpoints, { path, line, enabled: true }]
    set({ breakpoints })
    void syncBreakpoints(breakpoints)
  },

  start: async (scriptPath) => {
    const editor = useCodeEditorStore.getState()
    const path = scriptPath ?? editor.activeTabPath
    if (!path) {
      toast.error('Open a JavaScript or TypeScript file to debug')
      return
    }
    const api = getDesktopApi()?.debug
    if (!api) return
    useWorkbenchLayoutStore.getState().setBottomTab('debug')
    await syncBreakpoints(get().breakpoints)
    const result = await api.start({ scriptPath: path })
    if (!result.success || !result.data) {
      toast.error(result.error ?? 'Failed to start debugger')
      return
    }
    set({ snapshot: result.data })
  },

  stop: async () => {
    const result = await getDesktopApi()?.debug?.stop()
    if (result?.success && result.data) set({ snapshot: result.data })
    else set({ snapshot: idleSnapshot })
  },

  continue: async () => {
    await getDesktopApi()?.debug?.continue()
  },
  pause: async () => {
    await getDesktopApi()?.debug?.pause()
  },
  stepOver: async () => {
    await getDesktopApi()?.debug?.stepOver()
  },
  stepInto: async () => {
    await getDesktopApi()?.debug?.stepInto()
  },
  stepOut: async () => {
    await getDesktopApi()?.debug?.stepOut()
  },

  setExpr: (expr) => set({ expr }),

  evaluate: async () => {
    const expr = get().expr.trim()
    if (!expr) return
    const result = await getDesktopApi()?.debug?.evaluate(expr)
    if (!result?.success) {
      toast.error(result?.error ?? 'Evaluate failed')
      return
    }
    const line: DebugConsoleLine = { level: 'log', text: `> ${expr}\n${result.data ?? ''}` }
    set((state) => ({
      lastResult: result.data ?? '',
      snapshot: { ...state.snapshot, console: [...state.snapshot.console, line].slice(-200) }
    }))
  },

  subscribe: () => {
    const api = getDesktopApi()?.debug
    if (!api?.onEvent) return () => undefined
    return api.onEvent((event) => {
      if (event.type === 'console') {
        set((state) => ({
          snapshot: { ...state.snapshot, console: [...state.snapshot.console, event.line].slice(-200) }
        }))
        return
      }
      set({ snapshot: event.snapshot })
      const frame = event.snapshot.frames[0]
      if (event.type === 'paused' && frame?.path && frame.line) {
        void useCodeEditorStore.getState().openFileAtLine(frame.path, frame.line, frame.column)
      }
    })
  },

  reset: () => set({ snapshot: idleSnapshot, lastResult: null })
}))
