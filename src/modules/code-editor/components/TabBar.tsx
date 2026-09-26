import { memo, useMemo, useState } from 'react'
import { Circle, Columns2, Pin, PinOff, X } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { toast } from 'sonner'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger
} from '@/shared/components/ui/context-menu'
import { useCodeEditorStore } from '../stores/codeEditor.store'
import { useWorkbenchLayoutStore } from '../stores/workbench.store'
import { ConfirmDialog } from './ConfirmDialog'
import { fileIconFor } from '../lib/file-icons'
import { relativeTo } from '../lib/paths'

type TabMeta = {
  path: string
  name: string
  dirty: boolean
  pinned: boolean
}

export function TabBar() {
  const tabRecords = useCodeEditorStore((s) => s.tabs)
  const tabs = useMemo<TabMeta[]>(
    () =>
      tabRecords.map((t) => ({
        path: t.path,
        name: t.name,
        dirty: t.dirty,
        pinned: t.pinned
      })),
    [tabRecords]
  )
  const activeTabPath = useCodeEditorStore((s) => s.activeTabPath)
  const setActiveTab = useCodeEditorStore((s) => s.setActiveTab)
  const closeTab = useCodeEditorStore((s) => s.closeTab)
  const editorPanes = useCodeEditorStore((s) => s.editorPanes)
  const toggleSplit = useCodeEditorStore((s) => s.toggleSplit)
  const [pendingCloseDirty, setPendingCloseDirty] = useState<string | null>(null)
  const [dragPath, setDragPath] = useState<string | null>(null)

  const requestClose = (path: string, dirty: boolean) => {
    if (dirty) setPendingCloseDirty(path)
    else closeTab(path)
  }

  return (
    <div className="wb-glass-chrome wb-editor-tabs flex h-8 shrink-0 items-stretch overflow-x-auto border-b border-[var(--wb-border)] bg-[var(--wb-tabbar)]">
      {tabs.map((tab) => (
        <EditorTabItem
          key={tab.path}
          tab={tab}
          active={tab.path === activeTabPath}
          dragging={dragPath === tab.path}
          onActivate={() => setActiveTab(tab.path)}
          onClose={() => requestClose(tab.path, tab.dirty)}
          onDragStart={() => setDragPath(tab.path)}
          onDragEnd={() => setDragPath(null)}
        />
      ))}

      <button
        type="button"
        title="Split editor (Ctrl+\\) — up to 3 groups"
        onClick={toggleSplit}
        className={cn(
          'ml-auto flex h-full shrink-0 items-center px-2 text-[var(--wb-muted)] hover:bg-[var(--wb-hover)] hover:text-[var(--wb-fg)]',
          editorPanes.length > 1 && 'text-primary'
        )}
      >
        <Columns2 className="h-3.5 w-3.5" />
      </button>

      <ConfirmDialog
        open={!!pendingCloseDirty}
        onOpenChange={(open) => !open && setPendingCloseDirty(null)}
        title="Discard unsaved changes?"
        description="This file has unsaved changes. Closing it will discard them."
        confirmLabel="Discard"
        variant="destructive"
        onConfirm={() => {
          if (pendingCloseDirty) closeTab(pendingCloseDirty)
        }}
      />
    </div>
  )
}

const EditorTabItem = memo(function EditorTabItem({
  tab,
  active,
  dragging,
  onActivate,
  onClose,
  onDragStart,
  onDragEnd
}: {
  tab: TabMeta
  active: boolean
  dragging: boolean
  onActivate: () => void
  onClose: () => void
  onDragStart: () => void
  onDragEnd: () => void
}) {
  const moveTab = useCodeEditorStore((s) => s.moveTab)
  const closeOtherTabs = useCodeEditorStore((s) => s.closeOtherTabs)
  const closeAllTabs = useCodeEditorStore((s) => s.closeAllTabs)
  const closeSavedTabs = useCodeEditorStore((s) => s.closeSavedTabs)
  const togglePinTab = useCodeEditorStore((s) => s.togglePinTab)
  const splitRight = useCodeEditorStore((s) => s.splitRight)
  const revealPathInTree = useCodeEditorStore((s) => s.revealPathInTree)
  const rootPath = useCodeEditorStore((s) => s.rootPath)
  const setLeftTab = useWorkbenchLayoutStore((s) => s.setLeftTab)
  const spec = fileIconFor(tab.path)
  const Icon = spec.icon

  const copyPath = async (relative: boolean) => {
    const text = relative ? relativeTo(rootPath, tab.path) : tab.path
    await navigator.clipboard.writeText(text)
    toast.success(relative ? 'Relative path copied' : 'Path copied')
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          draggable
          onDragStart={(event) => {
            event.dataTransfer.effectAllowed = 'move'
            event.dataTransfer.setData('text/plain', tab.path)
            onDragStart()
          }}
          onDragOver={(event) => {
            event.preventDefault()
            event.dataTransfer.dropEffect = 'move'
          }}
          onDrop={(event) => {
            event.preventDefault()
            const from = event.dataTransfer.getData('text/plain')
            if (from) moveTab(from, tab.path)
            onDragEnd()
          }}
          onDragEnd={onDragEnd}
          onClick={onActivate}
          onAuxClick={(event) => {
            if (event.button === 1) {
              event.preventDefault()
              onClose()
            }
          }}
          onDoubleClick={() => togglePinTab(tab.path)}
          className={cn(
            'group relative flex h-8 shrink-0 cursor-pointer items-center gap-1.5 border-r border-[var(--wb-border)] px-2.5 text-[11.5px]',
            active
              ? 'bg-[var(--wb-tab-active)] font-semibold text-[var(--wb-fg)] after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-[var(--wb-accent)]'
              : 'text-[var(--wb-tab-inactive-fg)] hover:bg-[var(--wb-hover)] hover:text-[var(--wb-fg)]',
            dragging && 'opacity-50'
          )}
          title={tab.path}
        >
          <Icon className={cn('h-3 w-3 shrink-0', spec.className)} />
          {tab.pinned ? <Pin className="h-3 w-3 shrink-0 text-primary" /> : null}
          <span className="max-w-[132px] truncate">{tab.name}</span>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              onClose()
            }}
            className="flex h-4 w-4 shrink-0 items-center justify-center rounded-sm hover:bg-[var(--wb-hover)]"
          >
            {tab.dirty ? (
              <Circle className="h-2 w-2 fill-current text-foreground group-hover:hidden" />
            ) : null}
            <X className={cn('h-3 w-3', tab.dirty && 'hidden group-hover:block')} />
          </button>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={onClose}>
          Close <ContextMenuShortcut>Ctrl+W</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => closeOtherTabs(tab.path)}>Close Others</ContextMenuItem>
        <ContextMenuItem onSelect={() => closeSavedTabs()}>Close Saved</ContextMenuItem>
        <ContextMenuItem onSelect={() => closeAllTabs()}>Close All</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => togglePinTab(tab.path)}>
          {tab.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
          {tab.pinned ? 'Unpin' : 'Pin'}
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => splitRight(tab.path)}>Split Right</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => void copyPath(false)}>Copy Path</ContextMenuItem>
        <ContextMenuItem onSelect={() => void copyPath(true)}>Copy Relative Path</ContextMenuItem>
        <ContextMenuItem
          onSelect={() => {
            setLeftTab('files')
            void revealPathInTree(tab.path)
          }}
        >
          Reveal in Explorer
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
})
