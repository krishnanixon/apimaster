import { app, BrowserWindow, nativeTheme, shell } from 'electron'
import { existsSync } from 'fs'
import { join } from 'path'
import { PRODUCT_APP_ICON_FILE, PRODUCT_NAME } from '@shared/constants/product'
import { IPC_CHANNELS } from '@shared/ipc/channels'

const isDev = !app.isPackaged

let mainWindow: BrowserWindow | null = null

export function getMainWindow(): BrowserWindow | null {
  return mainWindow && !mainWindow.isDestroyed() ? mainWindow : null
}

export function windowFromEvent(event: Electron.IpcMainInvokeEvent): BrowserWindow | null {
  return BrowserWindow.fromWebContents(event.sender) ?? getMainWindow()
}

export function showMainWindow(): BrowserWindow {
  const win = getMainWindow() ?? createMainWindow()
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
  return win
}

/** Navigate the renderer (hash router) without reloading the page. */
export function navigateMainWindow(path: string): void {
  const win = showMainWindow()
  win.webContents.send(IPC_CHANNELS.APP_NAVIGATE, path)
}

export function createMainWindow(): BrowserWindow {
  const existing = getMainWindow()
  if (existing) return existing

  const iconPath = getAppIconPath()
  let revealed = false

  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 580,
    show: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#09090b' : '#ffffff',
    autoHideMenuBar: true,
    title: PRODUCT_NAME,
    ...(iconPath ? { icon: iconPath } : {}),
    ...macTitleBarOptions(),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      // Enables Chromium's built-in PDF viewer for PDF response previews (no third-party plugins exist in Electron).
      plugins: true,
      backgroundThrottling: false
    }
  })
  mainWindow = win

  const reveal = () => {
    if (revealed || win.isDestroyed()) return
    revealed = true
    win.maximize()
    win.show()
    emitMacWindowChrome(win)
  }

  win.webContents.session.setPermissionRequestHandler((_contents, permission, callback) => {
    callback(
      permission === 'clipboard-read' ||
        permission === 'clipboard-sanitized-write' ||
        permission === 'fullscreen' ||
        permission === 'openExternal' ||
        permission === 'notifications'
    )
  })

  win.once('ready-to-show', reveal)
  win.webContents.once('did-finish-load', reveal)
  win.webContents.on('did-fail-load', (_event, code, description, url) => {
    console.error(`Window failed to load (${code}) ${description} ${url}`)
    reveal()
  })
  win.webContents.setWindowOpenHandler((details) => {
    void shell.openExternal(details.url)
    return { action: 'deny' }
  })
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null
  })
  attachMacWindowChrome(win)

  void loadRenderer(win)
  return win
}

async function loadRenderer(win: BrowserWindow): Promise<void> {
  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    await win.loadURL(`${process.env['ELECTRON_RENDERER_URL'].replace(/\/$/, '')}#/`)
    return
  }
  await win.loadFile(join(__dirname, '../renderer/index.html'), { hash: '/' })
}

export function getAppIconPath(): string | undefined {
  const candidates = app.isPackaged
    ? [join(process.resourcesPath, `resources/${PRODUCT_APP_ICON_FILE}`)]
    : [join(__dirname, `../../public/${PRODUCT_APP_ICON_FILE}`), join(process.cwd(), `public/${PRODUCT_APP_ICON_FILE}`)]
  return candidates.find((item) => existsSync(item))
}

function isMac(): boolean {
  return process.platform === 'darwin'
}

function macTitleBarOptions(): Electron.BrowserWindowConstructorOptions {
  if (!isMac()) return {}
  return {
    titleBarStyle: 'hiddenInset',
    // Vertically centred on the 38px title bar (AppShell): 13 + 12px button / 2 = 19.
    trafficLightPosition: { x: 16, y: 13 }
  }
}

function emitMacWindowChrome(win: BrowserWindow): void {
  if (win.isDestroyed()) return
  win.webContents.send(IPC_CHANNELS.APP_WINDOW_CHROME, {
    fullscreen: win.isFullScreen(),
    maximized: win.isMaximized()
  })
}

function attachMacWindowChrome(win: BrowserWindow): void {
  if (!isMac()) return
  const sync = () => emitMacWindowChrome(win)
  for (const event of ['show', 'restore', 'maximize', 'unmaximize', 'enter-full-screen', 'leave-full-screen'] as const) {
    win.on(event as 'show', sync)
  }
  win.webContents.on('did-finish-load', sync)
}
