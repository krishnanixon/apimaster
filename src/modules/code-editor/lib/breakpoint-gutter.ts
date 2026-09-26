import { StateEffect, StateField, type Extension } from '@codemirror/state'
import { EditorView, gutter, GutterMarker } from '@codemirror/view'
import { useDebugStore } from '../stores/debug.store'
import { isJsPath } from './language-files'

class BreakpointMarker extends GutterMarker {
  toDOM(): HTMLElement {
    const el = document.createElement('div')
    el.className = 'cm-breakpoint-marker'
    el.title = 'Breakpoint'
    return el
  }
}

const breakpointMarker = new BreakpointMarker()

export const setDebugLine = StateEffect.define<number | null>()

const debugLineField = StateField.define<number | null>({
  create: () => null,
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setDebugLine)) return effect.value
    }
    return value
  }
})

class DebugLineMarker extends GutterMarker {
  toDOM(): HTMLElement {
    const el = document.createElement('div')
    el.className = 'cm-debug-line-marker'
    el.title = 'Paused here'
    return el
  }
}

const debugLineMarker = new DebugLineMarker()

/** Clickable breakpoint gutter for JS/TS files, plus the current debug line. */
export function breakpointGutter(filePath: string): Extension {
  if (!isJsPath(filePath)) return []
  return [
    debugLineField,
    gutter({
      class: 'cm-breakpoint-gutter',
      lineMarker: (view, line) => {
        const lineNo = view.state.doc.lineAt(line.from).number
        const paused = view.state.field(debugLineField)
        if (paused === lineNo) return debugLineMarker
        if (useDebugStore.getState().hasBreakpoint(filePath, lineNo)) return breakpointMarker
        return null
      },
      domEventHandlers: {
        mousedown(view, line, event) {
          if (event.button !== 0) return false
          const lineNo = view.state.doc.lineAt(line.from).number
          useDebugStore.getState().toggleBreakpoint(filePath, lineNo)
          view.dispatch({})
          return true
        }
      }
    }),
    EditorView.baseTheme({
      '.cm-breakpoint-gutter': { width: '14px' },
      '.cm-breakpoint-marker': {
        width: '8px',
        height: '8px',
        margin: '4px auto 0',
        borderRadius: '50%',
        background: '#e51400'
      },
      '.cm-debug-line-marker': {
        width: 0,
        height: 0,
        margin: '4px auto 0',
        borderTop: '5px solid transparent',
        borderBottom: '5px solid transparent',
        borderLeft: '8px solid #e2c08d'
      }
    })
  ]
}
