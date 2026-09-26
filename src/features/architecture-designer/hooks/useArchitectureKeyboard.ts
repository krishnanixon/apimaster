import { useEffect } from 'react'
import { useArchitectureEditorStore } from '../stores/architecture-editor.store'

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return (
    tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable
  )
}

/** Editor-wide shortcuts. Skipped while the user is typing in a field. */
export function useArchitectureKeyboard({ onSave }: { onSave: () => void }): void {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey
      const store = useArchitectureEditorStore.getState()

      // Save must work even mid-edit, so it is checked before the typing guard.
      if (mod && event.key.toLowerCase() === 's') {
        event.preventDefault()
        onSave()
        return
      }

      if (isTypingTarget(event.target)) return

      if (mod && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) store.redo()
        else store.undo()
        return
      }

      if (mod && event.key.toLowerCase() === 'y') {
        event.preventDefault()
        store.redo()
        return
      }

      if (mod && event.key.toLowerCase() === 'd') {
        event.preventDefault()
        const [selectedId] = store.selectedComponentIds
        const original = store.model.components.find((c) => c.id === selectedId)
        if (original) {
          // Clearing the id makes the reducer mint a fresh one.
          store.dispatch({
            type: 'ADD_COMPONENT',
            component: { ...original, id: undefined, name: `${original.name} (Copy)` }
          })
        }
        return
      }

      if (event.key === 'Delete' || event.key === 'Backspace') {
        if (store.selectedComponentIds.length > 0) {
          event.preventDefault()
          store.dispatch(
            store.selectedComponentIds.map((componentId) => ({
              type: 'REMOVE_COMPONENT' as const,
              componentId
            }))
          )
          store.clearSelection()
        } else if (store.selectedConnectionId) {
          event.preventDefault()
          store.dispatch({
            type: 'DISCONNECT_COMPONENTS',
            connectionId: store.selectedConnectionId
          })
          store.clearSelection()
        }
        return
      }

      if (event.key === 'Escape') {
        store.clearSelection()
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onSave])
}
