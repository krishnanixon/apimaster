import { indentWithTab, toggleComment } from '@codemirror/commands'
import { selectNextOccurrence } from '@codemirror/search'
import { Prec, type Extension } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { useCodeEditorStore } from '../stores/codeEditor.store'
import { useEditorSettingsStore } from '../stores/editorSettings.store'
import { useInlineEditStore } from '../stores/inlineEdit.store'
import { findReferences, goToDefinition, identifierAt } from './navigation'
import { acceptGhostText, dismissGhostText } from './ghost-text'
import { useDebugStore } from '../stores/debug.store'

function symbolAtCursor(view: EditorView): string | null {
  const sel = view.state.selection.main
  if (!sel.empty) {
    const selected = view.state.sliceDoc(sel.from, sel.to).trim()
    if (selected && !/\s/.test(selected)) return selected
  }
  return identifierAt(view.state.doc.toString(), sel.head)
}

/**
 * VS Code / Cursor navigation and edit bindings that sit on top of CodeMirror's defaults.
 * Ctrl/Cmd-click jumps to definition via the workspace symbol index.
 */
export function editorKeymap(): Extension {
  return [
    Prec.highest(
      keymap.of([
        {
          key: 'Tab',
          run: (view) => {
            const inline = useInlineEditStore.getState()
            if (inline.status === 'ready') return inline.accept()
            return acceptGhostText(view)
          }
        },
        {
          key: 'Escape',
          run: (view) => {
            if (dismissGhostText(view)) return true
            const inline = useInlineEditStore.getState()
            if (inline.status !== 'idle') return inline.reject()
            return false
          }
        },
        {
          key: 'Mod-Enter',
          run: () => {
            const inline = useInlineEditStore.getState()
            if (inline.status === 'ready' || inline.status === 'streaming') return inline.accept()
            return false
          }
        }
      ])
    ),
    Prec.high(
      keymap.of([
        indentWithTab,
        { key: 'Mod-/', run: toggleComment },
        { key: 'Mod-d', run: selectNextOccurrence },
        {
          key: 'Mod-k',
          run: () => {
            useInlineEditStore.getState().togglePrompt()
            return true
          }
        },
        {
          key: 'F12',
          run: (view) => {
            const path = useCodeEditorStore.getState().activeTabPath
            if (!path) return false
            const sel = view.state.selection.main
            const line = view.state.doc.lineAt(sel.head)
            const symbol = symbolAtCursor(view) ?? ''
            void goToDefinition(symbol, {
              path,
              line: line.number,
              column: sel.head - line.from + 1,
              content: view.state.doc.toString()
            })
            return true
          }
        },
        {
          key: 'Shift-F12',
          run: (view) => {
            const path = useCodeEditorStore.getState().activeTabPath
            if (!path) return false
            const sel = view.state.selection.main
            const line = view.state.doc.lineAt(sel.head)
            const symbol = symbolAtCursor(view) ?? ''
            void findReferences(symbol, {
              path,
              line: line.number,
              column: sel.head - line.from + 1,
              content: view.state.doc.toString()
            })
            return true
          }
        },
        {
          key: 'F9',
          run: (view) => {
            const path = useCodeEditorStore.getState().activeTabPath
            if (!path) return false
            const line = view.state.doc.lineAt(view.state.selection.main.head).number
            useDebugStore.getState().toggleBreakpoint(path, line)
            view.dispatch({})
            return true
          }
        },
        {
          key: 'Shift-Alt-f',
          run: () => {
            void useCodeEditorStore.getState().formatActiveTab()
            return true
          }
        },
        {
          key: 'Alt-z',
          run: () => {
            const settings = useEditorSettingsStore.getState()
            settings.set('wordWrap', settings.wordWrap === 'off' ? 'on' : 'off')
            return true
          }
        }
      ])
    ),
    EditorView.domEventHandlers({
      mousedown(event, view) {
        if (!(event.ctrlKey || event.metaKey) || event.button !== 0) return false
        const pos = view.posAtCoords({ x: event.clientX, y: event.clientY })
        if (pos == null) return false
        const symbol = identifierAt(view.state.doc.toString(), pos)
        if (!symbol) return false
        event.preventDefault()
        const path = useCodeEditorStore.getState().activeTabPath
        const line = view.state.doc.lineAt(pos)
        void goToDefinition(symbol, path ? {
          path,
          line: line.number,
          column: pos - line.from + 1,
          content: view.state.doc.toString()
        } : undefined)
        return true
      }
    })
  ]
}
