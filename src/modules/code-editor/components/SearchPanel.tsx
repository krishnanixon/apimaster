import { useEffect, useState } from 'react'
import { Replace } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { cn } from '@/shared/lib/utils'
import { useCodeEditorStore } from '../stores/codeEditor.store'
import { useCodeIndexStore } from '../stores/codeIndex.store'
import type { CodeSearchHit, CodeSearchMode } from '@shared/types/code-intel'
import { ConfirmDialog } from './ConfirmDialog'

const MODES: Array<{ id: CodeSearchMode; label: string }> = [
  { id: 'text', label: 'Text' },
  { id: 'regex', label: 'Regex' },
  { id: 'symbol', label: 'Symbol' }
]

function HitRow({ hit, onOpen }: { hit: CodeSearchHit; onOpen: (hit: CodeSearchHit) => void }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(hit)}
      className="block w-full border-b border-[var(--wb-border)] px-3 py-1.5 text-left hover:bg-[var(--wb-hover)]"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate font-mono text-[11px] text-foreground">
          {hit.name ?? hit.relativePath}
        </span>
        <span className="shrink-0 text-[10px] text-muted-foreground">:{hit.startLine}</span>
      </div>
      <p className="truncate text-[10px] text-muted-foreground">{hit.relativePath}</p>
      {hit.snippet ? (
        <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">{hit.snippet}</p>
      ) : null}
    </button>
  )
}

export function SearchPanel() {
  const query = useCodeIndexStore((s) => s.query)
  const mode = useCodeIndexStore((s) => s.mode)
  const hits = useCodeIndexStore((s) => s.hits)
  const searching = useCodeIndexStore((s) => s.searching)
  const error = useCodeIndexStore((s) => s.error)
  const setQuery = useCodeIndexStore((s) => s.setQuery)
  const setMode = useCodeIndexStore((s) => s.setMode)
  const search = useCodeIndexStore((s) => s.search)
  const openFileAtLine = useCodeEditorStore((s) => s.openFileAtLine)
  const replaceInFiles = useCodeEditorStore((s) => s.replaceInFiles)
  const [draft, setDraft] = useState(query)
  const [replacement, setReplacement] = useState('')
  const [confirmReplace, setConfirmReplace] = useState(false)
  const [replacing, setReplacing] = useState(false)

  const canReplace = mode === 'text' || mode === 'regex'
  const fileCount = new Set(hits.map((hit) => hit.path)).size
  const [hitLimit, setHitLimit] = useState(150)
  const visibleHits = hits.slice(0, hitLimit)

  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(draft), 250)
    return () => window.clearTimeout(timer)
  }, [draft, setQuery])

  useEffect(() => {
    void search()
  }, [query, mode, search])

  const runReplace = async () => {
    if (!query.trim() || hits.length === 0) return
    setReplacing(true)
    const result = await replaceInFiles({
      query,
      replacement,
      regex: mode === 'regex',
      paths: hits.map((hit) => hit.path)
    })
    setReplacing(false)
    setConfirmReplace(false)
    toast.success(`Replaced ${result.replacements} occurrence(s) in ${result.files} file(s)`)
    void search()
  }

  return (
    <div className="flex h-full min-h-0 flex-col text-[12px]">
      <div className="flex shrink-0 flex-col gap-1.5 border-b border-[var(--wb-border)] px-2 py-1.5">
        <Input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              setQuery(draft)
              void search()
            }
          }}
          placeholder={mode === 'regex' ? 'Regular expression' : mode === 'symbol' ? 'Symbol name' : 'Search workspace'}
          className="h-6 text-[12px]"
        />
        {canReplace ? (
          <Input
            value={replacement}
            onChange={(e) => setReplacement(e.target.value)}
            placeholder="Replace"
            className="h-6 text-[12px]"
          />
        ) : null}
        <div className="flex gap-1">
          {MODES.map((item) => (
            <Button
              key={item.id}
              type="button"
              size="sm"
              variant={mode === item.id ? 'secondary' : 'ghost'}
              className={cn('h-6 flex-1 px-1 text-[10px]', mode === item.id && 'font-medium')}
              onClick={() => setMode(item.id)}
            >
              {item.label}
            </Button>
          ))}
        </div>
        {canReplace ? (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-[11px]"
            disabled={!query.trim() || hits.length === 0 || replacing}
            onClick={() => setConfirmReplace(true)}
          >
            <Replace className="h-3 w-3" />
            Replace in {fileCount} file{fileCount === 1 ? '' : 's'}
          </Button>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {error ? <p className="px-3 py-2 text-xs text-destructive">{error}</p> : null}
        {searching ? <p className="px-3 py-2 text-xs text-muted-foreground">Searching…</p> : null}
        {!searching && !error && query.trim() && hits.length === 0 ? (
          <p className="px-3 py-2 text-xs text-muted-foreground">No matches.</p>
        ) : null}
        {!query.trim() ? (
          <p className="px-3 py-2 text-xs text-muted-foreground">
            Search indexed files. Use Replace to write across the workspace.
          </p>
        ) : (
          <>
            {visibleHits.map((hit) => (
              <HitRow
                key={`${hit.path}:${hit.startLine}:${hit.name ?? hit.snippet}`}
                hit={hit}
                onOpen={(item) => void openFileAtLine(item.path, item.startLine)}
              />
            ))}
            {hits.length > hitLimit ? (
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-[11px] text-[var(--wb-accent)] hover:bg-[var(--wb-hover)]"
                onClick={() => setHitLimit((value) => value + 150)}
              >
                Show more ({hits.length - hitLimit} remaining)
              </button>
            ) : null}
          </>
        )}
      </div>
      {hits.length > 0 ? (
        <div className="border-t border-[var(--wb-border)] px-2 py-1 text-[10px] text-[var(--wb-muted)]">
          {hits.length} results · {fileCount} file{fileCount === 1 ? '' : 's'}
        </div>
      ) : null}
      <ConfirmDialog
        open={confirmReplace}
        onOpenChange={setConfirmReplace}
        title="Replace in files?"
        description={`Replace all matches of “${query}” in ${fileCount} file(s). Open dirty files stay unsaved until you save them.`}
        confirmLabel="Replace all"
        onConfirm={() => void runReplace()}
      />
    </div>
  )
}
