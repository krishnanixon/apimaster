import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Document } from '@shared/types'
import { useDocumentStore } from '@/features/documents/stores/document.store'

const baseDocument: Document = {
  id: 'doc-1',
  projectId: 'project-1',
  title: 'Original',
  type: 'requirements',
  style: 'professional',
  pageTheme: 'professional',
  layoutPreset: 'normal',
  paddingTop: 56,
  paddingRight: 64,
  paddingBottom: 72,
  paddingLeft: 64,
  pageSettings: {
    pageSize: 'letter',
    orientation: 'portrait',
    headerText: '',
    footerText: '',
    showPageNumbers: true,
    differentFirstPage: false
  },
  comments: [],
  content: 'original-json',
  htmlContent: '<p>Original</p>',
  isPinned: false,
  status: 'draft',
  tags: [],
  lastReviewedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z'
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

describe('document save store', () => {
  const update = vi.fn()

  beforeEach(() => {
    update.mockReset()
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { electronAPI: { documents: { update } } }
    })
    useDocumentStore.setState({
      documents: [baseDocument],
      libraryDocuments: [],
      currentDocument: baseDocument,
      isSaving: false,
      saveError: null,
      lastSaved: null,
      hasUnsavedChanges: true
    })
  })

  it('keeps unsaved state and exposes an error when persistence fails', async () => {
    update.mockResolvedValue({ success: false, error: 'disk unavailable' })

    const saved = await useDocumentStore.getState().updateDocument('doc-1', {
      htmlContent: '<p>Changed</p>'
    })

    expect(saved).toBe(false)
    expect(useDocumentStore.getState().hasUnsavedChanges).toBe(true)
    expect(useDocumentStore.getState().saveError).toBe('disk unavailable')
    expect(useDocumentStore.getState().isSaving).toBe(false)
  })

  it('clears stale JSON when applying HTML-only document edits', async () => {
    update.mockResolvedValue({
      success: true,
      data: {
        ...baseDocument,
        content: '',
        htmlContent: '<p>AI updated</p>',
        updatedAt: '2026-01-02T00:00:00.000Z'
      }
    })

    const saved = await useDocumentStore.getState().applyDocumentEdit('doc-1', '<p>AI updated</p>')

    expect(saved).toBe(true)
    expect(update).toHaveBeenCalledWith('doc-1', {
      htmlContent: '<p>AI updated</p>',
      content: ''
    })
    expect(useDocumentStore.getState().currentDocument?.content).toBe('')
    expect(useDocumentStore.getState().currentDocument?.htmlContent).toBe('<p>AI updated</p>')
  })

  it('does not let out-of-order full responses revert unrelated newer fields', async () => {
    const first = deferred<{ success: true; data: Document }>()
    const second = deferred<{ success: true; data: Document }>()
    update.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)

    const contentSave = useDocumentStore.getState().updateDocument('doc-1', {
      content: 'new-json',
      htmlContent: '<p>New content</p>'
    })
    const titleSave = useDocumentStore.getState().updateDocument('doc-1', { title: 'New title' })

    second.resolve({
      success: true,
      data: { ...baseDocument, title: 'New title', updatedAt: '2026-01-02T00:00:00.000Z' }
    })
    await titleSave
    first.resolve({
      success: true,
      data: {
        ...baseDocument,
        content: 'new-json',
        htmlContent: '<p>New content</p>',
        updatedAt: '2026-01-01T12:00:00.000Z'
      }
    })
    await contentSave

    const document = useDocumentStore.getState().currentDocument
    expect(document?.title).toBe('New title')
    expect(document?.content).toBe('new-json')
    expect(document?.htmlContent).toBe('<p>New content</p>')
    expect(useDocumentStore.getState().isSaving).toBe(false)
  })
})
