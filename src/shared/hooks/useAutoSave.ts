import { useCallback, useEffect, useRef } from 'react'
import { useDocumentStore } from '@/features/documents/stores/document.store'
import { useSettingsStore } from '@/shared/stores/settings.store'

interface SaveSnapshot {
  content: string
  htmlContent: string
  title: string
}

export function useAutoSave(
  documentId: string | undefined,
  content: string,
  htmlContent: string,
  isDirty: boolean,
  enabled = true,
  extra?: { title?: string }
) {
  const { updateDocument, markSaved } = useDocumentStore()
  const { settings } = useSettingsStore()
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const snapshotRef = useRef<SaveSnapshot>({ content: '', htmlContent: '', title: '' })
  const activeDocumentIdRef = useRef(documentId)
  const savingRef = useRef(false)
  const queuedRef = useRef(false)
  const title = extra?.title ?? ''
  const latestRef = useRef({ documentId, content, htmlContent, title, isDirty })
  latestRef.current = { documentId, content, htmlContent, title, isDirty }

  const save = useCallback(async () => {
    if (savingRef.current) {
      queuedRef.current = true
      return
    }

    savingRef.current = true
    try {
      do {
        queuedRef.current = false
        const latest = latestRef.current
        if (!latest.documentId || !latest.isDirty) return
        if (latest.documentId !== activeDocumentIdRef.current) return

        const payload: SaveSnapshot = {
          content: latest.content,
          htmlContent: latest.htmlContent,
          title: latest.title
        }
        const unchanged =
          payload.content === snapshotRef.current.content &&
          payload.htmlContent === snapshotRef.current.htmlContent &&
          payload.title === snapshotRef.current.title
        if (unchanged) return

        const saved = await updateDocument(latest.documentId, payload)
        if (!saved) {
          if (retryRef.current) clearTimeout(retryRef.current)
          retryRef.current = setTimeout(() => void save(), 2500)
          return
        }

        snapshotRef.current = payload
        const current = latestRef.current
        const stillCurrent =
          current.documentId === latest.documentId &&
          current.content === payload.content &&
          current.htmlContent === payload.htmlContent &&
          current.title === payload.title
        if (stillCurrent) markSaved()
        else queuedRef.current = true
      } while (queuedRef.current)
    } finally {
      savingRef.current = false
    }
  }, [markSaved, updateDocument])

  useEffect(() => {
    activeDocumentIdRef.current = documentId
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    if (retryRef.current) {
      clearTimeout(retryRef.current)
      retryRef.current = null
    }
  }, [documentId])

  useEffect(() => {
    if (!isDirty) snapshotRef.current = { content, htmlContent, title }
  }, [content, htmlContent, title, isDirty, documentId])

  useEffect(() => {
    const autoSaveMs = settings?.autoSaveMs ?? 3000
    const autoSaveEnabled = enabled && autoSaveMs > 0

    if (!autoSaveEnabled || !documentId || !isDirty) {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
      return
    }

    const unchanged =
      content === snapshotRef.current.content &&
      htmlContent === snapshotRef.current.htmlContent &&
      title === snapshotRef.current.title
    if (unchanged) return

    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    const scheduledForId = documentId
    timeoutRef.current = setTimeout(() => {
      if (activeDocumentIdRef.current === scheduledForId) void save()
    }, autoSaveMs)

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [content, htmlContent, title, documentId, enabled, isDirty, save, settings?.autoSaveMs])

  useEffect(() => {
    const flushWhenHidden = () => {
      if (document.visibilityState === 'hidden') void save()
    }
    const flushOnBlur = () => void save()
    window.addEventListener('blur', flushOnBlur)
    document.addEventListener('visibilitychange', flushWhenHidden)
    return () => {
      window.removeEventListener('blur', flushOnBlur)
      document.removeEventListener('visibilitychange', flushWhenHidden)
      void save()
    }
  }, [save])
}
