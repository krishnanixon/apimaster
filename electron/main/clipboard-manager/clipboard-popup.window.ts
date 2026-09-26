import { app, BrowserWindow, screen } from 'electron'
import { join } from 'path'
import { logger } from '../infra/logger.service'
import {
  CLIPBOARD_POPUP_PREFERRED_HEIGHT,
  CLIPBOARD_POPUP_PREFERRED_WIDTH,
  fitPopupToDisplay
} from './popup-geometry'

const BLUR_HIDE_DELAY_MS = 180
const SHOW_BLUR_GRACE_MS = 450

let popupWindow: BrowserWindow | null = null
let onPopupReady: (() => void) | null = null
let popupContentReady = false
let pendingShow = false
let suppressBlurHideUntil = 0
let warmInFlight = false
let pickerHasFocus = false
const isDev = !app.isPackaged

export function setClipboardPopupReadyHandler(handler: (() => void) | null): void {
  onPopupReady = handler
}

export function suppressQuickPickerBlurHide(ms = 300): void {
  suppressBlurHideUntil = Date.now() + ms
}

function getRendererUrl(): string {
  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    // Lightweight bootstrap in main.tsx loads only the picker (not the full App).
    return `${process.env['ELECTRON_RENDERER_URL']}#/clipboard-picker`
  }
  return join(__dirname, '../renderer/index.html')
}

function overlayLevel(): 'screen-saver' | 'pop-up-menu' {
  // screen-saver sits above native macOS fullscreen Spaces; floating does not.
  return process.platform === 'darwin' ? 'screen-saver' : 'pop-up-menu'
}

function applyOverlayFlags(win: BrowserWindow): void {
  // macOS drops these when a window is hidden or moved across Spaces.
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  win.setAlwaysOnTop(true, overlayLevel())
  if (process.platform === 'darwin') {
    win.setWindowButtonVisibility(false)
  }
}

function positionNearCursor(win: BrowserWindow): void {
  const cursor = screen.getCursorScreenPoint()
  const display = screen.getDisplayNearestPoint(cursor)
  const next = fitPopupToDisplay({
    cursor,
    workArea: display.workArea,
    bounds: display.bounds
  })
  win.setBounds(next, false)
}

function revealQuickPicker(): void {
  if (!popupWindow || popupWindow.isDestroyed()) return

  pickerHasFocus = false
  suppressQuickPickerBlurHide(SHOW_BLUR_GRACE_MS)
  positionNearCursor(popupWindow)
  applyOverlayFlags(popupWindow)

  if (!popupWindow.isVisible()) {
    popupWindow.show()
  }

  applyOverlayFlags(popupWindow)
  popupWindow.moveTop()
  popupWindow.focus()
  pendingShow = false
}

function scheduleBlurHide(win: BrowserWindow): void {
  setTimeout(() => {
    if (win.isDestroyed() || !win.isVisible()) return
    if (Date.now() < suppressBlurHideUntil) {
      scheduleBlurHide(win)
      return
    }
    if (win.isFocused() || !pickerHasFocus) return
    win.hide()
  }, BLUR_HIDE_DELAY_MS)
}

function createPopupWindow(): BrowserWindow {
  popupContentReady = false
  warmInFlight = true
  pickerHasFocus = false

  const win = new BrowserWindow({
    width: CLIPBOARD_POPUP_PREFERRED_WIDTH,
    height: CLIPBOARD_POPUP_PREFERRED_HEIGHT,
    frame: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    transparent: false,
    backgroundColor: '#0a0a0a',
    autoHideMenuBar: true,
    title: 'Clipboard',
    hasShadow: true,
    acceptFirstMouse: true,
    ...(process.platform === 'darwin'
      ? {
          type: 'panel',
          hiddenInMissionControl: true,
          roundedCorners: true
        }
      : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      backgroundThrottling: false
    }
  })

  applyOverlayFlags(win)

  win.on('focus', () => {
    pickerHasFocus = true
  })

  win.on('blur', () => {
    scheduleBlurHide(win)
  })

  win.on('closed', () => {
    if (popupWindow === win) {
      popupWindow = null
      popupContentReady = false
      pendingShow = false
      warmInFlight = false
      pickerHasFocus = false
    }
  })

  win.once('ready-to-show', () => {
    popupContentReady = true
    warmInFlight = false
    onPopupReady?.()
    if (pendingShow) {
      revealQuickPicker()
    }
  })

  win.webContents.on('did-finish-load', () => {
    onPopupReady?.()
  })

  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    warmInFlight = false
    logger.error(
      `Clipboard picker failed to load (${errorCode}): ${errorDescription}`,
      'ClipboardPopup'
    )
  })

  const url = getRendererUrl()
  if (url.startsWith('http')) {
    void win.loadURL(url)
  } else {
    void win.loadFile(url, { hash: '/clipboard-picker' })
  }

  logger.info('Clipboard quick picker window created', 'ClipboardPopup')
  return win
}

export function getClipboardPopupWindow(): BrowserWindow | null {
  if (popupWindow && !popupWindow.isDestroyed()) {
    return popupWindow
  }
  return null
}

export function isQuickPickerVisible(): boolean {
  return Boolean(popupWindow && !popupWindow.isDestroyed() && popupWindow.isVisible())
}

/** Create and load the picker in the background so the first shortcut is instant. */
export function warmQuickPicker(): void {
  if (popupWindow && !popupWindow.isDestroyed()) return
  if (warmInFlight) return
  popupWindow = createPopupWindow()
}

export function showQuickPicker(): void {
  if (!popupWindow || popupWindow.isDestroyed()) {
    pendingShow = true
    popupWindow = createPopupWindow()
    return
  }

  if (!popupContentReady || popupWindow.webContents.isLoading()) {
    pendingShow = true
    return
  }

  revealQuickPicker()
}

export function hideQuickPicker(): void {
  pendingShow = false
  pickerHasFocus = false
  if (popupWindow && !popupWindow.isDestroyed()) {
    popupWindow.hide()
  }
}

export function toggleQuickPicker(): boolean {
  if (isQuickPickerVisible()) {
    hideQuickPicker()
    return false
  }
  showQuickPicker()
  return true
}

export function destroyQuickPicker(): void {
  pendingShow = false
  popupContentReady = false
  warmInFlight = false
  pickerHasFocus = false
  if (popupWindow && !popupWindow.isDestroyed()) {
    popupWindow.destroy()
  }
  popupWindow = null
}
