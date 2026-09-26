import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, Command, Hash, ListTree, Search } from 'lucide-react'
import type { CodeSearchHit } from '@shared/types/code-intel'
import { Dialog, DialogContent, DialogTitle } from '@/shared/components/ui/dialog'
import { cn } from '@/shared/lib/utils'
import { useCodeEditorStore } from '../stores/codeEditor.store'
import { useOutlineStore } from '../stores/outline.store'
import { useWorkbenchLayoutStore, type QuickOpenMode } from '../stores/workbench.store'
import { workbenchCommands, type WorkbenchCommand } from '../lib/commands'
import { fileIconFor } from '../lib/file-icons'
import { fuzzyFilter } from '../lib/fuzzy'
import { fileNameOf, relativeTo } from '../lib/paths'

interface QuickItem {
  key: string
  label: string
  detail?: string
  hint?: string
  icon: React.ReactNode
  run: () => void | Promise<void>
}

/** Prefixes that switch mode mid-typing, exactly like VS Code's quick open. */
const PREFIXES: Array<{ prefix: string; mode: QuickOpenMode }> = [
  { prefix: '>', mode: 'commands' },
  { prefix: '@', mode: 'fileSymbols' },
  { prefix: '#', mode: 'workspaceSymbols' },
  { prefix: ':', mode: 'line' }
]

const PLACEHOLDERS: Record<QuickOpenMode, string> = {
  files: 'Search files by name (type > for commands, @ for symbols, : for line)',
  commands: 'Type a command name',
  fileSymbols: 'Go to symbol in the active file',
  workspaceSymbols: 'Go to symbol in the workspace',
  line: 'Type a line number, then Enter'
}

function initialQueryFor(mode: QuickOpenMode): string {
  return PREFIXES.find((entry) => entry.mode === mode)?.prefix ?? ''
}

function parseQuery(raw: string): { mode: QuickOpenMode; term: string } {
  for (const { prefix, mode } of PREFIXES) {
    if (raw.startsWith(prefix)) return { mode, term: raw.slice(prefix.length) }
  }
  return { mode: 'files', term: raw }
}

