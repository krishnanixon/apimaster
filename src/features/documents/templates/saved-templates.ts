import type { DocumentStyle, DocumentType } from '@shared/types'

export interface SavedTemplate {
  id: string
  name: string
  description: string
  type: DocumentType
  style: DocumentStyle
  htmlContent: string
  sections: string[]
  isCustom: true
  createdAt: string
}

const STORAGE_KEY = 'ars-saved-templates'

export function loadSavedTemplates(): SavedTemplate[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as SavedTemplate[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveTemplate(template: Omit<SavedTemplate, 'id' | 'isCustom' | 'createdAt'>): SavedTemplate {
  const existing = loadSavedTemplates()
  const entry: SavedTemplate = {
    ...template,
    id: crypto.randomUUID(),
    isCustom: true,
    createdAt: new Date().toISOString()
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify([entry, ...existing]))
  return entry
}

export function deleteSavedTemplate(id: string): void {
  const filtered = loadSavedTemplates().filter((t) => t.id !== id)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered))
}
