import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  ConnectionLineType,
  ConnectionMode,
  MiniMap,
  SelectionMode,
  type Node,
  type Edge,
  type OnSelectionChangeParams,
  type ReactFlowInstance
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { nodeTypes } from '../nodes'
import { edgeTypes } from '../edges/LabeledEdge'
import { useFlowEditorStore } from '../stores/flow-editor.store'
import { FlowCanvasContextMenu, type CanvasMenuTarget } from './FlowCanvasContextMenu'
import { FlowSelectionToolbar } from './FlowSelectionToolbar'
import { FlowToolPalette } from './FlowToolPalette'
import { FlowValidationContext } from '../context/flow-validation.context'
import { useFlowValidation } from '../hooks/useFlowValidation'
import { cn } from '@/shared/lib/utils'

const CONTAINER_TYPES = new Set(['group', 'swimlane'])

/**
 * Figma-like defaults: Select stays primary.
 * Pan without switching tools via Space, middle/right mouse, or trackpad scroll.
 * Sticky Hand tool remains optional for left-drag pan.
 */
const TOOL_CONFIG = {
  select: {
    panOnDrag: [1, 2] as number[],
    selectionOnDrag: true,
    nodesDraggable: true,
    elementsSelectable: true,
    nodesConnectable: true
  },
  pan: {
    panOnDrag: [0, 1, 2] as number[],
    selectionOnDrag: false,
    nodesDraggable: false,
    elementsSelectable: false,
    nodesConnectable: false
  },
  connect: {
    panOnDrag: [1, 2] as number[],
    selectionOnDrag: false,
    nodesDraggable: false,
    elementsSelectable: true,
    nodesConnectable: true
  },
  eraser: {
    panOnDrag: [1, 2] as number[],
    selectionOnDrag: false,
    nodesDraggable: false,
    elementsSelectable: true,
    nodesConnectable: false
  }
}

/** Collect a node id plus all of its descendant ids so we never drop a node into itself. */
function getSubtreeIds(nodeId: string, nodes: Node[]): Set<string> {
  const ids = new Set<string>([nodeId])
  let changed = true
  while (changed) {
    changed = false
    for (const n of nodes) {
      if (n.parentId && ids.has(n.parentId) && !ids.has(n.id)) {
        ids.add(n.id)
        changed = true
      }
    }
  }
  return ids
}

