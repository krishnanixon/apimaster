import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import CodeMirror, { type ReactCodeMirrorRef } from '@uiw/react-codemirror'
import { sql, PostgreSQL, MySQL, MariaSQL, MSSQL, SQLite, StandardSQL } from '@codemirror/lang-sql'
import { javascript } from '@codemirror/lang-javascript'
import { Prec } from '@codemirror/state'
import { keymap } from '@codemirror/view'
import { format } from 'sql-formatter'
import { ChevronDown, Loader2, Play, Save, Sparkles, Wand2 } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/shared/components/ui/dropdown-menu'
import { ConfirmDialog } from '@/shared/components/ui/confirm-dialog'
import { useDbWorkspaceStore } from '../../stores/dbWorkspace.store'
import { buildSqlCompletionExtension } from '../../lib/sqlCompletion'
import { buildMongoCompletionExtension, mongoTemplates } from '../../lib/mongoCompletion'
import { useDbEditorTheme } from '../../theme/editorTheme'
import { useConnectionMeta } from '../../lib/providers'
import { ProviderBadge } from '../connections/ConnectionManagerPanel'

interface SqlQueryEditorProps {
  tabId: string
  connectionId: string
  initialSql?: string
}

const SQL_DIALECTS = {
  postgresql: PostgreSQL,
  mysql: MySQL,
  mariadb: MariaSQL,
  tsql: MSSQL,
  sqlite: SQLite
} as const

const IS_MAC = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform)

