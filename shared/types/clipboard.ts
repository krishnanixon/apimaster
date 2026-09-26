export type ClipboardItemType = 'text' | 'code' | 'url'

export interface ClipboardItem {
  id: string
  content: string
  type: ClipboardItemType
  timestamp: number
  sourceApp?: string
  pinned: boolean
}

export type ClipboardSearchFilter = 'all' | 'text' | 'code' | 'url' | 'pinned'

export interface ClipboardSearchQuery {
  query?: string
  filter?: ClipboardSearchFilter
}

export interface ClipboardHistorySnapshot {
  items: ClipboardItem[]
  updatedAt: number
}
