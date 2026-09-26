import { useEffect, useCallback } from 'react'
import { useFlowEditorStore } from '../stores/flow-editor.store'

export function useFlowKeyboard() {
  const {
    undo,
    redo,
    duplicateSelected,
    autoLayout,
    canUndo,
    canRedo,
    selectAll,
    clearSelection,
    copySelected,
    pasteClipboard,
    deleteSelected,
    setActiveTool,
    toggleTurboMode,
    groupSelectionIntoSubflow,
    ungroupSubflow
  } = useFlowEditorStore()

  const handler = useCallback(
    (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      const isEditing =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable

      const mod = e.ctrlKey || e.metaKey

      if (mod && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        if (canUndo) undo()
      }
      if (mod && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault()
        if (canRedo) redo()
      }
      if (mod && e.key === 'd') {
        e.preventDefault()
        duplicateSelected()
      }
      if (mod && e.key === 'c' && !isEditing) {
        e.preventDefault()
        copySelected()
      }
      if (mod && e.key === 'v' && !isEditing) {
        e.preventDefault()
        pasteClipboard()
      }
      if (mod && e.key === 'x' && !isEditing) {
        e.preventDefault()
        copySelected()
        deleteSelected()
      }
      if (mod && e.key === 'l') {
        e.preventDefault()
        autoLayout('hierarchical')
      }
      if (mod && e.key === 'a' && !isEditing) {
        e.preventDefault()
        selectAll()
      }
      if (mod && e.key.toLowerCase() === 'g') {
        e.preventDefault()
        if (e.shiftKey) {
          const group = useFlowEditorStore
            .getState()
            .nodes.find(
              (n) =>
                useFlowEditorStore.getState().selectedNodeIds.includes(n.id) &&
                (n.type === 'group' || n.type === 'swimlane')
            )
          if (group) ungroupSubflow(group.id)
        } else {
          groupSelectionIntoSubflow()
        }
      }
      if (e.key === 'Escape' && !isEditing) {
        clearSelection()
        setActiveTool('select')
      }
      if (e.key === 'Enter' && !isEditing && !mod) {
        const { selectedNodeIds, selectedEdgeIds, setPanelLayout } = useFlowEditorStore.getState()
        if (selectedNodeIds.length === 1 || selectedEdgeIds.length === 1) {
          e.preventDefault()
          setPanelLayout({ rightCollapsed: false, rightTab: 'properties' })
        }
      }
      if (e.altKey && !mod && e.key === 'd') {
        e.preventDefault()
        duplicateSelected()
      }
      // Keep Space from scrolling the shell so React Flow can use it as temporary pan.
      if (e.key === ' ' && !isEditing && !mod) {
        e.preventDefault()
      }
      // Fit / zoom shortcuts (Figma-style).
      if (!isEditing && e.shiftKey && !mod && (e.key === '1' || e.code === 'Digit1')) {
        e.preventDefault()
        useFlowEditorStore.getState().fitViewToContent()
      }
      if (!isEditing && e.shiftKey && !mod && (e.key === '2' || e.code === 'Digit2')) {
        e.preventDefault()
        const { reactFlowInstance, nodes, selectedNodeIds } = useFlowEditorStore.getState()
        if (!reactFlowInstance || selectedNodeIds.length === 0) return
        reactFlowInstance.fitView({
          padding: 0.25,
          duration: 200,
          nodes: nodes.filter((n) => selectedNodeIds.includes(n.id))
        })
      }
      if (mod && !isEditing && (e.key === '=' || e.key === '+')) {
        e.preventDefault()
        useFlowEditorStore.getState().reactFlowInstance?.zoomIn({ duration: 120 })
      }
      if (mod && !isEditing && e.key === '-') {
        e.preventDefault()
        useFlowEditorStore.getState().reactFlowInstance?.zoomOut({ duration: 120 })
      }
      if (mod && !isEditing && e.key === '0') {
        e.preventDefault()
        useFlowEditorStore.getState().reactFlowInstance?.zoomTo(1, { duration: 160 })
      }
      // Single-key tool shortcuts (only when not editing text or using a modifier).
      if (!mod && !e.altKey && !e.shiftKey && !isEditing) {
        const key = e.key.toLowerCase()
        if (key === 'v') setActiveTool('select')
        else if (key === 'h') setActiveTool('pan')
        else if (key === 'c') setActiveTool('connect')
        else if (key === 'e') setActiveTool('eraser')
        else if (key === 't') toggleTurboMode()
      }
    },
    [
      undo,
      redo,
      duplicateSelected,
      autoLayout,
      canUndo,
      canRedo,
      selectAll,
      clearSelection,
      copySelected,
      pasteClipboard,
      deleteSelected,
      setActiveTool,
      toggleTurboMode,
      groupSelectionIntoSubflow,
      ungroupSubflow
    ]
  )

  useEffect(() => {
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handler])
}
