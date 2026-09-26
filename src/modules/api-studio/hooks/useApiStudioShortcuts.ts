import { useEffect, useRef } from 'react'
import { useApiStudioStore } from '../stores/apiStudioStore'

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  return target.isContentEditable
}

interface ShortcutHandlers {
  onSaveAs?: () => void
}

export function useApiStudioShortcuts(handlers: ShortcutHandlers = {}): void {
  const activeTabId = useApiStudioStore((s) => s.activeTabId)
  const tabs = useApiStudioStore((s) => s.tabs)
  const sendTabRequest = useApiStudioStore((s) => s.sendTabRequest)
  const openScratchTab = useApiStudioStore((s) => s.openScratchTab)
  const closeTab = useApiStudioStore((s) => s.closeTab)
  const setActiveTab = useApiStudioStore((s) => s.setActiveTab)
  const saveTab = useApiStudioStore((s) => s.saveTab)
  const copyTabAsCurl = useApiStudioStore((s) => s.copyTabAsCurl)
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const mod = e.ctrlKey || e.metaKey

      if (mod && e.key === 'Enter') {
        e.preventDefault()
        if (activeTabId) void sendTabRequest(activeTabId)
        return
      }

      if (mod && e.key.toLowerCase() === 's' && !e.shiftKey) {
        e.preventDefault()
        if (!activeTabId) return
        const tab = tabs.find((t) => t.id === activeTabId)
        if (tab?.collectionId) saveTab(activeTabId)
        else handlersRef.current.onSaveAs?.()
        return
      }

      if (isEditableTarget(e.target)) return

      if (mod && e.shiftKey && e.key.toLowerCase() === 'c') {
        e.preventDefault()
        if (activeTabId) void copyTabAsCurl(activeTabId)
        return
      }

      if (mod && e.key.toLowerCase() === 't') {
        e.preventDefault()
        openScratchTab()
        return
      }

      if (mod && e.key.toLowerCase() === 'w' && activeTabId) {
        e.preventDefault()
        closeTab(activeTabId)
        return
      }

      if (mod && e.key === 'Tab' && tabs.length > 1 && activeTabId) {
        e.preventDefault()
        const index = tabs.findIndex((t) => t.id === activeTabId)
        if (index === -1) return
        const next = e.shiftKey
          ? tabs[(index - 1 + tabs.length) % tabs.length]
          : tabs[(index + 1) % tabs.length]
        setActiveTab(next.id)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [activeTabId, tabs, sendTabRequest, openScratchTab, closeTab, setActiveTab, saveTab, copyTabAsCurl])
}