export function QuickOpen() {
  const mode = useWorkbenchLayoutStore((s) => s.quickOpen)
  const close = useWorkbenchLayoutStore((s) => s.closeQuickOpen)
  const rootPath = useCodeEditorStore((s) => s.rootPath)
  const tabs = useCodeEditorStore((s) => s.tabs)
  const recentTabPaths = useCodeEditorStore((s) => s.recentTabPaths)
  const activeTabPath = useCodeEditorStore((s) => s.activeTabPath)
  const fileSearchHits = useCodeEditorStore((s) => s.fileSearchHits)
  const setFileSearchQuery = useCodeEditorStore((s) => s.setFileSearchQuery)
  const openFileByPath = useCodeEditorStore((s) => s.openFileByPath)
  const openFileAtLine = useCodeEditorStore((s) => s.openFileAtLine)
  const goToLine = useCodeEditorStore((s) => s.goToLine)
  const outlineSymbols = useOutlineStore((s) => s.symbols)
  const loadOutline = useOutlineStore((s) => s.load)

  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const [workspaceSymbols, setWorkspaceSymbols] = useState<CodeSearchHit[]>([])
  const listRef = useRef<HTMLDivElement | null>(null)

  const parsed = parseQuery(query)
  const effectiveMode = parsed.mode

  useEffect(() => {
    if (!mode) return
    setQuery(initialQueryFor(mode))
    setActiveIndex(0)
  }, [mode])

  useEffect(() => {
    if (!mode || effectiveMode !== 'files') return
    setFileSearchQuery(parsed.term)
  }, [mode, effectiveMode, parsed.term, setFileSearchQuery])

  useEffect(() => {
    if (!mode || effectiveMode !== 'fileSymbols') return
    void loadOutline(activeTabPath)
  }, [mode, effectiveMode, activeTabPath, loadOutline])

  useEffect(() => {
    if (!mode || effectiveMode !== 'workspaceSymbols') return
    const term = parsed.term.trim()
    if (term.length < 2) {
      setWorkspaceSymbols([])
      return
    }
    let cancelled = false
    const timer = window.setTimeout(async () => {
      const result = await window.electronAPI.codeIndex.searchSymbol(term, 80)
      if (!cancelled) setWorkspaceSymbols(result.success ? (result.data ?? []) : [])
    }, 150)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [mode, effectiveMode, parsed.term])

  const items = useMemo<QuickItem[]>(() => {
    if (effectiveMode === 'commands') {
      return fuzzyFilter(parsed.term, workbenchCommands(), (command) => `${command.category} ${command.title}`).map(
        ({ item }: { item: WorkbenchCommand }) => ({
          key: item.id,
          label: item.title,
          hint: item.shortcut,
          icon: <Command className="h-3.5 w-3.5 text-muted-foreground" />,
          run: item.run
        })
      )
    }

    if (effectiveMode === 'fileSymbols') {
      return fuzzyFilter(parsed.term, outlineSymbols, (symbol) => symbol.name).map(({ item }) => ({
        key: `${item.name}:${item.startLine}`,
        label: item.name,
        detail: item.container ? `${item.kind} · ${item.container}` : item.kind,
        hint: `:${item.startLine}`,
        icon: <ListTree className="h-3.5 w-3.5 text-muted-foreground" />,
        run: () => goToLine(item.startLine, 1)
      }))
    }

    if (effectiveMode === 'workspaceSymbols') {
      return workspaceSymbols.map((hit) => ({
        key: `${hit.path}:${hit.startLine}:${hit.name}`,
        label: hit.name ?? hit.relativePath,
        detail: `${hit.kind ?? 'symbol'} · ${hit.relativePath}`,
        hint: `:${hit.startLine}`,
        icon: <Hash className="h-3.5 w-3.5 text-muted-foreground" />,
        run: () => openFileAtLine(hit.path, hit.startLine, 1, hit.endLine)
      }))
    }

    if (effectiveMode === 'line') {
      const line = Number.parseInt(parsed.term.trim(), 10)
      if (!Number.isFinite(line) || line < 1) return []
      return [
        {
          key: `line-${line}`,
          label: `Go to line ${line}`,
          detail: activeTabPath ? fileNameOf(activeTabPath) : undefined,
          icon: <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />,
          run: () => goToLine(line, 1)
        }
      ]
    }

    // Files: recently used tabs first when the query is empty, index hits once typing.
    const term = parsed.term.trim()
    if (!term) {
      const ordered = [
        ...recentTabPaths.filter((path) => tabs.some((tab) => tab.path === path)),
        ...tabs.map((tab) => tab.path).filter((path) => !recentTabPaths.includes(path))
      ]
      return ordered.map((path) => {
        const spec = fileIconFor(path)
        return {
          key: path,
          label: fileNameOf(path),
          detail: relativeTo(rootPath, path),
          hint: path === activeTabPath ? 'current' : undefined,
          icon: <spec.icon className={cn('h-3.5 w-3.5', spec.className)} />,
          run: () => openFileByPath(path)
        }
      })
    }

    return fileSearchHits.map((hit) => {
      const spec = fileIconFor(hit.path)
      return {
        key: hit.path,
        label: hit.name,
        detail: hit.relativePath,
        icon: <spec.icon className={cn('h-3.5 w-3.5', spec.className)} />,
        run: () => openFileByPath(hit.path)
      }
    })
  }, [
    effectiveMode,
    parsed.term,
    outlineSymbols,
    workspaceSymbols,
    fileSearchHits,
    recentTabPaths,
    tabs,
    rootPath,
    activeTabPath,
    goToLine,
    openFileAtLine,
    openFileByPath
  ])

  useEffect(() => {
    setActiveIndex(0)
  }, [effectiveMode, parsed.term])

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex, items.length])

  const runItem = (item: QuickItem | undefined) => {
    if (!item) return
    close()
    void item.run()
  }

  return (
    <Dialog open={mode !== null} onOpenChange={(open) => !open && close()}>
      <DialogContent
        hideClose
        aria-label="Quick open"
        className="top-[10%] max-w-xl translate-y-0 gap-0 overflow-hidden rounded-lg border-[var(--wb-border)] p-0 shadow-2xl"
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          const input = event.currentTarget.querySelector('input')
          input?.focus()
        }}
      >
        <DialogTitle className="sr-only">Quick open</DialogTitle>
        <div className="flex items-center gap-2 border-b border-[var(--wb-border)] px-3 py-2">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault()
                setActiveIndex((index) => (items.length === 0 ? 0 : (index + 1) % items.length))
              } else if (event.key === 'ArrowUp') {
                event.preventDefault()
                setActiveIndex((index) => (items.length === 0 ? 0 : (index - 1 + items.length) % items.length))
              } else if (event.key === 'Enter') {
                event.preventDefault()
                runItem(items[activeIndex])
              } else if (event.key === 'Escape') {
                event.preventDefault()
                close()
              }
            }}
            placeholder={PLACEHOLDERS[effectiveMode]}
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <span className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
            {effectiveMode === 'files'
              ? 'files'
              : effectiveMode === 'commands'
                ? 'commands'
                : effectiveMode === 'line'
                  ? 'line'
                  : 'symbols'}
          </span>
        </div>

        <div ref={listRef} className="max-h-[50vh] min-h-[3rem] overflow-y-auto py-1">
          {items.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-muted-foreground">
              {effectiveMode === 'workspaceSymbols' && parsed.term.trim().length < 2
                ? 'Type at least two characters to search symbols.'
                : 'No matching results.'}
            </p>
          ) : (
            items.map((item, index) => (
              <button
                key={item.key}
                type="button"
                data-active={index === activeIndex}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => runItem(item)}
                className={cn(
                  'flex w-full items-center gap-2 px-3 py-1 text-left text-[12px]',
                  index === activeIndex ? 'bg-[var(--wb-active)] text-[var(--wb-fg)]' : 'hover:bg-[var(--wb-hover)]'
                )}
              >
                <span className="shrink-0">{item.icon}</span>
                <span className="truncate font-medium">{item.label}</span>
                {item.detail ? (
                  <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">{item.detail}</span>
                ) : (
                  <span className="flex-1" />
                )}
                {item.hint ? (
                  <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{item.hint}</span>
                ) : null}
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
