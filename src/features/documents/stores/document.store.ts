import { create } from 'zustand'
import type {
  Document,
  DocumentSyncSuggestion,
  DocumentType,
  DocumentStyle,
  DocumentVersion,
  DocumentWithProject,
  GenerateRequirementInput
} from '@shared/types'

export interface GenerationOverlayJob {
  id: string
  label: string
  status: 'queued' | 'preparing' | 'writing' | 'saving' | 'done' | 'error'
  detail?: string
}

export interface GenerationOverlayState {
  title: string
  detail?: string
  current: number
  total: number
  jobs: GenerationOverlayJob[]
  kbPercent?: number
}

interface DocumentState {
  documents: Document[]
  currentDocument: Document | null
  versions: DocumentVersion[]
  /** List fetch (documents page, sidebar). */
  isLoading: boolean
  /** Single-document fetch (editor). Kept separate so list loads don't race the editor. */
  isLoadingDocument: boolean
  loadDocumentRequestId: number
  isGenerating: boolean
  generationLocks: number
  generationProgress: GenerationOverlayState | null
  isSaving: boolean
  saveError: string | null
  lastSaved: Date | null
  hasUnsavedChanges: boolean
  loadDocuments: (projectId: string) => Promise<void>
  loadDocument: (id: string) => Promise<void>
  createDocument: (
    projectId: string,
    options?: {
      type?: DocumentType
      title?: string
      style?: DocumentStyle
      htmlContent?: string
    }
  ) => Promise<Document | null>
  updateDocument: (id: string, data: Partial<Document>) => Promise<boolean>
  deleteDocument: (id: string) => Promise<void>
  duplicateDocument: (id: string) => Promise<Document | null>
  generateRequirement: (
    projectId: string,
    type: DocumentType,
    style: DocumentStyle,
    prompt: string,
    options?: Pick<
      GenerateRequirementInput,
      'title' | 'documentLength' | 'customWordCount' | 'wordTarget' | 'maxTokens' | 'knowledgeAlreadyInPrompt'
    >
  ) => Promise<{ document: Document | null; error?: string }>
  beginGeneration: (progress: GenerationOverlayState) => void
  updateGeneration: (progress: Partial<GenerationOverlayState>) => void
  endGeneration: () => void
  /** Runs a full-document AI edit and returns the proposed HTML WITHOUT persisting it — callers should show a diff review before applying. */
  proposeAIEdit: (
    instruction: string,
    htmlContent: string,
    meta?: { title?: string; style?: DocumentStyle; type?: DocumentType }
  ) => Promise<string | null>
  /** Runs a section-scoped AI edit and returns the full merged HTML + the edited section HTML WITHOUT persisting it. */
  proposeSectionAIEdit: (
    sectionTitle: string,
    instruction: string,
    htmlContent: string,
    meta?: { title?: string; style?: DocumentStyle; type?: DocumentType }
  ) => Promise<{ fullHtml: string; sectionHtml: string } | null>
  /** Persists an AI-proposed (or any) HTML edit once the user accepts it from the diff review. */
  applyDocumentEdit: (documentId: string, html: string) => Promise<boolean>
  editSelectionWithAI: (
    instruction: string,
    selectedText: string,
    meta?: { style?: DocumentStyle; type?: DocumentType }
  ) => Promise<string | null>
  loadVersions: (documentId: string) => Promise<void>
  restoreVersion: (documentId: string, versionId: string) => Promise<void>
  saveVersion: (documentId: string, label: string) => Promise<boolean>
  markReviewed: (documentId: string) => Promise<boolean>
  setCurrentDocument: (doc: Document | null) => void
  markUnsaved: () => void
  markSaved: () => void
  syncSuggestions: DocumentSyncSuggestion[]
  isLoadingSyncSuggestions: boolean
  loadSyncSuggestions: (projectId: string) => Promise<void>
  libraryDocuments: DocumentWithProject[]
  isLoadingLibrary: boolean
  loadAllDocuments: () => Promise<void>
}

let pendingDocumentUpdates = 0

