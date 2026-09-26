import { afterEach, describe, expect, it } from 'vitest'

const values = new Map<string, string>()
Object.defineProperty(globalThis, 'window', { configurable: true, value: globalThis })
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
    key: (index: number) => [...values.keys()][index] ?? null,
    get length() {
      return values.size
    }
  }
})

const { DEFAULT_EDITOR_SETTINGS, useEditorSettingsStore } = await import(
  '../src/modules/code-editor/stores/editorSettings.store'
)

describe('editor settings', () => {
  afterEach(() => useEditorSettingsStore.getState().resetAll())

  it('provides compact editor behavior defaults', () => {
    const settings = useEditorSettingsStore.getState()
    expect(settings.cursorStyle).toBe('line')
    expect(settings.cursorBlink).toBe(true)
    expect(settings.fontLigatures).toBe(true)
    expect(settings.hoverDocumentation).toBe(true)
    expect(settings.breakpointGutter).toBe(true)
  })

  it('resets only the selected settings section', () => {
    const settings = useEditorSettingsStore.getState()
    settings.set('fontSize', 20)
    settings.set('cursorStyle', 'block')

    useEditorSettingsStore.getState().reset(['fontSize'])

    expect(useEditorSettingsStore.getState().fontSize).toBe(DEFAULT_EDITOR_SETTINGS.fontSize)
    expect(useEditorSettingsStore.getState().cursorStyle).toBe('block')
  })
})
