import { useEffect, useMemo, useState } from 'react'
import { FileCode2, Folder, Globe } from 'lucide-react'
import { applyMention, filterSpecialMentions, mentionQueryAt } from '@shared/lib/editor-ai'
import type { AgentFileRef } from '@shared/types/agent'
import type { FileSearchHit } from '@shared/types/code-editor'
import { cn } from '@/shared/lib/utils'

export interface MentionTarget {
  id: string
  label: string
  hint?: string
  file?: AgentFileRef
}

interface MentionMenuProps {
  draft: string
  cursor: number
  openTabs: Array<{ path: string; name: string }>
  onApply: (next: { text: string; cursor: number; file?: AgentFileRef }) => void
  onClose: () => void
}

export function MentionMenu({ draft, cursor, openTabs, onApply, onClose }: MentionMenuProps) {
  const mention = mentionQueryAt(draft, cursor)
  const query = mention?.query ?? ''
  const [hits, setHits] = useState<FileSearchHit[]>([])
  const [active, setActive] = useState(0)

  useEffect(() => {
    if (!mention) {
      setHits([])
      return
    }
    if (!query.trim()) {
      setHits([])
      return
    }
    const timer = window.setTimeout(() => {
      void window.electronAPI?.codeEditor?.searchFiles?.(query).then((result) => {
        if (result?.success) setHits(result.data ?? [])
      })
    }, 180)
    return () => window.clearTimeout(timer)
  }, [mention?.start, query, mention])

  const items = useMemo<MentionTarget[]>(() => {
    if (!mention) return []
    const q = query.trim().toLowerCase()
    const specials: MentionTarget[] = filterSpecialMentions(query).map((item) => ({
      id: `special:${item.id}`,
      label: item.label,
      hint: item.hint
    }))
    const tabs: MentionTarget[] = openTabs
      .filter((tab) => !q || tab.name.toLowerCase().includes(q) || tab.path.toLowerCase().includes(q))
      .slice(0, 8)
      .map((tab) => ({
        id: `tab:${tab.path}`,
        label: `@${tab.name}`,
        hint: 'Open',
        file: { path: tab.path, name: tab.name, kind: 'file' }
      }))
    const files: MentionTarget[] = hits.slice(0, 10).map((hit) => ({
      id: `file:${hit.path}`,
      label: `@${hit.relativePath || hit.name}`,
      hint: hit.relativePath,
      file: { path: hit.path, name: hit.name, kind: 'file' }
    }))
    const seen = new Set<string>()
    const merged: MentionTarget[] = []
    for (const item of [...specials, ...tabs, ...files]) {
      if (seen.has(item.id)) continue
      seen.add(item.id)
      merged.push(item)
    }
    return merged
  }, [mention, query, openTabs, hits])

  useEffect(() => {
    setActive(0)
  }, [items.length, query])

  useEffect(() => {
    if (!mention || items.length === 0) return
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        event.stopPropagation()
        setActive((value) => (value + 1) % items.length)
      } else if (event.key === 'ArrowUp') {
        event.preventDefault()
        event.stopPropagation()
        setActive((value) => (value - 1 + items.length) % items.length)
      } else if (event.key === 'Enter' || event.key === 'Tab') {
        const item = items[active]
        if (!item) return
        event.preventDefault()
        event.stopPropagation()
        const next = applyMention(draft, mention, item.label, cursor)
        onApply({ ...next, file: item.file })
      } else if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [mention, items, active, draft, cursor, onApply, onClose])

  if (!mention || items.length === 0) return null

  return (
    <div className="absolute bottom-full left-0 right-0 z-20 mb-1 overflow-hidden rounded-md border border-[var(--wb-border)] bg-[var(--wb-sidebar)] shadow-lg">
      <p className="px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">Add context</p>
      <ul className="max-h-48 overflow-auto py-0.5">
        {items.map((item, index) => (
          <li key={item.id}>
            <button
              type="button"
              className={cn(
                'flex w-full items-center gap-1.5 px-2 py-1.5 text-left text-[12px]',
                index === active ? 'bg-[var(--wb-hover)]' : 'hover:bg-[var(--wb-hover)]'
              )}
              onMouseEnter={() => setActive(index)}
              onClick={() => {
                const next = applyMention(draft, mention, item.label, cursor)
                onApply({ ...next, file: item.file })
              }}
            >
              {item.id.startsWith('special:') ? (
                <Globe className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              ) : item.file?.kind === 'folder' ? (
                <Folder className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              ) : (
                <FileCode2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              )}
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              {item.hint ? (
                <span className="max-w-[40%] shrink-0 truncate text-[10px] text-muted-foreground">{item.hint}</span>
              ) : null}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
