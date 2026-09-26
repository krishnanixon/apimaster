import { StateEffect, StateField, type Extension } from '@codemirror/state'
import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view'
import { completionStatus } from '@codemirror/autocomplete'
import {
  languageFromPath,
  shouldTriggerCompletion,
  trimCompletionOverlap,
  visibleCodeFromStream,
  windowAround
} from '@shared/lib/editor-ai'
import { editorSettings } from '../stores/editorSettings.store'
import { streamEditorAi } from './editor-ai-client'
import { inlineEditField } from './inline-edit'

interface GhostText {
  from: number
  text: string
  kind?: 'completion' | 'next-edit'
}

export const setGhostText = StateEffect.define<GhostText | null>()

const viewFilePath = new WeakMap<EditorView, string>()

export const ghostTextField = StateField.define<GhostText | null>({
  create: () => null,
  update(value, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(setGhostText)) return effect.value
    }
    if (!value) return value
    if (transaction.docChanged || transaction.selection) return null
    return value
  },
  provide: (field) => EditorView.decorations.from(field, (ghost) => ghostDecorations(ghost))
})

class GhostInlineWidget extends WidgetType {
  constructor(
    readonly text: string,
    readonly kind: GhostText['kind'] = 'completion'
  ) {
    super()
  }

  eq(other: GhostInlineWidget): boolean {
    return other.text === this.text && other.kind === this.kind
  }

  toDOM(): HTMLElement {
    const span = document.createElement('span')
    span.className =
      this.kind === 'next-edit' ? 'cm-ghost-text cm-ghost-text-next-edit' : 'cm-ghost-text'
    span.textContent = this.text
    if (this.kind === 'next-edit') span.title = 'Next edit · Tab to accept'
    return span
  }

  ignoreEvent(): boolean {
    return true
  }
}

class GhostBlockWidget extends WidgetType {
  constructor(
    readonly text: string,
    readonly kind: GhostText['kind'] = 'completion'
  ) {
    super()
  }

  eq(other: GhostBlockWidget): boolean {
    return other.text === this.text && other.kind === this.kind
  }

  toDOM(): HTMLElement {
    const pre = document.createElement('pre')
    pre.className =
      this.kind === 'next-edit'
        ? 'cm-ghost-text cm-ghost-text-block cm-ghost-text-next-edit'
        : 'cm-ghost-text cm-ghost-text-block'
    pre.textContent = this.text
    if (this.kind === 'next-edit') pre.title = 'Next edit · Tab to accept'
    return pre
  }

  ignoreEvent(): boolean {
    return true
  }
}

function ghostDecorations(ghost: GhostText | null): DecorationSet {
  if (!ghost?.text) return Decoration.none
  const kind = ghost.kind ?? 'completion'
  const newline = ghost.text.indexOf('\n')
  if (newline < 0) {
    return Decoration.set([
      Decoration.widget({
        widget: new GhostInlineWidget(ghost.text, kind),
        side: 1
      }).range(ghost.from)
    ])
  }
  const first = ghost.text.slice(0, newline)
  const rest = ghost.text.slice(newline + 1)
  const widgets = []
  if (first) {
    widgets.push(
      Decoration.widget({
        widget: new GhostInlineWidget(first, kind),
        side: 1
      }).range(ghost.from)
    )
  }
  if (rest) {
    widgets.push(
      Decoration.widget({
        widget: new GhostBlockWidget(rest, kind),
        block: true,
        side: 1
      }).range(ghost.from)
    )
  }
  return Decoration.set(widgets, true)
}

export function acceptGhostText(view: EditorView): boolean {
  const ghost = view.state.field(ghostTextField, false)
  if (!ghost?.text) return false
  const accepted = ghost.text
  const kind = ghost.kind ?? 'completion'
  view.dispatch({
    changes: { from: ghost.from, insert: accepted },
    selection: { anchor: ghost.from + accepted.length },
    effects: setGhostText.of(null),
    userEvent: 'input.complete'
  })
  scheduleNextEditAfterAccept(view, accepted, kind)
  return true
}

