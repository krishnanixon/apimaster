import { useEffect, useRef } from 'react'
import {
  Copy,
  Trash2,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  ArrowUp,
  ArrowDown,
  Settings2,
  Maximize2,
  MousePointerClick,
  Layers,
  Waypoints,
  Zap,
  Plus,
  ChevronsUpDown,
  Group,
  Ungroup,
  LogOut
} from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { useFlowEditorStore } from '../stores/flow-editor.store'

export type CanvasMenuTarget =
  | { type: 'node'; id: string; x: number; y: number }
  | { type: 'edge'; id: string; x: number; y: number }
  | { type: 'pane'; x: number; y: number; flowX: number; flowY: number }

interface FlowCanvasContextMenuProps {
  target: CanvasMenuTarget | null
  onClose: () => void
}

export function FlowCanvasContextMenu({ target, onClose }: FlowCanvasContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const {
    nodes,
    edges,
    selectedNodeIds,
    setSelection,
    duplicateSelected,
    deleteSelected,
    toggleNodeHidden,
    toggleNodeLocked,
    bringNodeToFront,
    sendNodeToBack,
    updateEdge,
    setPanelLayout,
    selectAll,
    clearSelection,
    focusSelection,
    addLibraryNode,
    reactFlowInstance,
    toggleGroupCollapsed,
    groupSelectionIntoSubflow,
    ungroupSubflow,
    detachNodeFromParent
  } = useFlowEditorStore()

  useEffect(() => {
    if (!target) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [target, onClose])

  useEffect(() => {
    if (!target || !menuRef.current) return
    const rect = menuRef.current.getBoundingClientRect()
    const pad = 8
    let { x, y } = target
    if (x + rect.width > window.innerWidth - pad) x = window.innerWidth - rect.width - pad
    if (y + rect.height > window.innerHeight - pad) y = window.innerHeight - rect.height - pad
    menuRef.current.style.left = `${x}px`
    menuRef.current.style.top = `${y}px`
  }, [target])

  if (!target) return null

  const node = target.type === 'node' ? nodes.find((n) => n.id === target.id) : null
  const edge = target.type === 'edge' ? edges.find((e) => e.id === target.id) : null
  const nodeHidden = Boolean(node?.hidden ?? node?.data?.hidden)
  const nodeLocked = Boolean(node?.data?.locked)
  const isContainer = node?.type === 'group' || node?.type === 'swimlane'
  const multiSelected = selectedNodeIds.length > 1 && selectedNodeIds.includes(node?.id ?? '')

  const run = (action: () => void) => {
    action()
    onClose()
  }

  const openProperties = () => {
    setPanelLayout({ rightCollapsed: false, rightTab: 'properties' })
  }

  const addQuickNode = () => {
    if (target.type !== 'pane') return
    addLibraryNode(
      {
        label: 'New step',
        nodeType: 'process',
        category: 'flowchart',
        shape: 'rounded',
        icon: 'Cog',
        color: '#6366f1'
      },
      { x: target.flowX, y: target.flowY }
    )
  }

  return (
    <>
      <div
        className="fixed inset-0 z-[199]"
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault()
          onClose()
        }}
      />
      <div
        ref={menuRef}
        className="fixed z-[200] min-w-[11rem] overflow-hidden rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-float animate-in fade-in-0 zoom-in-95"
        style={{ left: target.x, top: target.y }}
        onContextMenu={(e) => e.preventDefault()}
      >
        {target.type === 'node' && node && (
          <>
            <MenuLabel>{String(node.data?.label ?? 'Node')}</MenuLabel>
            <MenuItem
              icon={Settings2}
              label="Edit properties"
              shortcut="Enter"
              onClick={() => run(() => {
                setSelection([node.id])
                openProperties()
              })}
            />
            <MenuItem
              icon={Copy}
              label="Duplicate"
              shortcut="Ctrl+D"
              onClick={() => run(() => {
                setSelection([node.id])
                duplicateSelected()
              })}
            />
            <MenuSeparator />
            <MenuItem
              icon={nodeHidden ? Eye : EyeOff}
              label={nodeHidden ? 'Show' : 'Hide'}
              onClick={() => run(() => toggleNodeHidden(node.id))}
            />
            <MenuItem
              icon={nodeLocked ? Unlock : Lock}
              label={nodeLocked ? 'Unlock' : 'Lock'}
              onClick={() => run(() => toggleNodeLocked(node.id))}
            />
            <MenuItem
              icon={ArrowUp}
              label="Bring to front"
              onClick={() => run(() => bringNodeToFront(node.id))}
            />
            <MenuItem
              icon={ArrowDown}
              label="Send to back"
              onClick={() => run(() => sendNodeToBack(node.id))}
            />
            {node.type === 'group' && (
              <MenuItem
                icon={ChevronsUpDown}
                label={node.data?.collapsed ? 'Expand group' : 'Collapse group'}
                onClick={() => run(() => toggleGroupCollapsed(node.id))}
              />
            )}
            <MenuSeparator />
            {isContainer ? (
              <MenuItem
                icon={Ungroup}
                label="Ungroup sub flow"
                shortcut="Ctrl+Shift+G"
                onClick={() => run(() => ungroupSubflow(node.id))}
              />
            ) : (
              <MenuItem
                icon={Group}
                label={multiSelected ? 'Group into sub flow' : 'Wrap in sub flow'}
                shortcut="Ctrl+G"
                onClick={() =>
                  run(() => {
                    if (!multiSelected) setSelection([node.id])
                    groupSelectionIntoSubflow()
                  })
                }
              />
            )}
            {node.parentId && (
              <MenuItem
                icon={LogOut}
                label="Detach from sub flow"
                onClick={() => run(() => detachNodeFromParent(node.id))}
              />
            )}
            <MenuSeparator />
            <MenuItem
              icon={Maximize2}
              label="Focus on node"
              onClick={() => run(() => {
                setSelection([node.id])
                focusSelection()
              })}
            />
            <MenuItem
              icon={Trash2}
              label="Delete"
              shortcut="Del"
              destructive
              onClick={() => run(() => {
                setSelection([node.id])
                deleteSelected()
              })}
            />
          </>
        )}

        {target.type === 'edge' && edge && (
          <>
            <MenuLabel>Connection</MenuLabel>
            <MenuItem
              icon={Settings2}
              label="Edit properties"
              onClick={() => run(() => {
                setSelection([], [edge.id])
                openProperties()
              })}
            />
            <MenuItem
              icon={Waypoints}
              label="Toggle animation"
              onClick={() =>
                run(() => updateEdge(edge.id, { animated: !edge.animated }))
              }
            />
            <MenuSeparator />
            <MenuItem
              icon={Trash2}
              label="Delete"
              shortcut="Del"
              destructive
              onClick={() => run(() => {
                setSelection([], [edge.id])
                deleteSelected()
              })}
            />
          </>
        )}

        {target.type === 'pane' && (
          <>
            <MenuLabel>Canvas</MenuLabel>
            <MenuItem icon={Plus} label="Add node here" onClick={() => run(addQuickNode)} />
            <MenuItem
              icon={MousePointerClick}
              label="Select all"
              shortcut="Ctrl+A"
              onClick={() => run(selectAll)}
            />
            <MenuItem icon={Layers} label="Clear selection" onClick={() => run(clearSelection)} />
            <MenuSeparator />
            <MenuItem
              icon={Maximize2}
              label="Fit to view"
              onClick={() =>
                run(() => reactFlowInstance?.fitView({ padding: 0.2, duration: 300 }))
              }
            />
            <MenuItem
              icon={Zap}
              label="Reset zoom"
              onClick={() =>
                run(() => reactFlowInstance?.setViewport({ x: 0, y: 0, zoom: 1 }, { duration: 300 }))
              }
            />
          </>
        )}
      </div>
    </>
  )
}

function MenuLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="truncate px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </p>
  )
}

function MenuSeparator() {
  return <div className="-mx-1 my-1 h-px bg-border" />
}

function MenuItem({
  icon: Icon,
  label,
  shortcut,
  destructive,
  onClick
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  shortcut?: string
  destructive?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full cursor-default select-none items-center gap-2 rounded-lg px-2.5 py-2 text-sm outline-none transition-colors hover:bg-accent focus:bg-accent',
        destructive && 'text-destructive hover:text-destructive focus:text-destructive'
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0 opacity-70" />
      <span className="flex-1 text-left">{label}</span>
      {shortcut && (
        <span className="text-[10px] tracking-widest text-muted-foreground">{shortcut}</span>
      )}
    </button>
  )
}
