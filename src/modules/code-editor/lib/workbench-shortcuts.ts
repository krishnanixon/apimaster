import { useEffect } from 'react'
import { useCodeEditorStore } from '../stores/codeEditor.store'
import { useEditorSettingsStore } from '../stores/editorSettings.store'
import { useGitStore } from '../stores/git.store'
import { useWorkbenchLayoutStore } from '../stores/workbench.store'
import { findReferencesAtCursor, goToDefinitionAtCursor } from './navigation'
import { toggleWorkbenchTerminal } from './terminal-workbench'

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

function chord(event: KeyboardEvent): { mod: boolean; shift: boolean; alt: boolean; key: string } {
  return {
    mod: event.ctrlKey || event.metaKey,
    shift: event.shiftKey,
    alt: event.altKey,
    key: event.key.length === 1 ? event.key.toLowerCase() : event.key
  }
}

/**
 * Workbench-level keybindings matching VS Code / Cursor.
 * Editor-scoped bindings (find, comment, go-to-definition) live in `editor-keymap.ts`.
 */
export function useWorkbenchShortcuts(): void {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const layout = useWorkbenchLayoutStore.getState()
      if (layout.quickOpen || layout.settingsOpen) return
      if (event.defaultPrevented) return

      const { mod, shift, alt, key } = chord(event)
      const editor = useCodeEditorStore.getState()
      const settings = useEditorSettingsStore.getState()
      const typing = isEditableTarget(event.target)

      const run = (action: () => void) => {
        event.preventDefault()
        action()
      }

      if (mod && !alt && key === 'p') {
        run(() => layout.openQuickOpen(shift ? 'commands' : 'files'))
        return
      }
      if (mod && !shift && !alt && key === 'g') {
        run(() => layout.openQuickOpen('line'))
        return
      }
      if (mod && !shift && !alt && key === 't') {
        run(() => layout.openQuickOpen('workspaceSymbols'))
        return
      }
      if (mod && shift && !alt && key === 'o') {
        run(() => layout.openQuickOpen('fileSymbols'))
        return
      }
      if (mod && !shift && !alt && key === 'b') {
        run(() => layout.toggleSidebar())
        return
      }
      if (mod && !shift && !alt && key === 'j') {
        run(() => void toggleWorkbenchTerminal())
        return
      }
      if (mod && !shift && !alt && key === 's') {
        run(() => void editor.saveActiveTab())
        return
      }
      if (mod && shift && !alt && key === 's') {
        run(() => void editor.saveAllTabs())
        return
      }
      if (mod && !shift && !alt && (key === 'w' || key === 'F4')) {
        if (!editor.activeTabPath) return
        run(() => editor.closeTab(editor.activeTabPath!))
        return
      }
      if (mod && shift && !alt && key === 't') {
        run(() => void editor.reopenClosedTab())
        return
      }
      if (mod && !shift && !alt && key === '\\') {
        run(() => editor.toggleSplit())
        return
      }
      if (!mod && !alt && key === 'F5') {
        run(() => {
          void import('../stores/debug.store').then(({ useDebugStore }) => {
            if (shift) void useDebugStore.getState().stop()
            else void useDebugStore.getState().start()
          })
        })
        return
      }
      if (!mod && !shift && !alt && key === 'F10') {
        run(() => {
          void import('../stores/debug.store').then(({ useDebugStore }) => useDebugStore.getState().stepOver())
        })
        return
      }
      if (!mod && !shift && !alt && key === 'F11') {
        run(() => {
          void import('../stores/debug.store').then(({ useDebugStore }) => useDebugStore.getState().stepInto())
        })
        return
      }
      if (!mod && shift && !alt && key === 'F11') {
        run(() => {
          void import('../stores/debug.store').then(({ useDebugStore }) => useDebugStore.getState().stepOut())
        })
        return
      }
      if (mod && !shift && !alt && key === 'k') {
        run(() => {
          void import('../stores/inlineEdit.store').then(({ useInlineEditStore }) => {
            useInlineEditStore.getState().togglePrompt()
          })
        })
        return
      }
      if (mod && !shift && !alt && key === 'l') {
        run(() => {
          const composerFocused = Boolean(
            document.activeElement?.closest?.('[data-agent-composer]')
          )
          if (layout.agentOpen && composerFocused && !useCodeEditorStore.getState().selectedCode.trim()) {
            layout.setAgentOpen(false)
            return
          }
          layout.openAgent()
        })
        return
      }
      if (mod && !alt && (key === '`' || key === 'Backquote')) {
        run(() => void toggleWorkbenchTerminal())
        return
      }
      if (mod && shift && !alt && key === 'e') {
        run(() => layout.setLeftTab('files'))
        return
      }
      if (mod && shift && !alt && key === 'f') {
        run(() => layout.setLeftTab('search'))
        return
      }
      if (mod && shift && !alt && key === 'g') {
        run(() => {
          layout.setLeftTab('git')
          void useGitStore.getState().refresh()
        })
        return
      }
      if (mod && shift && !alt && key === 'm') {
        run(() => layout.openProblems())
        return
      }
      if (mod && !shift && !alt && (key === '=' || key === '+' || key === 'Equal')) {
        run(() => settings.zoomIn())
        return
      }
      if (mod && !shift && !alt && (key === '-' || key === 'Minus')) {
        run(() => settings.zoomOut())
        return
      }
      if (mod && !shift && !alt && key === '0') {
        if (typing) return
        run(() => settings.resetZoom())
        return
      }
      if (mod && !alt && key === 'Tab') {
        run(() => (shift ? editor.cycleTab(-1) : editor.activateRecentTab()))
        return
      }
      if (mod && !shift && !alt && key === 'PageDown') {
        run(() => editor.cycleTab(1))
        return
      }
      if (mod && !shift && !alt && key === 'PageUp') {
        run(() => editor.cycleTab(-1))
        return
      }
      if (mod && !shift && !alt && /^[1-9]$/.test(key)) {
        run(() => editor.activateTabByIndex(Number(key) - 1))
        return
      }
      if (!mod && !shift && !alt && key === 'F12') {
        run(() => void goToDefinitionAtCursor())
        return
      }
      if (!mod && shift && !alt && key === 'F12') {
        run(() => void findReferencesAtCursor())
        return
      }
      if (!mod && alt && !shift && key === 'z') {
        run(() => settings.set('wordWrap', settings.wordWrap === 'off' ? 'on' : 'off'))
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])
}
