import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { ChevronDown, ChevronRight, Key, Link2, ExternalLink } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import type { DbColumnInfo } from '@shared/types/database-workspace'

export interface ErTableNodeData {
  table: string
  columns: DbColumnInfo[]
  colorIndex: number
  expanded: boolean
  onToggleExpand: (table: string) => void
  onShowDetails: (table: string) => void
}

const HEADER_GRADIENTS = [
  'from-sky-500 to-blue-600',
  'from-emerald-500 to-teal-600',
  'from-violet-500 to-purple-600',
  'from-amber-500 to-orange-600',
  'from-rose-500 to-pink-600',
  'from-cyan-500 to-sky-600',
  'from-indigo-500 to-blue-700',
  'from-lime-500 to-green-600'
]

const PREVIEW_COLUMN_COUNT = 6

function ErTableNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as ErTableNodeData
  const gradient = HEADER_GRADIENTS[nodeData.colorIndex % HEADER_GRADIENTS.length]
  const previewColumns = nodeData.columns.slice(0, PREVIEW_COLUMN_COUNT)
  const hiddenCount = nodeData.columns.length - PREVIEW_COLUMN_COUNT
  const pkCount = nodeData.columns.filter((c) => c.isPrimaryKey).length
  const fkCount = nodeData.columns.filter((c) => c.isForeignKey).length

  return (
    <div
      className={cn(
        'min-w-[200px] overflow-hidden rounded-md border bg-card text-xs shadow-md transition-shadow nodrag',
        selected ? 'border-primary ring-2 ring-primary/30' : 'border-border'
      )}
    >
      <Handle type="target" position={Position.Left} className="!h-2 !w-2 !bg-primary" />

      <div className={cn('flex w-full items-center gap-1 bg-gradient-to-r text-left text-white', gradient)}>
        <button
          type="button"
          className="shrink-0 px-2 py-2 hover:bg-white/10"
          title={nodeData.expanded ? 'Collapse columns' : 'Expand columns'}
          onClick={(e) => {
            e.stopPropagation()
            nodeData.onToggleExpand(nodeData.table)
          }}
        >
          {nodeData.expanded ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </button>
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 py-2 pr-2 text-left hover:bg-white/10"
          title="View full table details"
          onClick={(e) => {
            e.stopPropagation()
            nodeData.onShowDetails(nodeData.table)
          }}
        >
          <span className="truncate font-semibold">{nodeData.table}</span>
          <ExternalLink className="h-3 w-3 shrink-0 opacity-70" />
        </button>
        <span className="mr-2 shrink-0 rounded bg-white/20 px-1.5 py-0.5 text-[10px]">
          {nodeData.columns.length}
        </span>
      </div>

      {nodeData.expanded && (
        <div>
          <div className="flex gap-2 border-b border-border px-2 py-1 text-[10px] text-muted-foreground">
            {pkCount > 0 && (
              <span className="flex items-center gap-0.5">
                <Key className="h-3 w-3 text-amber-500" /> {pkCount} PK
              </span>
            )}
            {fkCount > 0 && (
              <span className="flex items-center gap-0.5">
                <Link2 className="h-3 w-3 text-sky-500" /> {fkCount} FK
              </span>
            )}
          </div>
          {previewColumns.map((col, i) => (
            <button
              key={col.name}
              type="button"
              className={cn(
                'flex w-full items-center gap-2 border-b border-border px-2 py-0.5 text-left last:border-b-0 hover:bg-muted/70',
                i % 2 === 0 ? 'bg-background' : 'bg-muted/50',
                col.isPrimaryKey && 'bg-amber-500/10',
                col.isForeignKey && !col.isPrimaryKey && 'bg-sky-500/10'
              )}
              onClick={(e) => {
                e.stopPropagation()
                nodeData.onShowDetails(nodeData.table)
              }}
            >
              {col.isPrimaryKey ? (
                <Key className="h-3 w-3 shrink-0 text-amber-500" />
              ) : col.isForeignKey ? (
                <Link2 className="h-3 w-3 shrink-0 text-sky-500" />
              ) : (
                <span className="w-3 shrink-0" />
              )}
              <span className="truncate font-medium">{col.name}</span>
              <span className="ml-auto truncate text-[10px] text-muted-foreground">{col.dataType}</span>
            </button>
          ))}
          {hiddenCount > 0 && (
            <button
              type="button"
              className="w-full border-t border-border px-2 py-1 text-[10px] font-medium text-primary hover:bg-primary/5"
              onClick={(e) => {
                e.stopPropagation()
                nodeData.onShowDetails(nodeData.table)
              }}
            >
              +{hiddenCount} more columns — view all
            </button>
          )}
        </div>
      )}

      <Handle type="source" position={Position.Right} className="!h-2 !w-2 !bg-primary" />
    </div>
  )
}

export const ErTableNode = memo(ErTableNodeComponent)

export function tableColorIndex(name: string): number {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash + name.charCodeAt(i) * (i + 1)) % HEADER_GRADIENTS.length
  return hash
}
