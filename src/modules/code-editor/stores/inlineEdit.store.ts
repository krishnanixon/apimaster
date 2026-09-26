import { create } from 'zustand'
import { EditorView } from '@codemirror/view'
import { toast } from 'sonner'
import {
  languageFromPath,
  stripCompletedFences,
  visibleCodeFromStream,
  windowAround
} from '@shared/lib/editor-ai'
import { streamEditorAi } from '../lib/editor-ai-client'
import { dismissGhostText, notifyEditAccepted } from '../lib/ghost-text'
import {
  acceptInlineEditInView,
  clearInlineEditInView,
  setInlineEdit,
  type InlineEditSnapshot,
  type InlineEditStatus
} from '../lib/inline-edit'
import { useCodeEditorStore } from './codeEditor.store'
import { useWorkbenchLayoutStore } from './workbench.store'

const MAX_SELECTION = 24_000

export type InlineAiMode = 'edit' | 'ask'

export interface InlineAnchor {
  top: number
  left: number
}

interface InlineEditState {
  status: InlineEditStatus
  mode: InlineAiMode
  from: number
  to: number
  original: string
  proposed: string
  answer: string
  error: string | null
  filePath: string | null
  anchor: InlineAnchor | null
  registerView: (view: EditorView | null) => void
  openPrompt: (mode?: InlineAiMode) => void
  togglePrompt: (mode?: InlineAiMode) => void
  setMode: (mode: InlineAiMode) => void
  submit: (instruction: string) => boolean
  accept: () => boolean
  reject: () => boolean
  close: () => boolean
  abort: () => void
}

let viewRef: EditorView | null = null
let abortStream: (() => void) | null = null
let lastToggleAt = 0

function snapshotFromState(state: InlineEditState): InlineEditSnapshot | null {
  if (state.status === 'idle' || state.mode === 'ask') return null
  return {
    from: state.from,
    to: state.to,
    original: state.original,
    proposed: state.proposed,
    status: state.status
  }
}

function paint(state: InlineEditState): void {
  const view = resolveView()
  if (!view) return
  view.dispatch({ effects: setInlineEdit.of(snapshotFromState(state)) })
}

function stopStream(): void {
  abortStream?.()
  abortStream = null
}

function resolveView(): EditorView | null {
  if (viewRef?.dom?.isConnected) return viewRef
  const focused = document.querySelector('[data-code-editor-pane][data-pane-focused="true"] .cm-editor')
  const fallback = document.querySelector('[data-code-editor-pane] .cm-editor')
  const node = focused ?? fallback
  if (node instanceof HTMLElement) {
    const found = EditorView.findFromDOM(node)
    if (found) {
      viewRef = found
      return found
    }
  }
  return null
}

function anchorFromView(view: EditorView, pos: number): InlineAnchor {
  const coords = view.coordsAtPos(pos) ?? view.scrollDOM.getBoundingClientRect()
  const top = Math.min(Math.max(8, coords.bottom + 8), window.innerHeight - 280)
  const left = Math.min(Math.max(12, coords.left), window.innerWidth - 36)
  return { top, left }
}

function idleState(state: InlineEditState): Partial<InlineEditState> {
  return {
    status: 'idle',
    from: 0,
    to: 0,
    original: '',
    proposed: '',
    answer: '',
    error: null,
    filePath: null,
    anchor: null,
    mode: state.mode
  }
}

