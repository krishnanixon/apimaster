import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, Replace, X } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { useCodeEditorStore } from '../stores/codeEditor.store'

interface SearchReplaceBarProps {
  onClose: () => void
  replaceMode: boolean
  onReveal: (from: number, to: number) => void
}

function findMatches(content: string, query: string, caseSensitive: boolean): Array<{ from: number; to: number }> {
  if (!query) return []
  const haystack = caseSensitive ? content : content.toLowerCase()
  const needle = caseSensitive ? query : query.toLowerCase()
  const matches: Array<{ from: number; to: number }> = []
  let index = 0
  while (index <= haystack.length) {
    const found = haystack.indexOf(needle, index)
    if (found === -1) break
    matches.push({ from: found, to: found + query.length })
    index = found + Math.max(query.length, 1)
    if (matches.length > 2000) break
  }
  return matches
}

export function SearchReplaceBar({ onClose, replaceMode, onReveal }: SearchReplaceBarProps) {
  const tab = useCodeEditorStore((s) => s.tabs.find((t) => t.path === s.activeTabPath))
  const updateTabContent = useCodeEditorStore((s) => s.updateTabContent)
  const [query, setQuery] = useState('')
  const [replacement, setReplacement] = useState('')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [active, setActive] = useState(0)

  const matches = useMemo(
    () => (tab ? findMatches(tab.content, query, caseSensitive) : []),
    [tab?.content, query, caseSensitive]
  )

  useEffect(() => {
    setActive(0)
  }, [query, tab?.path, caseSensitive])

  useEffect(() => {
    const match = matches[active]
    if (match) onReveal(match.from, match.to)
  }, [active, matches, onReveal])

  if (!tab) return null

  const go = (delta: number) => {
    if (matches.length === 0) return
    setActive((current) => (current + delta + matches.length) % matches.length)
  }

  const replaceOne = () => {
    const match = matches[active]
    if (!match) return
    const next = tab.content.slice(0, match.from) + replacement + tab.content.slice(match.to)
    updateTabContent(tab.path, next)
  }

  const replaceAll = () => {
    if (!query) return
    const flags = caseSensitive ? 'g' : 'gi'
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    updateTabContent(tab.path, tab.content.replace(new RegExp(escaped, flags), replacement))
  }

  return (
    <div className="flex shrink-0 flex-col gap-1 border-b border-[var(--wb-border)] bg-[var(--wb-sidebar)] px-2 py-1">
      <div className="flex items-center gap-1.5">
        <Input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find"
          className="h-6 text-[12px]"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              go(e.shiftKey ? -1 : 1)
            }
            if (e.key === 'Escape') onClose()
          }}
        />
        <span className="shrink-0 text-[11px] text-muted-foreground">
          {matches.length === 0 ? 'No results' : `${active + 1}/${matches.length}`}
        </span>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => go(-1)} title="Previous">
          <ChevronUp className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => go(1)} title="Next">
          <ChevronDown className="h-3.5 w-3.5" />
        </Button>
        <label className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
          <input
            type="checkbox"
            checked={caseSensitive}
            onChange={(e) => setCaseSensitive(e.target.checked)}
          />
          Aa
        </label>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
      {replaceMode && (
        <div className="flex items-center gap-1.5">
          <Input
            value={replacement}
            onChange={(e) => setReplacement(e.target.value)}
            placeholder="Replace"
            className="h-6 text-[12px]"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                replaceOne()
              }
              if (e.key === 'Escape') onClose()
            }}
          />
          <Button variant="ghost" size="sm" className="h-6" onClick={replaceOne}>
            <Replace className="h-3.5 w-3.5" /> Replace
          </Button>
          <Button variant="ghost" size="sm" className="h-6" onClick={replaceAll}>
            All
          </Button>
        </div>
      )}
    </div>
  )
}