/** Statements that should be confirmed before running when the setting is on. */
function destructiveReason(text: string, isDocument: boolean): string | null {
  const cleaned = text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ')
  if (isDocument) {
    if (/\.(drop|dropDatabase)\s*\(/.test(cleaned)) return 'This drops a collection or database.'
    if (/\.deleteMany\s*\(\s*\{\s*\}\s*\)/.test(cleaned)) return 'deleteMany({}) removes every document in the collection.'
    if (/\.updateMany\s*\(\s*\{\s*\}\s*,/.test(cleaned)) return 'updateMany({}, …) modifies every document in the collection.'
    return null
  }
  if (/\b(DROP|TRUNCATE)\s+(TABLE|DATABASE|SCHEMA|VIEW)\b/i.test(cleaned)) return 'This statement drops or truncates objects.'
  const statements = cleaned.split(';')
  if (statements.some((s) => /^\s*(DELETE\s+FROM|UPDATE)\b/i.test(s) && !/\bWHERE\b/i.test(s))) {
    return 'An UPDATE or DELETE without a WHERE clause affects every row.'
  }
  return null
}

export function SqlQueryEditor({ tabId, connectionId, initialSql = '' }: SqlQueryEditorProps) {
  const [sqlText, setSqlText] = useState(initialSql)
  const [pendingRun, setPendingRun] = useState<{ text: string; reason: string } | null>(null)
  const editorAreaRef = useRef<HTMLDivElement>(null)
  const cmRef = useRef<ReactCodeMirrorRef>(null)
  const [editorHeight, setEditorHeight] = useState(400)

  const executeQuery = useDbWorkspaceStore((s) => s.executeQuery)
  const saveQuery = useDbWorkspaceStore((s) => s.saveQuery)
  const updateTab = useDbWorkspaceStore((s) => s.updateTab)
  const settings = useDbWorkspaceStore((s) => s.settings)
  const runAi = useDbWorkspaceStore((s) => s.runAi)
  const aiLoading = useDbWorkspaceStore((s) => s.aiLoading)
  const queryRunning = useDbWorkspaceStore((s) => s.queryRunning)
  const explorerTree = useDbWorkspaceStore((s) => s.explorerTree)
  const availableDatabases = useDbWorkspaceStore((s) => s.availableDatabases)
  const activeDatabase = useDbWorkspaceStore((s) => s.activeDatabase)
  const editorTheme = useDbEditorTheme(settings.editorTheme)
  const { connection, meta, isDocument } = useConnectionMeta(connectionId)

  useEffect(() => {
    updateTab(tabId, { sql: sqlText })
  }, [sqlText, tabId, updateTab])

  useEffect(() => {
    const el = editorAreaRef.current
    if (!el) return
    const updateSize = () => {
      const height = el.getBoundingClientRect().height
      if (height > 0) setEditorHeight(Math.floor(height))
    }
    updateSize()
    const observer = new ResizeObserver(updateSize)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  /** Run the selection when there is one, otherwise the whole editor. */
  const currentText = useCallback(() => {
    const view = cmRef.current?.view
    if (!view) return sqlText
    const { from, to } = view.state.selection.main
    const selected = from !== to ? view.state.sliceDoc(from, to) : ''
    return selected.trim() ? selected : view.state.doc.toString()
  }, [sqlText])

  const run = useCallback(
    (force = false) => {
      const text = currentText()
      if (!text.trim() || useDbWorkspaceStore.getState().queryRunning) return
      const reason = settings.confirmDestructiveQueries && !force ? destructiveReason(text, isDocument) : null
      if (reason) {
        setPendingRun({ text, reason })
        return
      }
      void executeQuery(connectionId, text)
    },
    [currentText, settings.confirmDestructiveQueries, isDocument, executeQuery, connectionId]
  )

  const runRef = useRef(run)
  runRef.current = run

  const extensions = useMemo(() => {
    const runKeymap = Prec.highest(
      keymap.of([
        {
          key: 'Mod-Enter',
          run: () => {
            runRef.current()
            return true
          }
        }
      ])
    )
    if (isDocument) return [javascript(), buildMongoCompletionExtension(explorerTree), runKeymap]
    const dialect = (meta.sqlDialect && SQL_DIALECTS[meta.sqlDialect]) || StandardSQL
    return [sql({ dialect, upperCaseKeywords: true }), buildSqlCompletionExtension(explorerTree, availableDatabases), runKeymap]
  }, [isDocument, meta.sqlDialect, explorerTree, availableDatabases])

  const handleFormat = () => {
    if (isDocument) {
      // Pretty-print JSON-ish arguments is unreliable for shell syntax; normalise whitespace only
      setSqlText((t) => t.replace(/\s+$/g, '').replace(/\)\s*\.\s*/g, ').'))
      return
    }
    try {
      const language = meta.sqlDialect ?? (settings.sqlFormatterDialect as 'postgresql' | 'mysql' | 'sqlite' | 'tsql')
      setSqlText(format(sqlText, { language, keywordCase: 'upper' }))
    } catch {
      // keep raw if format fails
    }
  }

  const handleSave = () => {
    if (!sqlText.trim()) return
    const name = window.prompt('Saved query name', 'Untitled query')
    if (name == null) return
    void saveQuery({ name, sql: sqlText, connectionId })
  }

  const collectionNames = useMemo(() => {
    if (!isDocument) return []
    const names: string[] = []
    const walk = (nodes: typeof explorerTree) => {
      for (const n of nodes) {
        if ((n.type === 'collection' || n.type === 'view') && n.table) names.push(n.table)
        if (n.children) walk(n.children)
      }
    }
    walk(explorerTree)
    return names
  }, [isDocument, explorerTree])

  const guessCollection = () => {
    const match = sqlText.match(/\bdb\.([A-Za-z_$][\w$]*)\./) ?? sqlText.match(/getCollection\(["'`](.+?)["'`]\)/)
    return match?.[1] ?? collectionNames[0] ?? 'collection'
  }

  const insertTemplate = (query: string) => {
    setSqlText((t) => (t.trim() ? `${t.replace(/\s+$/, '')}\n\n${query}` : query))
  }

  return (
    <div className="flex h-full w-full min-h-0 min-w-0 flex-col bg-background">
      <div className="flex h-8 shrink-0 items-center gap-1 border-b border-border bg-muted/10 px-1.5">
        <Button size="sm" className="h-6 px-2.5 text-[11px]" onClick={() => run()} disabled={queryRunning || !sqlText.trim()}>
          {queryRunning ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Play className="mr-1 h-3 w-3" />}
          Run
        </Button>
        {isDocument ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="h-6 px-2 text-[11px]">
                Templates <ChevronDown className="ml-1 h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuLabel className="text-[11px]">For {guessCollection()}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {mongoTemplates(guessCollection()).map((t) => (
                <DropdownMenuItem key={t.label} onSelect={() => insertTemplate(t.query)} className="text-xs">
                  {t.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Button size="sm" variant="outline" className="h-6 px-2 text-[11px]" onClick={handleFormat}>
            <Wand2 className="mr-1 h-3 w-3" /> Format
          </Button>
        )}
        <Button size="sm" variant="outline" className="h-6 px-2 text-[11px]" disabled={!sqlText.trim()} onClick={handleSave}>
          <Save className="mr-1 h-3 w-3" /> Save
        </Button>
        <div className="mx-0.5 h-4 w-px bg-border" />
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-[11px]"
          disabled={aiLoading || !sqlText.trim()}
          onClick={() => void runAi(connectionId, 'explain_query', { sql: sqlText })}
        >
          <Sparkles className="mr-1 h-3 w-3" /> Explain
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-[11px]"
          disabled={aiLoading || !sqlText.trim()}
          onClick={() => void runAi(connectionId, 'optimize_query', { sql: sqlText })}
        >
          <Sparkles className="mr-1 h-3 w-3" /> Optimize
        </Button>
        <div className="ml-auto flex min-w-0 items-center gap-2 text-[10px] text-muted-foreground">
          {connection && (
            <span className="flex min-w-0 items-center gap-1 truncate" title={`${connection.name} · ${meta.label}`}>
              <ProviderBadge provider={connection.provider} className="h-4 w-4 rounded text-[8px]" />
              <span className="truncate">
                {connection.name}
                {activeDatabase ? ` / ${activeDatabase}` : ''}
              </span>
            </span>
          )}
          <kbd className="hidden shrink-0 rounded border border-border px-1 py-px font-mono sm:inline">
            {IS_MAC ? '⌘' : 'Ctrl'}+Enter
          </kbd>
        </div>
      </div>

      <div ref={editorAreaRef} className="relative min-h-0 min-w-0 flex-1 overflow-hidden bg-background">
        {!sqlText && (
          <div className="pointer-events-none absolute left-12 top-2 z-10 text-xs text-muted-foreground/60">
            {isDocument
              ? `db.${collectionNames[0] ?? 'collection'}.find({ }).limit(50)`
              : 'SELECT … — run the selection or whole editor'}
          </div>
        )}
        <CodeMirror
          ref={cmRef}
          value={sqlText}
          height={`${editorHeight}px`}
          theme={editorTheme}
          extensions={extensions}
          onChange={setSqlText}
          basicSetup={{ lineNumbers: true, foldGutter: true, autocompletion: true }}
          className="h-full w-full [&_.cm-editor]:h-full [&_.cm-editor]:w-full [&_.cm-editor]:bg-transparent [&_.cm-editor]:outline-none [&_.cm-gutters]:border-r [&_.cm-gutters]:border-border/50 [&_.cm-gutters]:bg-transparent [&_.cm-scroller]:min-h-full [&_.cm-scroller]:bg-transparent"
          style={{
            height: `${editorHeight}px`,
            width: '100%',
            fontSize: settings.editorFontSize
          }}
        />
      </div>

      <ConfirmDialog
        open={pendingRun != null}
        onOpenChange={(open) => !open && setPendingRun(null)}
        title="Run destructive query?"
        description={pendingRun?.reason}
        confirmLabel="Run anyway"
        variant="destructive"
        onConfirm={() => {
          const text = pendingRun?.text
          setPendingRun(null)
          if (text) void executeQuery(connectionId, text)
        }}
      />
    </div>
  )
}