/** Call after an inline edit accept so NEP can chain. */
export function notifyEditAccepted(view: EditorView, recentEdit: string, filePath?: string): void {
  if (!editorSettings().aiNextEditPrediction) return
  if (!recentEdit.trim()) return
  if (filePath) viewFilePath.set(view, filePath)
  window.setTimeout(() => {
    if (!view.dom.isConnected) return
    const path = filePath || viewFilePath.get(view)
    if (!path) return
    requestNextEdit(view, path, recentEdit)
  }, 220)
}

function scheduleNextEditAfterAccept(
  view: EditorView,
  recentEdit: string,
  fromKind: GhostText['kind']
): void {
  if (!editorSettings().aiNextEditPrediction) return
  // Avoid infinite next-edit loops after accepting a prediction.
  if (fromKind === 'next-edit') return
  const filePath = viewFilePath.get(view)
  if (!filePath) return
  window.setTimeout(() => {
    if (!view.dom.isConnected) return
    requestNextEdit(view, filePath, recentEdit)
  }, 220)
}

export function dismissGhostText(view: EditorView): boolean {
  if (!view.state.field(ghostTextField, false)) return false
  view.dispatch({ effects: setGhostText.of(null) })
  return true
}

let nextEditAbort: (() => void) | null = null
let nextEditGen = 0

function requestNextEdit(view: EditorView, filePath: string, recentEdit: string): void {
  if (!editorSettings().aiNextEditPrediction) return
  if (!view.state.selection.main.empty) return
  if (completionStatus(view.state) === 'active') return
  if (view.state.field(inlineEditField, false)) return

  nextEditAbort?.()
  nextEditGen += 1
  const gen = nextEditGen
  const pos = view.state.selection.main.head
  const doc = view.state.doc.toString()
  const { prefix, suffix } = windowAround(doc, pos, pos, 4_000, 1_600)
  let raw = ''
  let frame = 0

  const stale = () =>
    gen !== nextEditGen || view.state.selection.main.head !== pos || !view.dom.isConnected

  const paint = (text: string) => {
    if (stale() || !text || !view.state.selection.main.empty) return
    view.dispatch({
      effects: setGhostText.of({ from: pos, text, kind: 'next-edit' })
    })
  }

  nextEditAbort = streamEditorAi(
    {
      kind: 'next-edit',
      filePath,
      language: languageFromPath(filePath),
      prefix,
      suffix,
      selection: recentEdit.slice(0, 1_200)
    },
    {
      onChunk: (delta) => {
        if (stale()) return
        raw += delta
        if (frame) return
        frame = requestAnimationFrame(() => {
          frame = 0
          paint(trimCompletionOverlap(visibleCodeFromStream(raw), suffix))
        })
      },
      onEnd: () => {
        if (frame) {
          cancelAnimationFrame(frame)
          frame = 0
        }
        nextEditAbort = null
        if (stale()) return
        const text = trimCompletionOverlap(visibleCodeFromStream(raw), suffix)
        if (text) paint(text)
        else if (view.state.field(ghostTextField, false)?.kind === 'next-edit') {
          view.dispatch({ effects: setGhostText.of(null) })
        }
      },
      onError: () => {
        if (frame) {
          cancelAnimationFrame(frame)
          frame = 0
        }
        nextEditAbort = null
        if (stale()) return
        if (view.state.field(ghostTextField, false)?.kind === 'next-edit') {
          view.dispatch({ effects: setGhostText.of(null) })
        }
      }
    }
  )
}