export function FlowCanvas() {
  const reactFlowWrapper = useRef<HTMLDivElement>(null)
  const [menuTarget, setMenuTarget] = useState<CanvasMenuTarget | null>(null)
  const eraseDownRef = useRef(false)
  const strokeStartedRef = useRef(false)

  const {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    setViewport,
    setSelection,
    setReactFlowInstance,
    snapToGrid,
    showGrid,
    showMinimap,
    pushHistory,
    addLibraryNode,
    activeTool,
    turboMode,
    dropTargetId,
    setDropTarget,
    attachNodeToParent,
    detachNodeFromParent,
    beginEraseStroke,
    eraseNode,
    eraseEdge
  } = useFlowEditorStore()

  const { nodeSeverity } = useFlowValidation(nodes, edges)
  const tool = TOOL_CONFIG[activeTool] ?? TOOL_CONFIG.select
  const isEraser = activeTool === 'eraser'
  const isPan = activeTool === 'pan'
  const [spaceHeld, setSpaceHeld] = useState(false)
  const panActive = isPan || spaceHeld

  useEffect(() => {
    const isTypingTarget = (target: EventTarget | null) => {
      const el = target as HTMLElement | null
      if (!el) return false
      return (
        el.tagName === 'INPUT' ||
        el.tagName === 'TEXTAREA' ||
        el.tagName === 'SELECT' ||
        el.isContentEditable
      )
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== ' ' || e.repeat || isTypingTarget(e.target)) return
      setSpaceHeld(true)
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === ' ') setSpaceHeld(false)
    }
    const onBlur = () => setSpaceHeld(false)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [])

  const displayNodes = useMemo(() => {
    if (!dropTargetId) return nodes
    return nodes.map((n) =>
      n.id === dropTargetId ? { ...n, className: cn(n.className, 'flow-drop-target') } : n
    )
  }, [nodes, dropTargetId])

  const onInit = useCallback(
    (instance: ReactFlowInstance) => {
      setReactFlowInstance(instance)
    },
    [setReactFlowInstance]
  )

  const onSelectionChange = useCallback(
    ({ nodes: selNodes, edges: selEdges }: OnSelectionChangeParams) => {
      setSelection(
        selNodes.map((n) => n.id),
        selEdges.map((e) => e.id)
      )
    },
    [setSelection]
  )

  const startStroke = useCallback(() => {
    if (!strokeStartedRef.current) {
      beginEraseStroke()
      strokeStartedRef.current = true
    }
  }, [beginEraseStroke])

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      if (!isEraser) return
      startStroke()
      eraseNode(node.id)
    },
    [isEraser, startStroke, eraseNode]
  )

  const onEdgeClick = useCallback(
    (_: React.MouseEvent, edge: Edge) => {
      if (!isEraser) return
      startStroke()
      eraseEdge(edge.id)
    },
    [isEraser, startStroke, eraseEdge]
  )

  const onNodeMouseEnter = useCallback(
    (_: React.MouseEvent, node: Node) => {
      if (!isEraser || !eraseDownRef.current) return
      startStroke()
      eraseNode(node.id)
    },
    [isEraser, startStroke, eraseNode]
  )

  const onEdgeMouseEnter = useCallback(
    (_: React.MouseEvent, edge: Edge) => {
      if (!isEraser || !eraseDownRef.current) return
      startStroke()
      eraseEdge(edge.id)
    },
    [isEraser, startStroke, eraseEdge]
  )

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      // Chromium/Electron treats a middle-click as autoscroll and swallows pan.
      if (e.button === 1) e.preventDefault()
      if (isEraser && e.button === 0) eraseDownRef.current = true
    },
    [isEraser]
  )

  const onPointerUp = useCallback(() => {
    eraseDownRef.current = false
    strokeStartedRef.current = false
  }, [])

  const onNodeContextMenu = useCallback(
    (e: React.MouseEvent, node: Node) => {
      e.preventDefault()
      if (!node.selected) setSelection([node.id])
      setMenuTarget({ type: 'node', id: node.id, x: e.clientX, y: e.clientY })
    },
    [setSelection]
  )

  const onEdgeContextMenu = useCallback(
    (e: React.MouseEvent, edge: Edge) => {
      e.preventDefault()
      if (!edge.selected) setSelection([], [edge.id])
      setMenuTarget({ type: 'edge', id: edge.id, x: e.clientX, y: e.clientY })
    },
    [setSelection]
  )

  const onPaneContextMenu = useCallback((e: React.MouseEvent | MouseEvent) => {
    e.preventDefault()
    const instance = useFlowEditorStore.getState().reactFlowInstance
    if (!instance) return
    const flowPos = instance.screenToFlowPosition({ x: e.clientX, y: e.clientY })
    setMenuTarget({
      type: 'pane',
      x: e.clientX,
      y: e.clientY,
      flowX: flowPos.x,
      flowY: flowPos.y
    })
  }, [])

  const onNodeDragStart = useCallback(() => {
    pushHistory()
  }, [pushHistory])

  const findDropTarget = useCallback((node: Node): string | null => {
    const instance = useFlowEditorStore.getState().reactFlowInstance
    if (!instance) return null
    const subtree = getSubtreeIds(node.id, useFlowEditorStore.getState().nodes)
    const intersecting = instance
      .getIntersectingNodes(node)
      .filter((n) => CONTAINER_TYPES.has(String(n.type)) && !subtree.has(n.id))
    if (intersecting.length === 0) return null
    // Prefer the visually top-most container (last in render order).
    return intersecting[intersecting.length - 1].id
  }, [])

  const onNodeDrag = useCallback(
    (_: React.MouseEvent, node: Node) => {
      if (CONTAINER_TYPES.has(String(node.type))) return
      setDropTarget(findDropTarget(node))
    },
    [findDropTarget, setDropTarget]
  )

  const onNodeDragStop = useCallback(
    (_: React.MouseEvent, node: Node) => {
      if (CONTAINER_TYPES.has(String(node.type))) {
        setDropTarget(null)
        return
      }
      const targetId = findDropTarget(node)
      setDropTarget(null)
      if (targetId && targetId !== node.parentId) {
        attachNodeToParent(node.id, targetId)
      } else if (!targetId && node.parentId) {
        detachNodeFromParent(node.id)
      }
    },
    [findDropTarget, setDropTarget, attachNodeToParent, detachNodeFromParent]
  )

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }, [])

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      const raw = e.dataTransfer.getData('application/flow-node')
      if (!raw) return

      const instance = useFlowEditorStore.getState().reactFlowInstance
      if (!instance) return

      const item = JSON.parse(raw) as {
        label: string
        nodeType: string
        category: string
        shape: string
        icon: string
        color: string
      }

      const position = instance.screenToFlowPosition({ x: e.clientX, y: e.clientY })
      addLibraryNode(item, position)
    },
    [addLibraryNode]
  )

  return (
    <FlowValidationContext.Provider value={nodeSeverity}>
      <div
        ref={reactFlowWrapper}
        className={cn(
          'flow-canvas h-full min-h-0 w-full overflow-hidden touch-none',
          turboMode && 'flow-turbo',
          panActive && 'flow-tool-pan',
          activeTool === 'connect' && 'flow-tool-connect',
          isEraser && 'flow-tool-eraser'
        )}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onPointerDownCapture={onPointerDown}
        onPointerUpCapture={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        <FlowDefs />
        <ReactFlow
          nodes={displayNodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onInit={onInit}
          onMoveEnd={(_, viewport) => setViewport(viewport)}
          onSelectionChange={onSelectionChange}
          onNodeClick={onNodeClick}
          onEdgeClick={onEdgeClick}
          onNodeMouseEnter={onNodeMouseEnter}
          onEdgeMouseEnter={onEdgeMouseEnter}
          onNodeContextMenu={onNodeContextMenu}
          onEdgeContextMenu={onEdgeContextMenu}
          onPaneContextMenu={onPaneContextMenu}
          onNodeDragStart={onNodeDragStart}
          onNodeDrag={onNodeDrag}
          onNodeDragStop={onNodeDragStop}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          defaultEdgeOptions={{ type: 'labeled' }}
          connectionMode={ConnectionMode.Loose}
          connectionLineType={ConnectionLineType.SmoothStep}
          connectionLineStyle={{ stroke: 'hsl(var(--primary))', strokeWidth: 2 }}
          elevateEdgesOnSelect
          elevateNodesOnSelect
          fitView
          fitViewOptions={{ padding: 0.2 }}
          snapToGrid={snapToGrid}
          snapGrid={[16, 16]}
          selectionMode={SelectionMode.Partial}
          selectionOnDrag={!panActive && tool.selectionOnDrag}
          panOnDrag={panActive ? [0, 1, 2] : tool.panOnDrag}
          // Trackpad / wheel pans the canvas; Ctrl/Cmd + scroll zooms (no Hand tool needed).
          panOnScroll
          panOnScrollSpeed={1.35}
          zoomOnScroll={false}
          zoomActivationKeyCode={['Meta', 'Control']}
          zoomOnPinch
          zoomOnDoubleClick={false}
          preventScrolling
          nodesDraggable={!panActive && tool.nodesDraggable}
          nodesConnectable={!panActive && tool.nodesConnectable}
          elementsSelectable={!panActive && tool.elementsSelectable}
          nodesFocusable={!panActive}
          edgesFocusable={!panActive}
          deleteKeyCode={panActive ? null : ['Delete', 'Backspace']}
          multiSelectionKeyCode="Shift"
          panActivationKeyCode="Space"
          proOptions={{ hideAttribution: true }}
          className="bg-transparent"
        >
          {showGrid && (
            <Background
              variant={BackgroundVariant.Dots}
              gap={16}
              size={1}
              color="hsl(var(--muted-foreground) / 0.25)"
              className="!bg-transparent"
            />
          )}
          {showMinimap && (
            <MiniMap
              className="!rounded-lg !border !border-border/60 !bg-card !shadow-md"
              maskColor="hsl(var(--primary) / 0.06)"
              nodeColor={(n) => String(n.data?.color ?? 'hsl(var(--primary))')}
              nodeStrokeWidth={0}
              nodeBorderRadius={4}
              pannable
              zoomable
            />
          )}
          <FlowToolPalette />
          <FlowSelectionToolbar />
        </ReactFlow>

        <FlowCanvasContextMenu target={menuTarget} onClose={() => setMenuTarget(null)} />
        {nodes.length === 0 && <EmptyCanvasHint />}
      </div>
    </FlowValidationContext.Provider>
  )
}

function EmptyCanvasHint() {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
      <div className="max-w-md rounded-xl border border-dashed border-border/80 bg-background/80 px-6 py-5 text-center shadow-sm backdrop-blur-sm">
        <p className="text-sm font-semibold">Empty canvas</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Drag a node from the library, click one to place it, or right-click to add a step.
        </p>
        <p className="mt-3 text-[10px] leading-relaxed text-muted-foreground/80">
          Scroll to pan · Ctrl+scroll or pinch to zoom · Hold Space to drag-pan
        </p>
      </div>
    </div>
  )
}

/** Shared SVG defs (arrow markers, turbo gradient + glow) rendered in a real SVG element. */
function FlowDefs() {
  return (
    <svg className="pointer-events-none absolute h-0 w-0" aria-hidden>
      <defs>
        <marker
          id="flow-arrow"
          markerWidth="12"
          markerHeight="12"
          refX="9"
          refY="5"
          orient="auto"
          markerUnits="strokeWidth"
        >
          <path d="M1,1 L9,5 L1,9 Z" fill="hsl(var(--muted-foreground) / 0.7)" />
        </marker>
        <marker
          id="flow-turbo-arrow"
          markerWidth="14"
          markerHeight="14"
          refX="9"
          refY="5"
          orient="auto"
          markerUnits="strokeWidth"
        >
          <path d="M1,1 L9,5 L1,9 Z" fill="#e92a67" />
        </marker>
        <linearGradient id="flow-turbo-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#2a8af6" />
          <stop offset="50%" stopColor="#a853ba" />
          <stop offset="100%" stopColor="#e92a67" />
        </linearGradient>
        <filter id="flow-turbo-glow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="2.4" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
    </svg>
  )
}
