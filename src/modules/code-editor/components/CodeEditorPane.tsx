import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import CodeMirror from '@uiw/react-codemirror'
import type { Extension } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { LanguageDescription } from '@codemirror/language'
import { languages } from '@codemirror/language-data'
import { FileCode2, FilePlus2, Search, SquareTerminal } from 'lucide-react'
import { EmptyState } from '@/shared/components/ui/empty-state'
import { Button } from '@/shared/components/ui/button'
import { useSettingsStore } from '@/shared/stores/settings.store'
import { useCodeEditorStore } from '../stores/codeEditor.store'
import { useEditorSettingsStore } from '../stores/editorSettings.store'
import { useInlineEditStore } from '../stores/inlineEdit.store'
import { useOutlineStore } from '../stores/outline.store'
import { cursorDark, cursorLight } from '../theme/cursorTheme'
import { SearchReplaceBar } from './SearchReplaceBar'
import { EditorBreadcrumbs } from './EditorBreadcrumbs'
import { basicSetupOptions, buildEditorExtensions } from '../lib/editor-extensions'
import { setGitBaseline } from '../lib/git-gutter'
import { refreshDiagnostics } from '../lib/diagnostics-extension'
import { setDebugLine } from '../lib/breakpoint-gutter'
import { isTsLikePath } from '../lib/language-files'
import { hasConflictMarkers } from '@shared/lib/merge-conflicts'
import { ConflictBanner } from './ConflictBanner'
import { useProblemsStore } from '../stores/problems.store'
import { useDebugStore } from '../stores/debug.store'
import { getDesktopApi } from '@/shared/lib/desktop-api'
import { useWorkbenchLayoutStore } from '../stores/workbench.store'
import { setWorkbenchTerminalOpen } from '../lib/terminal-workbench'

