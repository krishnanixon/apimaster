import type { ClipboardHistorySnapshot, ClipboardItem } from '../types/clipboard.types'
import {
  addHistoryItem,
  clearUnpinnedItems,
  removeHistoryItem,
  sortClipboardItems,
  togglePinItem
} from './historyManager'

export interface ClipboardPersistence {
  load: () => ClipboardHistorySnapshot | null
  save: (snapshot: ClipboardHistorySnapshot) => void
}

export class ClipboardStore {
  private items: ClipboardItem[] = []
  private persistence: ClipboardPersistence | null

  constructor(persistence?: ClipboardPersistence) {
    this.persistence = persistence ?? null
  }

  restore(): ClipboardItem[] {
    if (!this.persistence) return []
    const snapshot = this.persistence.load()
    this.items = sortClipboardItems(snapshot?.items ?? [])
    return this.getItems()
  }

  getItems(): ClipboardItem[] {
    return sortClipboardItems(this.items)
  }

  add(entry: ClipboardItem): ClipboardItem[] {
    this.items = addHistoryItem(this.items, entry)
    this.persist()
    return this.getItems()
  }

  pin(id: string): ClipboardItem[] {
    this.items = togglePinItem(this.items, id)
    this.persist()
    return this.getItems()
  }

  remove(id: string): ClipboardItem[] {
    this.items = removeHistoryItem(this.items, id)
    this.persist()
    return this.getItems()
  }

  clearUnpinned(): ClipboardItem[] {
    this.items = clearUnpinnedItems(this.items)
    this.persist()
    return this.getItems()
  }

  replaceAll(items: ClipboardItem[]): ClipboardItem[] {
    this.items = sortClipboardItems(items)
    this.persist()
    return this.getItems()
  }

  private persist(): void {
    if (!this.persistence) return
    this.persistence.save({
      items: this.items,
      updatedAt: Date.now()
    })
  }
}
