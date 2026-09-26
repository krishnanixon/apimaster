import { memo, useEffect, useRef, useState } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { useArchitectureEditorStore } from '../stores/architecture-editor.store'
import { DynamicIcon } from '../lib/dynamic-icon'
import type { ArchNodeData } from '../lib/canvas-projection'
import { cn } from '@/shared/lib/utils'

function NodeHandles({ color, visible }: { color: string; visible: boolean }) {
  const base = cn(
    '!h-2.5 !w-2.5 !border-2 !bg-background transition-opacity duration-150',
    visible ? '!opacity-100' : '!opacity-0 group-hover:!opacity-100'
  )
  const style = { borderColor: color }
  return (
    <>
      <Handle type="target" position={Position.Top} className={base} style={style} />
      <Handle type="target" position={Position.Left} className={base} style={style} />
      <Handle type="source" position={Position.Bottom} className={base} style={style} />
      <Handle type="source" position={Position.Right} className={base} style={style} />
    </>
  )
}

function ArchitectureNodeInner({ id, data, selected }: NodeProps) {
  const node = data as ArchNodeData
  const dispatch = useArchitectureEditorStore((state) => state.dispatch)
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(node.name)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setValue(node.name)
  }, [node.name])

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  const commit = () => {
    setEditing(false)
    const next = value.trim()
    if (next && next !== node.name) {
      dispatch({ type: 'UPDATE_COMPONENT', componentId: id, patch: { name: next } })
    } else {
      setValue(node.name)
    }
  }

  return (
    <div
      className={cn(
        'group w-[220px] rounded-lg border bg-card px-2.5 py-2 shadow-sm',
        'transition-[border-color,box-shadow] duration-fast',
        selected
          ? 'border-primary/50 ring-2 ring-primary/25'
          : 'border-border/70 hover:border-border'
      )}
    >
      <NodeHandles color={node.color} visible={Boolean(selected)} />

      <div className="flex items-center gap-2.5">
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md"
          style={{ backgroundColor: `${node.color}1a`, color: node.color }}
        >
          <DynamicIcon name={node.icon} className="h-4 w-4" />
        </div>

        <div className="min-w-0 flex-1">
          {editing ? (
            <input
              ref={inputRef}
              value={value}
              onChange={(event) => setValue(event.target.value)}
              onBlur={commit}
              onKeyDown={(event) => {
                if (event.key === 'Enter') commit()
                if (event.key === 'Escape') {
                  setValue(node.name)
                  setEditing(false)
                }
                event.stopPropagation()
              }}
              onClick={(event) => event.stopPropagation()}
              className="nodrag nopan h-6 w-full rounded border border-primary bg-background px-1 text-[12px] font-medium outline-none"
            />
          ) : (
            <p
              className="truncate text-[12.5px] font-medium leading-tight"
              onDoubleClick={(event) => {
                event.stopPropagation()
                setEditing(true)
              }}
            >
              {node.name}
            </p>
          )}
          <p className="truncate text-[10px] leading-tight text-muted-foreground">
            {node.technology || node.category}
          </p>
        </div>
      </div>
    </div>
  )
}

export const ArchitectureNode = memo(ArchitectureNodeInner)

export const architectureNodeTypes = {
  archComponent: ArchitectureNode
}
