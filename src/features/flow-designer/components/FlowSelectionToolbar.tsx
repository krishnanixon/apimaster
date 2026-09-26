import {
  Copy,
  CopyPlus,
  ClipboardPaste,
  Trash2,
  Lock,
  Unlock,
  Eye,
  EyeOff,
  Settings2,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignVerticalJustifyCenter,
  AlignHorizontalJustifyCenter,
  MoreHorizontal
} from 'lucide-react'
import { Panel, useStore } from '@xyflow/react'
import { Button } from '@/shared/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/shared/components/ui/dropdown-menu'
import { useFlowEditorStore } from '../stores/flow-editor.store'
import { cn } from '@/shared/lib/utils'

export function FlowSelectionToolbar() {
  const selectedCount = useStore((s) =>
    s.nodes.filter((n) => n.selected).length + s.edges.filter((e) => e.selected).length
  )
  const {
    selectedNodeIds,
    selectedEdgeIds,
    nodes,
    duplicateSelected,
    deleteSelected,
    copySelected,
    pasteClipboard,
    toggleNodeLocked,
    toggleNodeHidden,
    setPanelLayout,
    alignSelected,
    distributeSelected
  } = useFlowEditorStore()

  if (selectedCount === 0) return null

  const singleNode =
    selectedNodeIds.length === 1 ? nodes.find((n) => n.id === selectedNodeIds[0]) : null
  const isLocked = Boolean(singleNode?.data?.locked)
  const isHidden = Boolean(singleNode?.hidden ?? singleNode?.data?.hidden)

  const label =
    selectedNodeIds.length > 0 && selectedEdgeIds.length > 0
      ? `${selectedNodeIds.length} nodes, ${selectedEdgeIds.length} edges`
      : selectedNodeIds.length > 1
        ? `${selectedNodeIds.length} nodes`
        : selectedEdgeIds.length > 1
          ? `${selectedEdgeIds.length} edges`
          : singleNode
            ? String(singleNode.data?.label ?? 'Node')
            : '1 edge'

  return (
    <Panel position="top-center" className="!m-0 !mt-3">
      <div className="flex items-center gap-1 rounded-xl border border-border/80 bg-card/95 px-2 py-1 shadow-lg backdrop-blur-md">
        <span className="max-w-[140px] truncate px-2 text-xs font-medium text-muted-foreground">
          {label}
        </span>
        <div className="h-4 w-px bg-border" />
        {selectedNodeIds.length === 1 && selectedEdgeIds.length === 0 && (
          <>
            <ToolbarAction
              icon={Settings2}
              title="Properties"
              onClick={() =>
                setPanelLayout({ rightCollapsed: false, rightTab: 'properties' })
              }
            />
            <ToolbarAction
              icon={isLocked ? Unlock : Lock}
              title={isLocked ? 'Unlock' : 'Lock'}
              onClick={() => toggleNodeLocked(selectedNodeIds[0])}
            />
            <ToolbarAction
              icon={isHidden ? Eye : EyeOff}
              title={isHidden ? 'Show' : 'Hide'}
              onClick={() => toggleNodeHidden(selectedNodeIds[0])}
            />
            <div className="h-4 w-px bg-border" />
          </>
        )}
        {selectedNodeIds.length > 0 && (
          <>
            <ToolbarAction icon={Copy} title="Copy (Ctrl+C)" onClick={copySelected} />
            <ToolbarAction icon={CopyPlus} title="Duplicate (Ctrl+D)" onClick={duplicateSelected} />
          </>
        )}
        <ToolbarAction icon={ClipboardPaste} title="Paste (Ctrl+V)" onClick={pasteClipboard} />
        {selectedNodeIds.length >= 2 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Align & distribute">
                <MoreHorizontal className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" className="w-44">
              <DropdownMenuItem onClick={() => alignSelected('left')}>
                <AlignLeft className="mr-2 h-3.5 w-3.5" /> Align left
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => alignSelected('center')}>
                <AlignCenter className="mr-2 h-3.5 w-3.5" /> Align center
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => alignSelected('right')}>
                <AlignRight className="mr-2 h-3.5 w-3.5" /> Align right
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => alignSelected('top')}>
                <AlignVerticalJustifyCenter className="mr-2 h-3.5 w-3.5" /> Align top
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => alignSelected('middle')}>
                <AlignHorizontalJustifyCenter className="mr-2 h-3.5 w-3.5" /> Align middle
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => alignSelected('bottom')}>
                <AlignVerticalJustifyCenter className="mr-2 h-3.5 w-3.5 rotate-180" /> Align bottom
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={selectedNodeIds.length < 3}
                onClick={() => distributeSelected('horizontal')}
              >
                Distribute horizontally
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={selectedNodeIds.length < 3}
                onClick={() => distributeSelected('vertical')}
              >
                Distribute vertically
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <ToolbarAction icon={Trash2} title="Delete" destructive onClick={deleteSelected} />
      </div>
    </Panel>
  )
}

function ToolbarAction({
  icon: Icon,
  title,
  onClick,
  destructive
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  onClick: () => void
  destructive?: boolean
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn(
        'h-7 w-7 p-0',
        destructive && 'text-destructive hover:bg-destructive/10 hover:text-destructive'
      )}
      title={title}
      onClick={onClick}
    >
      <Icon className="h-3.5 w-3.5" />
    </Button>
  )
}
