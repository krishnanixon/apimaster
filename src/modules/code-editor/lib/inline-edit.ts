import { StateEffect, StateField, type Extension } from '@codemirror/state'
import { Decoration, EditorView, WidgetType } from '@codemirror/view'

export type InlineEditStatus = 'idle' | 'prompt' | 'streaming' | 'ready' | 'error'

export interface InlineEditSnapshot {
  from: number
  to: number
  original: string
  proposed: string
  status: Exclude<InlineEditStatus, 'idle'>
}

export const setInlineEdit = StateEffect.define<InlineEditSnapshot | null>()

class ProposedCodeWidget extends WidgetType {
  constructor(
    readonly text: string,
    readonly streaming: boolean
  ) {
    super()
  }

  eq(other: ProposedCodeWidget): boolean {
    return other.text === this.text && other.streaming === this.streaming
  }

  toDOM(): HTMLElement {
    const wrap = document.createElement('div')
    wrap.className = 'cm-inline-ai-proposed'
    if (this.streaming) wrap.classList.add('cm-inline-ai-proposed-streaming')
    const pre = document.createElement('pre')
    pre.textContent = this.text || (this.streaming ? '…' : '')
    wrap.appendChild(pre)
    return wrap
  }

  ignoreEvent(): boolean {
    return true
  }
}

export const inlineEditField = StateField.define<InlineEditSnapshot | null>({
  create: () => null,
  update(value, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(setInlineEdit)) return effect.value
    }
    if (!value) return value
    return {
      ...value,
      from: transaction.changes.mapPos(value.from, 1),
      to: transaction.changes.mapPos(value.to, -1)
    }
  },
  provide: (field) =>
    EditorView.decorations.from(field, (session) => {
      if (!session || session.status === 'prompt') return Decoration.none
      const decorations = []
      if (session.to > session.from) {
        decorations.push(
          Decoration.mark({ class: 'cm-inline-ai-original' }).range(session.from, session.to)
        )
      }
      if (session.proposed || session.status === 'streaming') {
        decorations.push(
          Decoration.widget({
            widget: new ProposedCodeWidget(session.proposed, session.status === 'streaming'),
            block: true,
            side: 1
          }).range(session.to)
        )
      }
      return Decoration.set(decorations, true)
    })
})

export function inlineEditDecorations(): Extension {
  return [inlineEditField, inlineEditTheme]
}

const inlineEditTheme = EditorView.baseTheme({
  '.cm-inline-ai-original': {
    backgroundColor: 'rgba(248, 81, 73, 0.14)',
    textDecoration: 'line-through',
    textDecorationColor: 'rgba(248, 81, 73, 0.65)'
  }
})

/** Apply the proposed rewrite into the document, or no-op if there is nothing to accept. */
export function acceptInlineEditInView(view: EditorView): boolean {
  const session = view.state.field(inlineEditField, false)
  if (!session || (session.status !== 'ready' && session.status !== 'streaming')) return false
  if (!session.proposed) return false
  view.dispatch({
    changes: { from: session.from, to: session.to, insert: session.proposed },
    selection: { anchor: session.from + session.proposed.length },
    effects: setInlineEdit.of(null),
    userEvent: 'input.complete'
  })
  return true
}

export function clearInlineEditInView(view: EditorView): boolean {
  if (!view.state.field(inlineEditField, false)) return false
  view.dispatch({ effects: setInlineEdit.of(null) })
  return true
}

export function hasInlineEditSession(view: EditorView): boolean {
  return Boolean(view.state.field(inlineEditField, false))
}
