import { StateEffect, StateField, type Extension } from '@codemirror/state'
import { EditorView, gutter, GutterMarker } from '@codemirror/view'
import { diffLines, type LineChange, type LineChangeKind } from './line-diff'

/** Replaces the baseline (git HEAD) contents the change gutter compares against. */
export const setGitBaseline = StateEffect.define<string | null>()

const baselineField = StateField.define<string | null>({
  create: () => null,
  update(value, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(setGitBaseline)) return effect.value
    }
    return value
  }
})

const changesField = StateField.define<Map<number, LineChangeKind>>({
  create: () => new Map(),
  update(value, transaction) {
    const baselineChanged = transaction.effects.some((effect) => effect.is(setGitBaseline))
    if (!transaction.docChanged && !baselineChanged) return value
    const baseline = transaction.state.field(baselineField)
    if (baseline === null) return new Map()
    return indexChanges(diffLines(baseline, transaction.state.doc.toString()))
  }
})

function indexChanges(changes: LineChange[]): Map<number, LineChangeKind> {
  const map = new Map<number, LineChangeKind>()
  for (const change of changes) {
    const existing = map.get(change.line)
    if (existing === 'modified') continue
    map.set(change.line, existing && existing !== change.kind ? 'modified' : change.kind)
  }
  return map
}

class ChangeMarker extends GutterMarker {
  constructor(private readonly kind: LineChangeKind) {
    super()
  }

  eq(other: ChangeMarker): boolean {
    return other.kind === this.kind
  }

  toDOM(): HTMLElement {
    const element = document.createElement('div')
    element.className = `cm-changeMarker cm-changeMarker-${this.kind}`
    element.title =
      this.kind === 'added' ? 'Added line' : this.kind === 'modified' ? 'Modified line' : 'Removed lines'
    return element
  }
}

const markers: Record<LineChangeKind, ChangeMarker> = {
  added: new ChangeMarker('added'),
  modified: new ChangeMarker('modified'),
  deleted: new ChangeMarker('deleted')
}

const gutterTheme = EditorView.baseTheme({
  '.cm-changeGutter': { width: '3px', paddingLeft: '2px' },
  '.cm-changeMarker': { width: '3px', height: '100%', borderRadius: '1px' },
  '.cm-changeMarker-added': { background: '#2ea043' },
  '.cm-changeMarker-modified': { background: '#3b82f6' },
  '.cm-changeMarker-deleted': {
    background: 'transparent',
    borderTop: '3px solid #f85149',
    borderRadius: '0'
  }
})

/** VS Code style "dirty diff" gutter showing lines changed since the last commit. */
export function gitChangeGutter(): Extension {
  return [
    baselineField,
    changesField,
    gutterTheme,
    gutter({
      class: 'cm-changeGutter',
      lineMarker: (view, line) => {
        const changes = view.state.field(changesField, false)
        if (!changes || changes.size === 0) return null
        const kind = changes.get(view.state.doc.lineAt(line.from).number)
        return kind ? markers[kind] : null
      },
      lineMarkerChange: (update) =>
        update.docChanged || update.startState.field(changesField, false) !== update.state.field(changesField, false)
    })
  ]
}

export function gitChangeCount(view: EditorView | null): number {
  return view?.state.field(changesField, false)?.size ?? 0
}
