import { useEffect, useRef, useState } from 'react'
import { Circle, Code2, Copy, Pencil, Plus, X } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger
} from '@/shared/components/ui/context-menu'
import { useApiStudioStore } from '../stores/apiStudioStore'
import { METHOD_COLORS, requestProtocolLabel } from '../types/api.types'
import { ConfirmDialog } from './ConfirmDialog'
import { RequestExportDialog } from './RequestExportDialog'

const METHOD_BG: Record<string, string> = {
  GET: 'bg-emerald-500/15',
  POST: 'bg-amber-500/15',
  PUT: 'bg-blue-500/15',
  PATCH: 'bg-purple-500/15',
  DELETE: 'bg-red-500/15',
  HEAD: 'bg-slate-500/15',
  OPTIONS: 'bg-slate-500/15'
}

export function RequestTabBar() {
  const tabs = useApiStudioStore((s) => s.tabs)
  const activeTabId = useApiStudioStore((s) => s.activeTabId)
  const setActiveTab = useApiStudioStore((s) => s.setActiveTab)
  const closeTab = useApiStudioStore((s) => s.closeTab)
  const closeOtherTabs = useApiStudioStore((s) => s.closeOtherTabs)
  const closeTabsToRight = useApiStudioStore((s) => s.closeTabsToRight)
  const duplicateTab = useApiStudioStore((s) => s.duplicateTab)
  const copyTabAsCurl = useApiStudioStore((s) => s.copyTabAsCurl)
  const openScratchTab = useApiStudioStore((s) => s.openScratchTab)
  const updateDraft = useApiStudioStore((s) => s.updateDraft)
  const renameRequest = useApiStudioStore((s) => s.renameRequest)

  const [editingTabId, setEditingTabId] = useState<string | null>(null)
  const [nameDraft, setNameDraft] = useState('')
  const [pendingCloseId, setPendingCloseId] = useState<string | null>(null)
  const [exportTabId, setExportTabId] = useState<string | null>(null)
  const [dragTabId, setDragTabId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<{ id: string; position: 'before' | 'after' } | null>(null)
  const moveTab = useApiStudioStore((s) => s.moveTab)
  const stripRef = useRef<HTMLDivElement>(null)
  const collections = useApiStudioStore((s) => s.collections)
  const exportTab = tabs.find((t) => t.id === exportTabId) ?? null
  const inputRef = useRef<HTMLInputElement>(null)

  // Keep the active tab in view (the strip has no visible scrollbar).
  useEffect(() => {
    stripRef.current
      ?.querySelector<HTMLElement>(`[data-tab-id="${activeTabId}"]`)
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [activeTabId, tabs.length])

  // A vertical mouse wheel scrolls the tab strip sideways.
  useEffect(() => {
    const el = stripRef.current
    if (!el) return
    function onWheel(e: WheelEvent) {
      if (!el || Math.abs(e.deltaY) <= Math.abs(e.deltaX) || el.scrollWidth <= el.clientWidth) return
      e.preventDefault()
      el.scrollLeft += e.deltaY
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  function endDrag() {
    setDragTabId(null)
    setDropTarget(null)
  }

  useEffect(() => {
    if (!editingTabId) return
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [editingTabId])

  function startRename(tabId: string, currentName: string) {
    setEditingTabId(tabId)
    setNameDraft(currentName)
  }

  function commitRename(tabId: string) {
    const tab = tabs.find((t) => t.id === tabId)
    setEditingTabId(null)
    if (!tab) return
    const next = nameDraft.trim() || 'Untitled Request'
    if (next === tab.request.name) return
    if (tab.collectionId) renameRequest(tab.collectionId, tab.request.id, next)
    else updateDraft(tabId, { name: next })
  }

  function requestClose(tabId: string) {
    const tab = tabs.find((t) => t.id === tabId)
    if (tab?.dirty) setPendingCloseId(tabId)
    else closeTab(tabId)
  }

  return (
    <>
    <div ref={stripRef} className="scrollbar-none flex h-8 shrink-0 items-stretch overflow-x-auto border-b border-border/60 bg-muted/25">
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId
        const method = requestProtocolLabel(tab.request)
        const isEditing = editingTabId === tab.id
        return (
          <ContextMenu key={tab.id}>
            <ContextMenuTrigger asChild>
              <div
                data-tab-id={tab.id}
                draggable={!isEditing}
                onDragStart={(e) => {
                  setDragTabId(tab.id)
                  e.dataTransfer.effectAllowed = 'move'
                  e.dataTransfer.setData('application/x-shurikly-tab', tab.id)
                }}
                onDragOver={(e) => {
                  if (!dragTabId) return
                  e.preventDefault()
                  e.dataTransfer.dropEffect = 'move'
                  const rect = e.currentTarget.getBoundingClientRect()
                  const position = e.clientX < rect.left + rect.width / 2 ? 'before' : 'after'
                  if (dropTarget?.id !== tab.id || dropTarget.position !== position) setDropTarget({ id: tab.id, position })
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  if (dragTabId && dropTarget) moveTab(dragTabId, dropTarget.id, dropTarget.position)
                  endDrag()
                }}
                onDragEnd={endDrag}
                onClick={() => {
                  if (!isEditing) setActiveTab(tab.id)
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation()
                  startRename(tab.id, tab.request.name)
                }}
                onMouseDown={(e) => {
                  if (e.button === 1) {
                    e.preventDefault()
                    requestClose(tab.id)
                  }
                }}
                className={cn(
                  'group relative flex max-w-[220px] shrink-0 cursor-pointer items-center gap-1.5 border-r border-border/40 px-2 text-xs transition-colors',
                  dragTabId === tab.id && 'opacity-50',
                  dropTarget?.id === tab.id && dragTabId !== tab.id &&
                    (dropTarget.position === 'before'
                      ? 'before:absolute before:inset-y-1 before:left-0 before:w-0.5 before:rounded-full before:bg-primary'
                      : 'after:absolute after:inset-y-1 after:right-0 after:w-0.5 after:rounded-full after:bg-primary'),
                  isActive
                    ? 'bg-background text-foreground'
                    : 'text-muted-foreground hover:bg-background/60 hover:text-foreground'
                )}
                title={isEditing ? undefined : tab.request.url || tab.request.name}
              >
                <span
                  className={cn(
                    'shrink-0 rounded px-1 py-px text-[10px] font-bold leading-none',
                    METHOD_BG[tab.request.method] ?? 'bg-muted',
                    METHOD_COLORS[tab.request.method]
                  )}
                >
                  {method}
                </span>
                {isEditing ? (
                  <input
                    ref={inputRef}
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    onBlur={() => commitRename(tab.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        commitRename(tab.id)
                      } else if (e.key === 'Escape') {
                        e.preventDefault()
                        setEditingTabId(null)
                      }
                    }}
                    className="min-w-0 flex-1 rounded border border-border bg-background px-1 py-px text-xs text-foreground outline-none ring-1 ring-ring"
                    aria-label="Rename request"
                  />
                ) : (
                  <span className="min-w-0 truncate">{tab.request.name}</span>
                )}
                {!isEditing && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      requestClose(tab.id)
                    }}
                    className="flex h-4 w-4 shrink-0 items-center justify-center rounded opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100"
                  >
                    {tab.dirty ? (
                      <Circle className="h-1.5 w-1.5 fill-current group-hover:hidden" />
                    ) : null}
                    <X className={cn('h-3 w-3', tab.dirty && 'hidden group-hover:block')} />
                  </button>
                )}
              </div>
            </ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem onSelect={() => startRename(tab.id, tab.request.name)}>
                <Pencil className="h-3.5 w-3.5" /> Rename
              </ContextMenuItem>
              <ContextMenuItem onSelect={() => duplicateTab(tab.id)}>Duplicate tab</ContextMenuItem>
              <ContextMenuItem onSelect={() => void copyTabAsCurl(tab.id)}>
                <Copy className="h-3.5 w-3.5" /> Copy as cURL
              </ContextMenuItem>
              <ContextMenuItem onSelect={() => setExportTabId(tab.id)}>
                <Code2 className="h-3.5 w-3.5" /> Export…
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem onSelect={() => requestClose(tab.id)}>Close</ContextMenuItem>
              <ContextMenuItem onSelect={() => closeOtherTabs(tab.id)}>Close others</ContextMenuItem>
              <ContextMenuItem onSelect={() => closeTabsToRight(tab.id)}>Close to the right</ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        )
      })}
      <button
        type="button"
        onClick={() => openScratchTab()}
        className="flex shrink-0 items-center px-2.5 text-muted-foreground transition-colors hover:bg-background/60 hover:text-foreground"
        title="New request (Ctrl+T)"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
    <ConfirmDialog
      open={pendingCloseId !== null}
      onOpenChange={(open) => !open && setPendingCloseId(null)}
      title="Discard unsaved changes?"
      description="This request has unsaved edits. Closing the tab will lose them."
      confirmLabel="Discard"
      onConfirm={() => {
        if (pendingCloseId) closeTab(pendingCloseId)
        setPendingCloseId(null)
      }}
    />
    <RequestExportDialog
      open={exportTab !== null}
      onOpenChange={(open) => !open && setExportTabId(null)}
      request={exportTab?.request ?? null}
      collection={exportTab?.collectionId ? collections.find((c) => c.id === exportTab.collectionId) : null}
    />
    </>
  )
}
