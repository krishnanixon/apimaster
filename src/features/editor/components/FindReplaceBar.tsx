import { useEffect, useMemo, useState } from 'react'
import type { Editor } from '@tiptap/react'
import { ChevronDown, ChevronUp, Replace, Search, X } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { collectTextMatches, findNextInEditor, replaceInEditor, type FindOptions } from '@/features/editor/lib/find-replace'
import { WordScreenTip } from '@/features/editor/components/WordScreenTip'
import { toast } from 'sonner'

export function FindReplaceBar({ editor, open, onClose }: { editor: Editor; open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState('')
  const [replacement, setReplacement] = useState('')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [wholeWord, setWholeWord] = useState(false)
  const [regex, setRegex] = useState(false)

  const options: FindOptions = useMemo(
    () => ({ caseSensitive, wholeWord, regex }),
    [caseSensitive, wholeWord, regex]
  )
  const matchCount = useMemo(
    () => (open && query.trim() ? collectTextMatches(editor, query, options).length : 0),
    [editor, open, options, query]
  )

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const find = (direction: 'next' | 'previous') => {
    const found = findNextInEditor(editor, query, options, direction)
    if (!found) toast.info('No match found')
  }

  const replaceOnce = () => {
    const n = replaceInEditor(editor, query, replacement, false, options)
    toast[n ? 'success' : 'info'](n ? 'Replaced 1 match' : 'No match found')
  }

  const replaceAll = () => {
    const n = replaceInEditor(editor, query, replacement, true, options)
    toast[n ? 'success' : 'info'](n ? `Replaced ${n} matches` : 'No match found')
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b border-border/70 bg-muted/30 px-2.5 py-1.5">
      <Search className="h-3.5 w-3.5 text-muted-foreground" />
      <Input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Find"
        className="h-7 w-36 text-xs"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && e.shiftKey) {
            e.preventDefault()
            find('previous')
          } else if (e.key === 'Enter') {
            e.preventDefault()
            find('next')
          }
        }}
      />
      <span className="min-w-[3rem] text-[10px] tabular-nums text-muted-foreground">
        {query.trim() ? `${matchCount} match${matchCount === 1 ? '' : 'es'}` : ''}
      </span>
      <WordScreenTip label="Find Previous" shortcut="Shift+Enter" description="Go to the previous match.">
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => find('previous')} aria-label="Previous">
          <ChevronUp className="h-3.5 w-3.5" />
        </Button>
      </WordScreenTip>
      <WordScreenTip label="Find Next" shortcut="Enter" description="Go to the next match.">
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => find('next')} aria-label="Next">
          <ChevronDown className="h-3.5 w-3.5" />
        </Button>
      </WordScreenTip>
      <Replace className="h-3.5 w-3.5 text-muted-foreground" />
      <Input
        value={replacement}
        onChange={(e) => setReplacement(e.target.value)}
        placeholder="Replace"
        className="h-7 w-36 text-xs"
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            replaceOnce()
          }
        }}
      />
      <WordScreenTip label="Replace" description="Replace the current match and find the next one.">
        <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-[11px]" onClick={replaceOnce}>
          Replace
        </Button>
      </WordScreenTip>
      <WordScreenTip label="Replace All" description="Replace every match in the document.">
        <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-[11px]" onClick={replaceAll}>
          All
        </Button>
      </WordScreenTip>
      <WordScreenTip label="Match Case" description="Find text that matches the capitalization of your search.">
        <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <input type="checkbox" checked={caseSensitive} onChange={(e) => setCaseSensitive(e.target.checked)} />
          Aa
        </label>
      </WordScreenTip>
      <WordScreenTip label="Find Whole Words Only" description="Find whole words only, not parts of other words.">
        <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <input type="checkbox" checked={wholeWord} onChange={(e) => setWholeWord(e.target.checked)} />
          Word
        </label>
      </WordScreenTip>
      <WordScreenTip label="Use Wildcards" description="Treat the search as a regular expression.">
        <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <input type="checkbox" checked={regex} onChange={(e) => setRegex(e.target.checked)} />
          .*
        </label>
      </WordScreenTip>
      <WordScreenTip label="Close" shortcut="Esc" description="Close Find and Replace.">
        <Button type="button" variant="ghost" size="icon" className="ml-auto h-7 w-7" onClick={onClose} aria-label="Close">
          <X className="h-3.5 w-3.5" />
        </Button>
      </WordScreenTip>
    </div>
  )
}
