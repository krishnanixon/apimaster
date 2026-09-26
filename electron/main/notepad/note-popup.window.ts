import { app, BrowserWindow, screen } from 'electron'
import { join } from 'path'
import { logger } from '../infra/logger.service'

const POPUP_WIDTH = 420
const POPUP_HEIGHT = 380
const CURSOR_OFFSET = 12

let popupWindow: BrowserWindow | null = null
let popupContentReady = false
let pendingShow = false
const isDev = !app.isPackaged

function getRendererUrl(): string {
  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    return `${process.env['ELECTRON_RENDERER_URL']}#/note-popup`
  }
  return join(__dirname, '../renderer/index.html')
}

function positionNearCursor(win: BrowserWindow): void {
  const cursor = screen.getCursorScreenPoint()
  const display = screen.getDisplayNearestPoint(cursor)
  const { x: workX, y: workY, width: workW, height: workH } = display.workArea

  let x = cursor.x + CURSOR_OFFSET
  let y = cursor.y + CURSOR_OFFSET

  if (x + POPUP_WIDTH > workX + workW) {
    x = cursor.x - POPUP_WIDTH - CURSOR_OFFSET
  }
  if (y + POPUP_HEIGHT > workY + workH) {
    y = cursor.y - POPUP_HEIGHT - CURSOR_OFFSET
  }

  x = Math.max(workX, Math.min(x, workX + workW - POPUP_WIDTH))
  y = Math.max(workY, Math.min(y, workY + workH - POPUP_HEIGHT))
  win.setPosition(Math.round(x), Math.round(y))
}

function revealQuickNote(): void {
  if (!popupWindow || popupWindow.isDestroyed()) return

  positionNearCursor(popupWindow)
  if (!popupWindow.isVisible()) popupWindow.show()
  popupWindow.focus()
  pendingShow = false
}

function createPopupWindow(): BrowserWindow {
  popupContentReady = false

  const win = new BrowserWindow({
    width: POPUP_WIDTH,
    height: POPUP_HEIGHT,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    backgroundColor: '#0a0a0a',
    autoHideMenuBar: true,
    title: 'Quick Note',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true
    }
  })

  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  win.on('closed', () => {
    if (popupWindow === win) {
      popupWindow = null
      popupContentReady = false
      pendingShow = false
    }
  })

  win.once('ready-to-show', () => {
    popupContentReady = true
    if (pendingShow) revealQuickNote()
  })

  const url = getRendererUrl()
  if (url.startsWith('http')) {
    void win.loadURL(url)
  } else {
    void win.loadFile(url, { hash: '/note-popup' })
  }

  logger.info('Quick note popup window created', 'QuickNotePopup')
  return win
}

export function isQuickNoteVisible(): boolean {
  return Boolean(popupWindow && !popupWindow.isDestroyed() && popupWindow.isVisible())
}

export function showQuickNote(): void {
  if (!popupWindow || popupWindow.isDestroyed()) {
    pendingShow = true
    popupWindow = createPopupWindow()
    return
  }

  if (!popupContentReady || popupWindow.webContents.isLoading()) {
    pendingShow = true
    return
  }

  revealQuickNote()
}

export function hideQuickNote(): void {
  pendingShow = false
  if (popupWindow && !popupWindow.isDestroyed()) popupWindow.hide()
}

export function toggleQuickNote(): boolean {
  if (isQuickNoteVisible()) {
    hideQuickNote()
    return false
  }
  showQuickNote()
  return true
}

export function destroyQuickNote(): void {
  pendingShow = false
  popupContentReady = false
  if (popupWindow && !popupWindow.isDestroyed()) popupWindow.destroy()
  popupWindow = null
}
