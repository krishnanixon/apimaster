import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type AutoSaveMode = 'off' | 'afterDelay' | 'onFocusChange'
export type WordWrapMode = 'off' | 'on' | 'bounded'
export type RenderWhitespace = 'none' | 'selection' | 'all'
export type EditorCursorStyle = 'line' | 'block' | 'underline'

export interface EditorSettings {
  fontSize: number
  fontFamily: string
  fontLigatures: boolean
  lineHeight: number
  tabSize: number
  insertSpaces: boolean
  wordWrap: WordWrapMode
  wordWrapColumn: number
  lineNumbers: boolean
  minimap: boolean
  indentGuides: boolean
  highlightActiveLine: boolean
  highlightSelectionMatches: boolean
  bracketMatching: boolean
  closeBrackets: boolean
  autocomplete: boolean
  foldGutter: boolean
  renderWhitespace: RenderWhitespace
  cursorStyle: EditorCursorStyle
  cursorBlink: boolean
  smoothScrolling: boolean
  scrollPastEnd: boolean
  showDiagnostics: boolean
  gitGutter: boolean
  stickyBreadcrumbs: boolean
  autoSave: AutoSaveMode
  autoSaveDelayMs: number
  formatOnSave: boolean
  aiTabCompletions: boolean
  aiNextEditPrediction: boolean
  hoverDocumentation: boolean
  breakpointGutter: boolean
}

export const DEFAULT_EDITOR_SETTINGS: EditorSettings = {
  fontSize: 13,
  fontFamily: "'JetBrains Mono', 'Fira Code', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  fontLigatures: true,
  lineHeight: 1.45,
  tabSize: 2,
  insertSpaces: true,
  wordWrap: 'off',
  wordWrapColumn: 100,
  lineNumbers: true,
  minimap: false,
  indentGuides: true,
  highlightActiveLine: true,
  highlightSelectionMatches: true,
  bracketMatching: true,
  closeBrackets: true,
  autocomplete: true,
  foldGutter: true,
  renderWhitespace: 'selection',
  cursorStyle: 'line',
  cursorBlink: true,
  smoothScrolling: true,
  scrollPastEnd: true,
  showDiagnostics: true,
  gitGutter: true,
  stickyBreadcrumbs: true,
  autoSave: 'off',
  autoSaveDelayMs: 1000,
  formatOnSave: false,
  aiTabCompletions: true,
  aiNextEditPrediction: true,
  hoverDocumentation: true,
  breakpointGutter: true
}

const MIN_FONT_SIZE = 8
const MAX_FONT_SIZE = 32

interface EditorSettingsState extends EditorSettings {
  set: <K extends keyof EditorSettings>(key: K, value: EditorSettings[K]) => void
  toggle: (key: KeyOfType<EditorSettings, boolean>) => void
  zoomIn: () => void
  zoomOut: () => void
  resetZoom: () => void
  reset: (keys: Array<keyof EditorSettings>) => void
  resetAll: () => void
}

type KeyOfType<T, V> = { [K in keyof T]-?: T[K] extends V ? K : never }[keyof T]

export const useEditorSettingsStore = create<EditorSettingsState>()(
  persist(
    (set, get) => ({
      ...DEFAULT_EDITOR_SETTINGS,

      set: (key, value) => set({ [key]: value } as Partial<EditorSettings>),

      toggle: (key) => set({ [key]: !get()[key] } as Partial<EditorSettings>),

      zoomIn: () => set({ fontSize: Math.min(MAX_FONT_SIZE, get().fontSize + 1) }),
      zoomOut: () => set({ fontSize: Math.max(MIN_FONT_SIZE, get().fontSize - 1) }),
      resetZoom: () => set({ fontSize: DEFAULT_EDITOR_SETTINGS.fontSize }),
      reset: (keys) =>
        set(
          Object.fromEntries(keys.map((key) => [key, DEFAULT_EDITOR_SETTINGS[key]])) as Partial<EditorSettings>
        ),
      resetAll: () => set({ ...DEFAULT_EDITOR_SETTINGS })
    }),
    {
      name: 'workbench-editor-settings',
      version: 1
    }
  )
)

/** Reads settings without subscribing — for use inside CodeMirror extensions. */
export function editorSettings(): EditorSettings {
  return useEditorSettingsStore.getState()
}
