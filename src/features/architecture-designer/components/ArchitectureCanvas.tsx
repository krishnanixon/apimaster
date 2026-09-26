import { useCallback, useMemo, useRef, useState } from 'react'
import {
  Background,
  BackgroundVariant,
  ConnectionLineType,
  ConnectionMode,
  Controls,
  MiniMap,
  ReactFlow,
  type Connection,
  type Node,
  type OnSelectionChangeParams,
  type ReactFlowInstance
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Plus } from 'lucide-react'
import type { ArchComponentCategory, ArchComponentKind, ArchViewId } from '@shared/types/architecture'
import { ARCH_VIEWS } from '@shared/lib/architecture-catalog'
import { Button } from '@/shared/components/ui/button'
import { useArchitectureEditorStore } from '../stores/architecture-editor.store'
import { AddComponentDialog } from './AddComponentDialog'
import { architectureNodeTypes } from '../nodes/ArchitectureNode'
import { projectArchitectureCanvas } from '../lib/canvas-projection'

interface ArchitectureCanvasProps {
  /** When set, the canvas projects this view instead of the toolbar's active view. */
  view?: ArchViewId
  addCategories?: ArchComponentCategory[]
  title?: string
  description?: string
}

export function ArchitectureCanvas({
  view,
  addCategories,
  title = 'Architecture',
  description
}: ArchitectureCanvasProps) {
  const {
    model,
    activeView,
    selectedComponentIds,
    selectedConnectionId,
    dispatch,
    selectComponents,
    selectConnection,
    clearSelection
  } = useArchitectureEditorStore()

  const viewId = view ?? activeView
  const viewMeta = ARCH_VIEWS.find((item) => item.id === viewId)
  const [pickerOpen, setPickerOpen] = useState(false)
  const dropPosition = useRef<{ x: number; y: number } | null>(null)
  const flowRef = useRef<ReactFlowInstance | null>(null)

  const { nodes, edges } = useMemo(
    () => projectArchitectureCanvas(model, viewId, selectedComponentIds, selectedConnectionId),
    [model, viewId, selectedComponentIds, selectedConnectionId]
  )

  const onInit = useCallback((instance: ReactFlowInstance) => {
    flowRef.current = instance
  }, [])

  const onSelectionChange = useCallback(
    ({ nodes: selectedNodes, edges: selectedEdges }: OnSelectionChangeParams) => {
      if (selectedNodes.length > 0) {
        selectComponents(selectedNodes.map((node) => node.id))
        return
      }
      if (selectedEdges.length === 1) {
        selectConnection(selectedEdges[0].id)
      }
      // Empty selection events are ignored — they also fire when the derived
      // node list changes after adding a module. Pane click clears selection.
    },
    [selectComponents, selectConnection]
  )

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target || connection.source === connection.target) return
      dispatch({
        type: 'CONNECT_COMPONENTS',
        connection: { from: connection.source, to: connection.target }
      })
    },
    [dispatch]
  )

  const onNodeDragStop = useCallback(
    (_event: React.MouseEvent, _node: Node, dragged: Node[]) => {
      const nodesToPersist = dragged.length > 0 ? dragged : [_node]
      dispatch(
        nodesToPersist.map((node) => ({
          type: 'MOVE_COMPONENT' as const,
          componentId: node.id,
          view: viewId,
          position: node.position
        }))
      )
    },
    [dispatch, viewId]
  )

  const openPickerAt = useCallback((position?: { x: number; y: number }) => {
    dropPosition.current = position ?? null
    setPickerOpen(true)
  }, [])

  const handleAdd = useCallback(
    (kind: ArchComponentKind, label: string) => {
      const position = dropPosition.current ?? {
        x: 80 + model.components.length * 40,
        y: 80 + model.components.length * 24
      }
      dropPosition.current = null
      dispatch({
        type: 'ADD_COMPONENT',
        component: {
          name: label,
          kind,
          layout: { [viewId]: position }
        }
      })
    },
    [dispatch, model.components.length, viewId]
  )

  const onPaneDoubleClick = useCallback(
    (event: React.MouseEvent) => {
      const position = flowRef.current?.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY
      })
      openPickerAt(position)
    },
    [openPickerAt]
  )

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-10 shrink-0 items-center justify-between gap-3 border-b border-border/60 px-4">
        <div className="min-w-0">
          <h2 className="truncate text-[13px] font-semibold leading-tight">{title}</h2>
          <p className="truncate text-[11px] leading-tight text-muted-foreground">
            {description ??
              viewMeta?.description ??
              'Select a module to edit · double-click canvas to add · drag to connect'}
          </p>
        </div>
        <Button size="sm" className="h-7" onClick={() => openPickerAt()}>
          <Plus className="h-3.5 w-3.5" />
          Add
        </Button>
      </div>

      <div className="relative min-h-0 flex-1">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={architectureNodeTypes}
          onInit={onInit}
          onSelectionChange={onSelectionChange}
          onConnect={onConnect}
          onNodeDragStop={onNodeDragStop}
          onPaneClick={() => clearSelection()}
          onPaneDoubleClick={onPaneDoubleClick}
          connectionMode={ConnectionMode.Loose}
          connectionLineType={ConnectionLineType.SmoothStep}
          connectionLineStyle={{ stroke: 'hsl(var(--primary))', strokeWidth: 2 }}
          elevateEdgesOnSelect
          elevateNodesOnSelect
          fitView
          fitViewOptions={{ padding: 0.2 }}
          snapToGrid
          snapGrid={[16, 16]}
          panOnDrag={[1, 2]}
          selectionOnDrag
          deleteKeyCode={null}
          multiSelectionKeyCode="Shift"
          panActivationKeyCode="Space"
          proOptions={{ hideAttribution: true }}
          className="bg-transparent"
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={16}
            size={1}
            color="hsl(var(--muted-foreground) / 0.25)"
            className="!bg-transparent"
          />
          <Controls showInteractive={false} className="!rounded-lg !border !border-border/60 !bg-card !shadow-md" />
          <MiniMap
            className="!rounded-lg !border !border-border/60 !bg-card !shadow-md"
            maskColor="hsl(var(--primary) / 0.06)"
            nodeColor={(node) => String(node.data?.color ?? 'hsl(var(--primary))')}
            nodeStrokeWidth={0}
            nodeBorderRadius={6}
            pannable
            zoomable
          />
        </ReactFlow>

        {nodes.length === 0 && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-4">
            <div className="max-w-sm rounded-xl border border-dashed border-border/80 bg-background/90 px-6 py-5 text-center shadow-sm backdrop-blur-sm">
              <p className="text-sm font-semibold">Empty diagram</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Add apps, services, and stores — or double-click anywhere on the canvas.
              </p>
              <div className="pointer-events-auto mt-3">
                <Button size="sm" onClick={() => openPickerAt()}>
                  <Plus className="h-3.5 w-3.5" />
                  Add module
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      <AddComponentDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onSelect={handleAdd}
        categories={addCategories}
      />
    </div>
  )
}