export const useInlineEditStore = create<InlineEditState>((set, get) => ({
  status: 'idle',
  mode: 'edit',
  from: 0,
  to: 0,
  original: '',
  proposed: '',
  answer: '',
  error: null,
  filePath: null,
  anchor: null,

  registerView: (view) => {
    viewRef = view
  },

  setMode: (mode) => {
    if (get().status === 'streaming') return
    set({ mode, proposed: '', answer: '', error: null })
    paint({ ...get(), mode, proposed: '', answer: '', error: null })
  },

  togglePrompt: (mode) => {
    const now = Date.now()
    if (now - lastToggleAt < 80) return
    lastToggleAt = now
    if (get().status !== 'idle') {
      get().close()
      return
    }
    get().openPrompt(mode)
  },

  openPrompt: (mode) => {
    const view = resolveView()
    const editor = useCodeEditorStore.getState()
    const tab = editor.tabs.find((item) => item.path === editor.activeTabPath)
    if (!tab) {
      toast.error('Open a file before using inline AI')
      return
    }
    stopStream()
    if (view) dismissGhostText(view)
    const sel = view?.state.selection.main
    const from = sel?.from ?? 0
    const to = sel?.to ?? 0
    const original = view ? view.state.sliceDoc(from, to) : editor.selectedCode
    const nextMode = mode ?? get().mode
    const next: InlineEditState = {
      ...get(),
      status: 'prompt',
      mode: nextMode,
      from,
      to,
      original,
      proposed: '',
      answer: '',
      error: null,
      filePath: tab.path,
      anchor: view ? anchorFromView(view, to) : { top: 96, left: window.innerWidth / 2 }
    }
    useWorkbenchLayoutStore.getState().openInlineEdit()
    set({
      status: 'prompt',
      mode: nextMode,
      from,
      to,
      original,
      proposed: '',
      answer: '',
      error: null,
      filePath: tab.path,
      anchor: next.anchor
    })
    paint(next)
  },

  submit: (instruction) => {
    const view = resolveView()
    const trimmed = instruction.trim()
    if (!trimmed) return false
    if (!view) {
      toast.error('Click in the editor, then press Ctrl+K')
      return false
    }
    const current = get()
    const from = current.status === 'idle' ? view.state.selection.main.from : current.from
    const to = current.status === 'idle' ? view.state.selection.main.to : current.to
    const original = view.state.sliceDoc(from, to)
    if (current.mode === 'edit' && original.length > MAX_SELECTION) {
      set({ status: 'error', error: 'Selection is too large for inline edit. Select a smaller range.' })
      return false
    }
    const tabPath = useCodeEditorStore.getState().activeTabPath
    const doc = view.state.doc.toString()
    const { prefix, suffix } = windowAround(doc, from, to)
    stopStream()
    const kind = current.mode === 'ask' ? 'inline-ask' : 'inline-edit'
    const streaming: InlineEditState = {
      ...get(),
      status: 'streaming',
      from,
      to,
      original,
      proposed: '',
      answer: '',
      error: null,
      filePath: tabPath,
      anchor: current.anchor ?? anchorFromView(view, to)
    }
    set({
      status: 'streaming',
      from,
      to,
      original,
      proposed: '',
      answer: '',
      error: null,
      filePath: tabPath,
      anchor: streaming.anchor
    })
    paint(streaming)
    useWorkbenchLayoutStore.getState().openInlineEdit()

    let raw = ''
    abortStream = streamEditorAi(
      {
        kind,
        instruction: trimmed,
        filePath: tabPath ?? undefined,
        language: tabPath ? languageFromPath(tabPath) : undefined,
        prefix,
        suffix,
        selection: original
      },
      {
        onChunk: (delta) => {
          if (get().status !== 'streaming') return
          raw += delta
          if (get().mode === 'ask') {
            set({ answer: raw })
            return
          }
          const proposed = visibleCodeFromStream(raw)
          const next = { ...get(), proposed }
          set({ proposed })
          paint(next)
        },
        onEnd: () => {
          abortStream = null
          if (get().status !== 'streaming') return
          if (get().mode === 'ask') {
            const answer = raw.trim()
            if (!answer) {
              set({ status: 'error', error: 'The model returned no answer.', answer: '' })
              return
            }
            set({ status: 'ready', answer, error: null })
            return
          }
          const proposed = stripCompletedFences(raw)
          if (!proposed) {
            const next = { ...get(), status: 'error' as const, error: 'The model returned no code.' }
            set({ status: 'error', error: 'The model returned no code.', proposed: '' })
            paint(next)
            return
          }
          const next = { ...get(), status: 'ready' as const, proposed, error: null }
          set({ status: 'ready', proposed, error: null })
          paint(next)
        },
        onError: (error) => {
          abortStream = null
          if (get().status !== 'streaming') return
          const next = { ...get(), status: 'error' as const, error }
          set({ status: 'error', error })
          paint(next)
        }
      }
    )
    return true
  },

  accept: () => {
    const state = get()
    if (state.mode === 'ask') return get().close()
    const view = resolveView()
    if (!view) return false
    stopStream()
    const applied = acceptInlineEditInView(view)
    if (!applied) {
      const proposed = state.proposed
      if (proposed) {
        view.dispatch({
          changes: { from: state.from, to: state.to, insert: proposed },
          selection: { anchor: state.from + proposed.length },
          effects: setInlineEdit.of(null),
          userEvent: 'input.complete'
        })
      } else {
        clearInlineEditInView(view)
      }
    }
    useWorkbenchLayoutStore.getState().closeInlineEdit()
    set(idleState(state))
    if (view && state.proposed) {
      notifyEditAccepted(view, state.proposed, state.filePath ?? undefined)
    }
    return true
  },

  reject: () => {
    const view = resolveView()
    stopStream()
    if (view) clearInlineEditInView(view)
    useWorkbenchLayoutStore.getState().closeInlineEdit()
    set(idleState(get()))
    return true
  },

  close: () => get().reject(),

  abort: () => {
    get().close()
  }
}))
