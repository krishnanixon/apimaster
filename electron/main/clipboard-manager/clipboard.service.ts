import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { app, BrowserWindow } from 'electron'
import type { ClipboardHistorySnapshot, ClipboardItem, ClipboardSearchQuery } from '@shared/types/clipboard'
import { IPC_CHANNELS } from '@shared/ipc/channels'
import { ClipboardStore } from '../../../src/modules/clipboard-manager/core/clipboardStore'
import type { ClipboardPersistence } from '../../../src/modules/clipboard-manager/core/clipboardStore'
import { ClipboardWatcher } from '../../../src/modules/clipboard-manager/core/clipboardWatcher'
import { createClipboardEntry } from '../../../src/modules/clipboard-manager/core/clipboardEngine'
import { CLIPBOARD_POLL_INTERVAL_MS } from '../../../src/modules/clipboard-manager/types/clipboard.types'
import { searchClipboardItemsFuzzy } from '../../../src/modules/clipboard-manager/services/search.service'
import { logger } from '../infra/logger.service'
import { broadcastToWorkbench, openOrFocusWindow } from '../windows/window-manager'
import {
  getClipboardPopupWindow,
  hideQuickPicker,
  isQuickPickerVisible,
  setClipboardPopupReadyHandler,
  suppressQuickPickerBlurHide,
  toggleQuickPicker,
  warmQuickPicker
} from './clipboard-popup.window'
import {
  captureForegroundWindowAsync,
  getForegroundAppName,
  pasteToPreviousWindow
} from './paste.service'

const STORE_FILE = 'clipboard-manager.json'
const PERSIST_DEBOUNCE_MS = 250

let mainWindowGetter: (() => BrowserWindow | null) | null = null

export function setClipboardMainWindowGetter(getter: () => BrowserWindow | null): void {
  mainWindowGetter = getter
}

function getStorePath(): string {
  const dir = join(app.getPath('userData'), 'data')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return join(dir, STORE_FILE)
}

function createPersistence(): ClipboardPersistence {
  let persistTimer: ReturnType<typeof setTimeout> | null = null
  let pendingSnapshot: ClipboardHistorySnapshot | null = null

  const flush = (): void => {
    if (!pendingSnapshot) return
    const snapshot = pendingSnapshot
    pendingSnapshot = null
    try {
      writeFileSync(getStorePath(), JSON.stringify(snapshot), 'utf-8')
    } catch (error) {
      logger.warn(`Clipboard persist failed: ${error}`, 'Clipboard')
    }
  }

  return {
    load(): ClipboardHistorySnapshot | null {
      const path = getStorePath()
      if (!existsSync(path)) return null
      try {
        return JSON.parse(readFileSync(path, 'utf-8')) as ClipboardHistorySnapshot
      } catch {
        return null
      }
    },
    save(snapshot: ClipboardHistorySnapshot): void {
      pendingSnapshot = snapshot
      if (persistTimer) clearTimeout(persistTimer)
      persistTimer = setTimeout(() => {
        persistTimer = null
        flush()
      }, PERSIST_DEBOUNCE_MS)
    }
  }
}

class ClipboardManagerService {
  private readonly store = new ClipboardStore(createPersistence())
  private watcher: ClipboardWatcher | null = null

  start(): void {
    this.store.restore()
    this.watcher = new ClipboardWatcher({
      intervalMs: CLIPBOARD_POLL_INTERVAL_MS,
      onChange: (content) => this.handleClipboardChange(content)
    })
    this.watcher.start()
    setClipboardPopupReadyHandler(() => this.syncToRenderer())
    // Preload the lightweight picker so Cmd/Ctrl+Shift+V is instant.
    setTimeout(() => warmQuickPicker(), 800)
    logger.info('Clipboard manager started', 'Clipboard')
  }

  readSystemClipboard(): string {
    return this.watcher?.readCurrentText() ?? ''
  }

  syncToRenderer(): void {
    this.broadcastUpdate(this.store.getItems())
  }

  stop(): void {
    this.watcher?.stop()
    this.watcher = null
    setClipboardPopupReadyHandler(null)
  }

  list(): ClipboardItem[] {
    return this.store.getItems()
  }

  /** Most recent history item by timestamp (project clipboard), not OS clipboard. */
  getLatestItem(): ClipboardItem | null {
    const items = this.store.getItems()
    if (items.length === 0) return null
    return [...items].sort((a, b) => b.timestamp - a.timestamp)[0] ?? null
  }

  getLatestText(max = 12_000): string {
    const latest = this.getLatestItem()
    const fromHistory = latest?.content?.trim() ?? ''
    if (fromHistory) return fromHistory.slice(0, max)
    return this.readSystemClipboard().trim().slice(0, max)
  }

  search(query: ClipboardSearchQuery): ClipboardItem[] {
    return searchClipboardItemsFuzzy(this.store.getItems(), query)
  }

  copyToClipboard(id: string): boolean {
    const item = this.store.getItems().find((entry) => entry.id === id)
    if (!item) return false
    suppressQuickPickerBlurHide()
    this.watcher?.writeText(item.content)
    return true
  }

  writeText(content: string): void {
    this.watcher?.writeText(content)
  }

  pin(id: string): ClipboardItem[] {
    const items = this.store.pin(id)
    this.broadcastUpdate(items)
    return items
  }

  remove(id: string): ClipboardItem[] {
    const items = this.store.remove(id)
    this.broadcastUpdate(items)
    return items
  }

  clearUnpinned(): ClipboardItem[] {
    const items = this.store.clearUnpinned()
    this.broadcastUpdate(items)
    return items
  }

  openPanel(): void {
    const win = openOrFocusWindow({ path: '/clipboard', kind: 'module', reuse: true })
    win.webContents.send(IPC_CHANNELS.CLIPBOARD_OPEN_PANEL)
  }

  async openQuickPicker(): Promise<void> {
    if (isQuickPickerVisible()) {
      hideQuickPicker()
      return
    }

    await captureForegroundWindowAsync()
    toggleQuickPicker()
    this.syncToRenderer()
  }

  closeQuickPicker(): void {
    hideQuickPicker()
  }

  async pickAndPaste(id: string): Promise<boolean> {
    const copied = this.copyToClipboard(id)
    if (!copied) return false

    suppressQuickPickerBlurHide()
    hideQuickPicker()
    await pasteToPreviousWindow()
    return true
  }

  private handleClipboardChange(content: string): void {
    void this.ingestClipboard(content)
  }

  private async ingestClipboard(content: string): Promise<void> {
    const sourceApp = (await getForegroundAppName()) ?? undefined
    const entry = createClipboardEntry(content, sourceApp)
    if (!entry) return
    const items = this.store.add(entry)
    this.broadcastUpdate(items)
    logger.info(
      `Clipboard captured (${entry.type}, ${entry.content.length} chars${sourceApp ? `, ${sourceApp}` : ''})`,
      'Clipboard'
    )
  }

  private broadcastUpdate(items: ClipboardItem[]): void {
    const snapshot: ClipboardHistorySnapshot = {
      items,
      updatedAt: Date.now()
    }

    broadcastToWorkbench(IPC_CHANNELS.CLIPBOARD_HISTORY_UPDATE, snapshot)

    const popupWin = getClipboardPopupWindow()
    if (popupWin && !popupWin.isDestroyed()) {
      popupWin.webContents.send(IPC_CHANNELS.CLIPBOARD_HISTORY_UPDATE, snapshot)
    }
  }
}

export const clipboardManagerService = new ClipboardManagerService()