export function ghostTextExtension(filePath: string): Extension {
  let debounce: ReturnType<typeof setTimeout> | null = null
  let abort: (() => void) | null = null
  let generation = 0
  let cooldownUntil = 0

  const plugin = EditorView.updateListener.of((update) => {
    viewFilePath.set(update.view, filePath)
    if (update.transactions.some((tr) => tr.isUserEvent('input.complete'))) {
      cooldownUntil = Date.now() + 900
      abort?.()
      abort = null
      return
    }
    if (update.selectionSet && !update.docChanged) {
      if (update.state.field(ghostTextField, false)) {
        update.view.dispatch({ effects: setGhostText.of(null) })
      }
      abort?.()
      abort = null
      nextEditAbort?.()
      nextEditAbort = null
      if (debounce) {
        clearTimeout(debounce)
        debounce = null
      }
      return
    }
    if (!update.docChanged) return

    const settings = editorSettings()
    const typed = Math.abs(update.state.doc.length - update.startState.doc.length)
    if (
      !shouldTriggerCompletion({
        docLength: update.state.doc.length,
        selectionEmpty: update.state.selection.main.empty,
        typedChars: typed || 1,
        inlineEditOpen: Boolean(update.state.field(inlineEditField, false)),
        completionsEnabled: settings.aiTabCompletions
      })
    ) {
      abort?.()
      abort = null
      return
    }
    if (completionStatus(update.state) === 'active') return
    if (Date.now() < cooldownUntil) return
    if (
      !update.transactions.some(
        (tr) => tr.isUserEvent('input.type') || tr.isUserEvent('delete.backward')
      )
    ) {
      return
    }

    if (debounce) clearTimeout(debounce)
    abort?.()
    abort = null
    const view = update.view
    debounce = setTimeout(() => {
      debounce = null
      if (!view.dom.isConnected) return
      generation += 1
      const gen = generation
      abort = requestCompletion(view, filePath, gen, () => generation)
    }, 380)
  })

  return [
    ghostTextField,
    plugin,
    EditorView.baseTheme({
      '.cm-ghost-text': {
        color: 'var(--wb-muted, #858585)',
        opacity: '0.55',
        pointerEvents: 'none',
        whiteSpace: 'pre'
      },
      '.cm-ghost-text-block': {
        margin: '0',
        fontFamily: 'inherit',
        fontSize: 'inherit',
        lineHeight: 'inherit'
      },
      '.cm-ghost-text-next-edit': {
        color: 'var(--wb-accent, #3b82f6)',
        opacity: '0.72',
        textDecoration: 'underline',
        textDecorationStyle: 'dotted',
        textUnderlineOffset: '3px'
      }
    })
  ]
}

function requestCompletion(
  view: EditorView,
  filePath: string,
  gen: number,
  currentGen: () => number
): () => void {
  if (!view.state.selection.main.empty) return () => undefined
  if (completionStatus(view.state) === 'active') return () => undefined
  if (view.state.field(inlineEditField, false)) return () => undefined

  const pos = view.state.selection.main.head
  const doc = view.state.doc.toString()
  const { prefix, suffix } = windowAround(doc, pos, pos, 4_000, 1_600)
  let raw = ''
  let frame = 0

  const stale = () => gen !== currentGen() || view.state.selection.main.head !== pos

  const paint = (text: string) => {
    if (stale() || !text || !view.state.selection.main.empty) return
    view.dispatch({ effects: setGhostText.of({ from: pos, text, kind: 'completion' }) })
  }

  const stop = streamEditorAi(
    {
      kind: 'completion',
      filePath,
      language: languageFromPath(filePath),
      prefix,
      suffix
    },
    {
      onChunk: (delta) => {
        if (stale()) return
        raw += delta
        if (frame) return
        frame = requestAnimationFrame(() => {
          frame = 0
          paint(trimCompletionOverlap(visibleCodeFromStream(raw), suffix))
        })
      },
      onEnd: () => {
        if (frame) {
          cancelAnimationFrame(frame)
          frame = 0
        }
        if (stale()) return
        const text = trimCompletionOverlap(visibleCodeFromStream(raw), suffix)
        if (text) paint(text)
        else if (view.state.field(ghostTextField, false)) {
          view.dispatch({ effects: setGhostText.of(null) })
        }
      },
      onError: () => {
        if (frame) {
          cancelAnimationFrame(frame)
          frame = 0
        }
        if (stale()) return
        if (view.state.field(ghostTextField, false)) {
          view.dispatch({ effects: setGhostText.of(null) })
        }
      }
    }
  )
  return () => {
    if (frame) {
      cancelAnimationFrame(frame)
      frame = 0
    }
    stop()
  }
}