export function CodeEditorPane({ tabPath, paneIndex = 0 }: { tabPath?: string; paneIndex?: number }) {
  const activeTabPath = useCodeEditorStore((s) => s.activeTabPath)
  const resolvedPath = tabPath ?? activeTabPath
  const tab = useCodeEditorStore((s) => s.tabs.find((item) => item.path === resolvedPath))
  const setActiveTab = useCodeEditorStore((s) => s.setActiveTab)
  const focusPane = useCodeEditorStore((s) => s.focusPane)
  const focusedPane = useCodeEditorStore((s) => s.focusedPane)
  const updateTabContent = useCodeEditorStore((s) => s.updateTabContent)
  const updateEditorSelection = useCodeEditorStore((s) => s.updateEditorSelection)
  const gitBaseline = useCodeEditorStore((s) => (tab ? s.gitBaselines[tab.path] : undefined))
  const getEffectiveTheme = useSettingsStore((s) => s.getEffectiveTheme)
  const settings = useEditorSettingsStore(
    useShallow((s) => ({
      fontSize: s.fontSize,
      fontFamily: s.fontFamily,
      fontLigatures: s.fontLigatures,
      lineHeight: s.lineHeight,
      tabSize: s.tabSize,
      insertSpaces: s.insertSpaces,
      wordWrap: s.wordWrap,
      wordWrapColumn: s.wordWrapColumn,
      lineNumbers: s.lineNumbers,
      minimap: s.minimap,
      indentGuides: s.indentGuides,
      highlightActiveLine: s.highlightActiveLine,
      highlightSelectionMatches: s.highlightSelectionMatches,
      bracketMatching: s.bracketMatching,
      closeBrackets: s.closeBrackets,
      autocomplete: s.autocomplete,
      foldGutter: s.foldGutter,
      renderWhitespace: s.renderWhitespace,
      cursorStyle: s.cursorStyle,
      cursorBlink: s.cursorBlink,
      smoothScrolling: s.smoothScrolling,
      scrollPastEnd: s.scrollPastEnd,
      showDiagnostics: s.showDiagnostics,
      gitGutter: s.gitGutter,
      stickyBreadcrumbs: s.stickyBreadcrumbs,
      autoSave: s.autoSave,
      autoSaveDelayMs: s.autoSaveDelayMs,
      formatOnSave: s.formatOnSave,
      aiTabCompletions: s.aiTabCompletions,
      aiNextEditPrediction: s.aiNextEditPrediction,
      hoverDocumentation: s.hoverDocumentation,
      breakpointGutter: s.breakpointGutter
    }))
  )
  const problemRevision = useProblemsStore((s) => s.items.length)
  const debugPaused = useDebugStore((s) => s.snapshot)
  const [langExtension, setLangExtension] = useState<Extension | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [replaceMode, setReplaceMode] = useState(false)
  const viewRef = useRef<EditorView | null>(null)

  useEffect(() => {
    let cancelled = false
    if (!tab) {
      setLangExtension(null)
      return
    }
    const description = LanguageDescription.matchFilename(languages, tab.name)
    if (!description) {
      setLangExtension(null)
      return
    }
    description
      .load()
      .then((support) => {
        if (!cancelled) setLangExtension(support)
      })
      .catch(() => {
        if (!cancelled) setLangExtension(null)
      })
    return () => {
      cancelled = true
    }
  }, [tab?.name])

  useEffect(() => {
    if (tab?.path) void useOutlineStore.getState().load(tab.path)
  }, [tab?.path])

  useEffect(() => {
    if (paneIndex !== focusedPane) return
    const inline = useInlineEditStore.getState()
    if (inline.filePath && tab?.path && inline.filePath !== tab.path) inline.reject()
  }, [tab?.path, paneIndex, focusedPane])

  useEffect(() => {
    if (paneIndex !== focusedPane) return
    const handler = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return
      if (event.key.toLowerCase() === 'f') {
        if (event.shiftKey) return
        event.preventDefault()
        setReplaceMode(false)
        setSearchOpen(true)
      }
      if (event.key.toLowerCase() === 'h') {
        event.preventDefault()
        setReplaceMode(true)
        setSearchOpen(true)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [paneIndex, focusedPane])

  useEffect(() => {
    const saveOnBlur = () => {
      if (useEditorSettingsStore.getState().autoSave === 'onFocusChange') {
        void useCodeEditorStore.getState().saveActiveTab()
      }
    }
    window.addEventListener('blur', saveOnBlur)
    document.addEventListener('visibilitychange', saveOnBlur)
    return () => {
      window.removeEventListener('blur', saveOnBlur)
      document.removeEventListener('visibilitychange', saveOnBlur)
    }
  }, [])

  const revealRange = useCallback((from: number, to: number) => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({
      selection: { anchor: from, head: to },
      scrollIntoView: true
    })
  }, [])

  const pendingReveal = useCodeEditorStore((s) => s.pendingReveal)
  const clearPendingReveal = useCodeEditorStore((s) => s.clearPendingReveal)

  const revealLine = useCallback((line: number, column?: number) => {
    const view = viewRef.current
    if (!view) return false
    const target = Math.max(1, Math.min(line, view.state.doc.lines))
    const info = view.state.doc.line(target)
    const offset = Math.min(info.from + Math.max(0, (column ?? 1) - 1), info.to)
    view.dispatch({
      selection: { anchor: offset, head: offset },
      scrollIntoView: true
    })
    return true
  }, [])

  useEffect(() => {
    if (!pendingReveal || !tab || tab.loading || pendingReveal.path !== tab.path) return
    if (revealLine(pendingReveal.line, pendingReveal.column)) clearPendingReveal()
  }, [pendingReveal, tab?.path, tab?.loading, tab?.content, revealLine, clearPendingReveal])

  useEffect(() => {
    const view = viewRef.current
    if (!view || gitBaseline === undefined) return
    view.dispatch({ effects: setGitBaseline.of(gitBaseline) })
  }, [gitBaseline, tab?.path])

  useEffect(() => {
    refreshDiagnostics(viewRef.current)
  }, [problemRevision, tab?.path])

  useEffect(() => {
    if (!tab || tab.loading || !isTsLikePath(tab.path)) return
    const api = getDesktopApi()?.language
    if (!api?.diagnostics) return
    void api.diagnostics(tab.path, tab.content).then((result) => {
      if (result.success && result.data) useProblemsStore.getState().setLanguageItems(tab.path, result.data)
    })
  }, [tab?.path])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const frame = debugPaused.state === 'paused' ? debugPaused.frames[0] : undefined
    const line = frame?.path && tab?.path && frame.path.replace(/\\/g, '/') === tab.path.replace(/\\/g, '/') ? frame.line ?? null : null
    view.dispatch({ effects: setDebugLine.of(line) })
  }, [debugPaused, tab?.path])

  const extras = useMemo<Extension[]>(() => (langExtension ? [langExtension] : []), [langExtension])
  const extensions = useMemo(
    () => (tab ? buildEditorExtensions({ settings, filePath: tab.path, extras }) : []),
    [settings, tab?.path, extras]
  )

  if (!resolvedPath || !tab) {
    return (
      <div className="flex h-full items-center justify-center bg-[var(--wb-editor)]">
        <EmptyState
          icon={<FileCode2 className="h-5 w-5" />}
          title="Ready to build"
          description="Open a file, create something new, or start a terminal in this workspace."
          action={
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button size="sm" onClick={() => useWorkbenchLayoutStore.getState().openQuickOpen('files')}>
                <Search className="h-3.5 w-3.5" /> Open file
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => window.dispatchEvent(new CustomEvent('workbench:new-entry', { detail: { kind: 'file' } }))}
              >
                <FilePlus2 className="h-3.5 w-3.5" /> New file
              </Button>
              <Button size="sm" variant="outline" onClick={() => void setWorkbenchTerminalOpen(true)}>
                <SquareTerminal className="h-3.5 w-3.5" /> Terminal
              </Button>
            </div>
          }
        />
      </div>
    )
  }

  if (tab.loading) {
    return <div className="flex h-full items-center justify-center bg-[var(--wb-editor)] text-[12px] text-[var(--wb-muted)]">Loading…</div>
  }

  const isFocused = paneIndex === focusedPane

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {isFocused ? <EditorBreadcrumbs /> : null}
      {searchOpen && (
        <SearchReplaceBar
          replaceMode={replaceMode}
          onClose={() => setSearchOpen(false)}
          onReveal={revealRange}
        />
      )}
      {hasConflictMarkers(tab.content) ? <ConflictBanner path={tab.path} content={tab.content} /> : null}
      <div
        className="relative min-h-0 flex-1 overflow-hidden"
        data-code-editor-pane
        data-pane-focused={isFocused ? 'true' : undefined}
        onMouseDown={() => {
          focusPane(paneIndex)
          setActiveTab(tab.path)
          if (viewRef.current) useInlineEditStore.getState().registerView(viewRef.current)
        }}
      >
        <CodeMirror
          value={tab.content}
          height="100%"
          theme={getEffectiveTheme() === 'dark' ? cursorDark : cursorLight}
          extensions={extensions}
          onCreateEditor={(view) => {
            viewRef.current = view
            if (paneIndex === useCodeEditorStore.getState().focusedPane) {
              useInlineEditStore.getState().registerView(view)
            }
            if (gitBaseline !== undefined) {
              view.dispatch({ effects: setGitBaseline.of(gitBaseline) })
            }
            const pending = useCodeEditorStore.getState().pendingReveal
            if (pending && pending.path === tab.path && revealLine(pending.line, pending.column)) {
              useCodeEditorStore.getState().clearPendingReveal()
            }
          }}
          onUpdate={(vu) => {
            if (!vu.selectionSet) return
            const sel = vu.state.selection.main
            const line = vu.state.doc.lineAt(sel.head)
            const selected = vu.state.sliceDoc(sel.from, sel.to)
            const lineCount = selected ? selected.split(/\r?\n/).length : 0
            updateEditorSelection(
              selected,
              { line: line.number, column: sel.head - line.from + 1, offset: sel.head },
              lineCount
            )
          }}
          onChange={(value) => updateTabContent(tab.path, value)}
          basicSetup={basicSetupOptions(settings)}
          style={{ height: '100%' }}
        />
      </div>
    </div>
  )
}