export const useDocumentStore = create<DocumentState>((set, get) => ({
  documents: [],
  currentDocument: null,
  versions: [],
  isLoading: false,
  isLoadingDocument: false,
  loadDocumentRequestId: 0,
  isGenerating: false,
  generationLocks: 0,
  generationProgress: null,
  isSaving: false,
  saveError: null,
  lastSaved: null,
  hasUnsavedChanges: false,
  syncSuggestions: [],
  isLoadingSyncSuggestions: false,
  libraryDocuments: [],
  isLoadingLibrary: false,

  loadDocuments: async (projectId) => {
    set({ isLoading: true })
    try {
      const result = await window.electronAPI.documents.list(projectId)
      if (result.success && result.data) {
        set({ documents: result.data, isLoading: false })
      } else {
        set({ isLoading: false })
      }
    } catch {
      set({ isLoading: false })
    }
  },

  loadAllDocuments: async () => {
    set({ isLoadingLibrary: true })
    try {
      const listAll = window.electronAPI?.documents?.listAll
      if (typeof listAll === 'function') {
        const result = await listAll()
        if (result.success && result.data) {
          set({ libraryDocuments: result.data, isLoadingLibrary: false })
          return
        }
      }

      const listed = await window.electronAPI.projects.list('active')
      const rows: DocumentWithProject[] = []
      for (const project of listed.data ?? []) {
        const docs = await window.electronAPI.documents.list(project.id)
        if (docs.success && docs.data) {
          rows.push(...docs.data.map((doc) => ({ ...doc, projectName: project.name })))
        }
      }
      rows.sort((a, b) => {
        if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      })
      set({ libraryDocuments: rows, isLoadingLibrary: false })
    } catch {
      set({ isLoadingLibrary: false })
    }
  },

  loadDocument: async (id) => {
    const requestId = get().loadDocumentRequestId + 1
    set({
      loadDocumentRequestId: requestId,
      isLoadingDocument: true,
      currentDocument: null,
      hasUnsavedChanges: false
    })
    const result = await window.electronAPI.documents.get(id)
    if (get().loadDocumentRequestId !== requestId) return
    if (result.success && result.data) {
      set({ currentDocument: result.data, isLoadingDocument: false, hasUnsavedChanges: false })
    } else {
      set({ isLoadingDocument: false })
    }
  },

  createDocument: async (projectId, options) => {
    const result = await window.electronAPI.documents.create({
      projectId,
      type: options?.type ?? 'requirements',
      title: options?.title ?? 'Untitled Document',
      style: options?.style ?? 'professional',
      htmlContent: options?.htmlContent
    })
    if (result.success && result.data) {
      set((state) => ({
        documents: [result.data!, ...state.documents]
      }))
      return result.data
    }
    return null
  },

  updateDocument: async (id, data) => {
    pendingDocumentUpdates += 1
    set({ isSaving: true, saveError: null })
    try {
      const result = await window.electronAPI.documents.update(id, data)
      if (!result.success || !result.data) {
        set({ saveError: result.error ?? 'Could not save document' })
        return false
      }

      // Merge only fields from this mutation. A complete server response may have been
      // produced before a newer save and must not roll newer local state backward.
      set((state) => ({
        documents: state.documents.map((document) =>
          document.id === id
            ? { ...document, ...data, updatedAt: result.data!.updatedAt }
            : document
        ),
        libraryDocuments: state.libraryDocuments.map((document) =>
          document.id === id
            ? { ...document, ...data, updatedAt: result.data!.updatedAt }
            : document
        ),
        currentDocument:
          state.currentDocument?.id === id
            ? { ...state.currentDocument, ...data, updatedAt: result.data!.updatedAt }
            : state.currentDocument,
        lastSaved: new Date(),
        saveError: null
      }))
      return true
    } catch (error) {
      set({ saveError: error instanceof Error ? error.message : 'Could not save document' })
      return false
    } finally {
      pendingDocumentUpdates = Math.max(0, pendingDocumentUpdates - 1)
      set({ isSaving: pendingDocumentUpdates > 0 })
    }
  },

  deleteDocument: async (id) => {
    const result = await window.electronAPI.documents.delete(id)
    if (result.success) {
      set((state) => ({
        documents: state.documents.filter((d) => d.id !== id),
        libraryDocuments: state.libraryDocuments.filter((d) => d.id !== id),
        currentDocument: state.currentDocument?.id === id ? null : state.currentDocument
      }))
    }
  },

  duplicateDocument: async (id) => {
    const result = await window.electronAPI.documents.duplicate(id)
    if (result.success && result.data) {
      set((state) => ({
        documents: [result.data!, ...state.documents]
      }))
      return result.data
    }
    return null
  },

  beginGeneration: (progress) => {
    const locks = get().generationLocks + 1
    set({ isGenerating: true, generationLocks: locks, generationProgress: progress })
  },

  updateGeneration: (progress) => {
    const current = get().generationProgress
    if (!current) {
      set({
        generationProgress: {
          title: progress.title ?? 'Generating documents',
          detail: progress.detail,
          current: progress.current ?? 1,
          total: progress.total ?? 1,
          jobs: progress.jobs ?? [],
          kbPercent: progress.kbPercent
        }
      })
      return
    }
    set({ generationProgress: { ...current, ...progress } })
  },

  endGeneration: () => {
    const locks = Math.max(0, get().generationLocks - 1)
    set({
      generationLocks: locks,
      isGenerating: locks > 0,
      generationProgress: locks > 0 ? get().generationProgress : null
    })
  },

  generateRequirement: async (projectId, type, style, prompt, options) => {
    const alreadyBlocking = get().generationLocks > 0
    if (!alreadyBlocking) {
      get().beginGeneration({
        title: 'Generating documents',
        detail: 'Writing from Knowledge…',
        current: 1,
        total: 1,
        jobs: [
          {
            id: type,
            label: options?.title || type.replace(/_/g, ' '),
            status: 'writing',
            detail: 'Writing sections from Knowledge…'
          }
        ]
      })
    }
    try {
      const result = await window.electronAPI.chat.generateRequirement({
        projectId,
        type,
        style,
        prompt,
        title: options?.title,
        documentLength: options?.documentLength,
        customWordCount: options?.customWordCount,
        wordTarget: options?.wordTarget,
        maxTokens: options?.maxTokens,
        knowledgeAlreadyInPrompt: options?.knowledgeAlreadyInPrompt
      })
      if (result.success && result.data) {
        set((state) => ({
          documents: [result.data!, ...state.documents],
          currentDocument: result.data!
        }))
        return { document: result.data }
      }
      const error = result.error ?? 'Failed to generate document'
      return { document: null, error }
    } catch (e) {
      const error = e instanceof Error ? e.message : 'Failed to generate document'
      return { document: null, error }
    } finally {
      if (!alreadyBlocking) get().endGeneration()
    }
  },

  proposeAIEdit: async (instruction, htmlContent, meta) => {
    set({ isSaving: true })
    const result = await window.electronAPI.chat.editDocument({
      htmlContent,
      instruction,
      title: meta?.title,
      style: meta?.style,
      type: meta?.type,
      projectId: get().currentDocument?.projectId
    })
    set({ isSaving: false })
    if (result.success && result.data) {
      return result.data
    }
    return null
  },

  proposeSectionAIEdit: async (sectionTitle, instruction, htmlContent, meta) => {
    set({ isSaving: true })
    const result = await window.electronAPI.chat.editSection({
      htmlContent,
      sectionTitle,
      instruction,
      title: meta?.title,
      style: meta?.style,
      type: meta?.type,
      projectId: get().currentDocument?.projectId
    })
    set({ isSaving: false })
    if (result.success && result.data) {
      return result.data
    }
    return null
  },

  applyDocumentEdit: async (documentId, html) => {
    // Persist HTML only; Tiptap JSON is regenerated on the next editor change.
    // Clearing stale JSON avoids reloads preferring outdated structure over new HTML.
    return get().updateDocument(documentId, { htmlContent: html, content: '' })
  },

  editSelectionWithAI: async (instruction, selectedText, meta) => {
    const result = await window.electronAPI.chat.editSelection({
      instruction,
      selectedText,
      style: meta?.style,
      type: meta?.type,
      projectId: get().currentDocument?.projectId
    })
    if (result.success && result.data) {
      return result.data
    }
    return null
  },

  loadVersions: async (documentId) => {
    const result = await window.electronAPI.documents.getVersions(documentId)
    if (result.success && result.data) {
      set({ versions: result.data })
    }
  },

  restoreVersion: async (documentId, versionId) => {
    const result = await window.electronAPI.documents.restoreVersion(documentId, versionId)
    if (result.success && result.data) {
      set({ currentDocument: result.data, hasUnsavedChanges: false })
      await get().loadVersions(documentId)
    }
  },

  saveVersion: async (documentId, label) => {
    const result = await window.electronAPI.documents.saveVersion(documentId, label)
    if (result.success) {
      await get().loadVersions(documentId)
      return true
    }
    return false
  },

  markReviewed: async (documentId) => {
    const result = await window.electronAPI.documents.markReviewed(documentId)
    if (result.success && result.data) {
      set((state) => ({
        documents: state.documents.map((d) => (d.id === documentId ? result.data! : d)),
        currentDocument:
          state.currentDocument?.id === documentId ? result.data! : state.currentDocument,
        syncSuggestions: state.syncSuggestions.filter((s) => s.documentId !== documentId)
      }))
      return true
    }
    return false
  },

  setCurrentDocument: (doc) => set({ currentDocument: doc }),

  markUnsaved: () => set({ hasUnsavedChanges: true }),

  markSaved: () => set({ hasUnsavedChanges: false, lastSaved: new Date() }),

  loadSyncSuggestions: async (projectId) => {
    set({ isLoadingSyncSuggestions: true })
    try {
      const result = await window.electronAPI.documents.getSyncSuggestions(projectId)
      if (result.success && result.data) {
        set({ syncSuggestions: result.data, isLoadingSyncSuggestions: false })
      } else {
        set({ isLoadingSyncSuggestions: false })
      }
    } catch {
      set({ isLoadingSyncSuggestions: false })
    }
  }
}))
