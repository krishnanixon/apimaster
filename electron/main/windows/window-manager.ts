import { app, BrowserWindow, nativeTheme, screen, shell } from 'electron'
import { existsSync } from 'fs'
import { join } from 'path'
import { PRODUCT_NAME } from '@shared/constants/product'
import { IPC_CHANNELS } from '@shared/ipc/channels'
import {
  getModuleWindowProfile,
  isPopoutModulePath,
  isProjectWindowSearch,
  isProjectWorkspacePath,
  moduleWindowKey,
  moduleWindowTitle,
  normalizeWindowPath,
  parseProjectIdFromPath,
  projectWindowKey,
  projectWindowPath,
  splitRoute,
  stripModuleWindowQuery,
  withModuleWindowQuery,
  withProjectWindowQuery,
  type WindowKind
} from '@shared/lib/module-windows'
import { attachTrayCloseBehavior, showDockIfNeeded } from '../bootstrap/tray'

const isDev = !app.isPackaged
const MAX_APP_WINDOWS = 12
const CASCADE_OFFSET = 28

export interface CreateWorkbenchWindowOptions {
  path?: string
  kind?: WindowKind
  reuse?: boolean
}

interface WindowRecord {
  win: BrowserWindow
  kind: WindowKind
  key: string
  path: string
}

const windows = new Map<number, WindowRecord>()
let lastFocusedId: number | null = null
let onReady: ((win: BrowserWindow) => void) | null = null
let onWindowsChanged: (() => void) | null = null

export function setWorkbenchReadyHandler(handler: ((win: BrowserWindow) => void) | null): void {
  onReady = handler
}

export function setWorkbenchWindowsChangedHandler(handler: (() => void) | null): void {
  onWindowsChanged = handler
}

export function isWorkbenchWindow(win: BrowserWindow | null | undefined): boolean {
  return Boolean(win && !win.isDestroyed() && windows.has(win.id))
}

export function getAllWorkbenchWindows(): BrowserWindow[] {
  return [...windows.values()].filter((record) => !record.win.isDestroyed()).map((record) => record.win)
}

function getLiveRecords(): WindowRecord[] {
  return [...windows.values()].filter((record) => !record.win.isDestroyed())
}

function getWorkbenchRecords(): WindowRecord[] {
  return getLiveRecords().filter((record) => record.kind === 'workbench')
}

export function getWindowById(id: number): BrowserWindow | null {
  const record = windows.get(id)
  if (!record || record.win.isDestroyed()) return null
  return record.win
}

export function getLastWorkbenchWindow(): BrowserWindow | null {
  if (lastFocusedId != null) {
    const record = windows.get(lastFocusedId)
    if (record && !record.win.isDestroyed()) return record.win
  }
  return getAllWorkbenchWindows()[0] ?? null
}

export function getFocusedWorkbenchWindow(): BrowserWindow | null {
  const focused = BrowserWindow.getFocusedWindow()
  if (focused && isWorkbenchWindow(focused)) return focused
  return getLastWorkbenchWindow()
}

export function windowFromEvent(event: Electron.IpcMainInvokeEvent): BrowserWindow | null {
  return BrowserWindow.fromWebContents(event.sender) ?? getFocusedWorkbenchWindow()
}

export function showWorkbenchWindow(win: BrowserWindow, options?: { maximize?: boolean }): void {
  if (win.isDestroyed()) return
  if (win.isMinimized()) win.restore()
  if (options?.maximize) maximizeWindow(win)
  win.show()
  showDockIfNeeded()
  restoreMacWindowButtons(win)
  win.focus()
}

function maximizeWindow(win: BrowserWindow): void {
  if (win.isDestroyed() || win.isMaximized()) return
  win.maximize()
}

/** Code Editor, API Studio, and the main Workbench open maximized. */
function shouldOpenMaximized(kind: WindowKind, path: string): boolean {
  if (kind === 'workbench') return true
  const pathname = splitRoute(path).pathname
  return (
    pathname === '/code-editor' ||
    pathname === '/api-studio' ||
    /\/api-studio\/?$/.test(pathname)
  )
}

export function listWindowInfo(): Array<{ id: number; title: string; focused: boolean; kind: WindowKind; path: string }> {
  const focusedId = getFocusedWorkbenchWindow()?.id
  return getLiveRecords().map((record) => ({
    id: record.win.id,
    title: record.win.getTitle(),
    focused: record.win.id === focusedId,
    kind: record.kind,
    path: record.path
  }))
}

export function broadcastToWorkbench(channel: string, ...args: unknown[]): void {
  for (const win of getAllWorkbenchWindows()) {
    win.webContents.send(channel, ...args)
  }
}

export function navigateWorkbenchWindow(win: BrowserWindow, path: string): void {
  const record = windows.get(win.id)
  let nextPath = path
  if (record?.kind === 'module') nextPath = withModuleWindowQuery(path)
  else if (record?.kind === 'project') {
    const projectId = parseProjectIdFromPath(record.path) ?? parseProjectIdFromPath(path)
    nextPath = withProjectWindowQuery(constrainProjectPath(path, projectId))
  } else {
    nextPath = stripModuleWindowQuery(path)
  }
  if (record) record.path = nextPath
  if (win.webContents.isLoadingMainFrame()) {
    void loadWorkbenchUrl(win, nextPath)
    return
  }
  win.webContents.send(IPC_CHANNELS.APP_NAVIGATE, nextPath)
}

export function closeWorkbenchWindow(id?: number): void {
  const win = id != null ? windows.get(id)?.win : getFocusedWorkbenchWindow()
  if (!win || win.isDestroyed()) return
  win.close()
}

export function openOrFocusWindow(options: CreateWorkbenchWindowOptions = {}): BrowserWindow {
  const requested = normalizeWindowPath(options.path)
  const kind = options.kind ?? inferWindowKind(requested)
  const path =
    kind === 'module'
      ? withModuleWindowQuery(requested)
      : kind === 'project'
        ? withProjectWindowQuery(constrainProjectPath(requested))
        : stripModuleWindowQuery(requested)
  const reuse = options.reuse ?? kind !== 'workbench'

  if (reuse && kind === 'module') {
    const key = moduleWindowKey(path)
    const existing = getLiveRecords().find((record) => record.kind === 'module' && record.key === key)
    if (existing) {
      showWorkbenchWindow(existing.win, { maximize: shouldOpenMaximized(kind, path) })
      return existing.win
    }
  }

  if (reuse && kind === 'project') {
    const key = projectWindowKey(path)
    const existing = getLiveRecords().find((record) => record.kind === 'project' && record.key === key)
    if (existing) {
      showWorkbenchWindow(existing.win, { maximize: shouldOpenMaximized(kind, path) })
      if (path) navigateWorkbenchWindow(existing.win, path)
      return existing.win
    }
  }

  if (reuse && kind === 'workbench') {
    const existing =
      getWorkbenchRecords().find((record) => record.win.id === lastFocusedId) ?? getWorkbenchRecords()[0]
    if (existing) {
      showWorkbenchWindow(existing.win, { maximize: shouldOpenMaximized(kind, path) })
      if (path && path !== '/') navigateWorkbenchWindow(existing.win, path)
      return existing.win
    }
  }

  return createWorkbenchWindow({ path, kind, reuse: false })
}

export function focusOrCreateWorkbenchWindow(path?: string): BrowserWindow {
  return openOrFocusWindow({ path, kind: 'workbench', reuse: true })
}

export function createWorkbenchWindow(options: CreateWorkbenchWindowOptions = {}): BrowserWindow {
  const requested = normalizeWindowPath(options.path)
  const kind = options.kind ?? inferWindowKind(requested)
  const path =
    kind === 'module'
      ? withModuleWindowQuery(requested)
      : kind === 'project'
        ? withProjectWindowQuery(constrainProjectPath(requested))
        : stripModuleWindowQuery(requested)

  const open = getLiveRecords()
  if (open.length >= MAX_APP_WINDOWS) {
    const existing = getFocusedWorkbenchWindow() ?? open[0]?.win
    if (existing) {
      showWorkbenchWindow(existing)
      if (path) navigateWorkbenchWindow(existing, path)
      return existing
    }
  }

  const iconPath = getAppIconPath()
  const profile = kind === 'module' ? getModuleWindowProfile(path) : null
  const bounds = nextWindowBounds(kind, profile)
  const title = kind === 'workbench' ? PRODUCT_NAME : moduleWindowTitle(path, PRODUCT_NAME)
  const openMaximized = shouldOpenMaximized(kind, path)

  const backgroundColor = nativeTheme.shouldUseDarkColors ? '#09090b' : '#ffffff'
  let revealed = false

  const win = new BrowserWindow({
    ...bounds,
    show: false,
    backgroundColor,
    autoHideMenuBar: true,
    title,
    ...(iconPath ? { icon: iconPath } : {}),
    ...macTitleBarOptions(),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      // Keep painting while hidden so the boot splash is ready on first show.
      backgroundThrottling: false
    }
  })

  const revealWindow = () => {
    if (revealed || win.isDestroyed()) return
    revealed = true
    if (openMaximized) maximizeWindow(win)
    win.show()
    showDockIfNeeded()
    restoreMacWindowButtons(win)
    emitMacWindowChrome(win)
    onReady?.(win)
  }

  windows.set(win.id, {
    win,
    kind,
    key: kind === 'project' ? projectWindowKey(path) : moduleWindowKey(path),
    path
  })
  lastFocusedId = win.id
  attachMacWindowChrome(win)

  const session = win.webContents.session
  session.setPermissionRequestHandler((_contents, permission, callback) => {
    callback(
      permission === 'media' ||
        permission === 'clipboard-read' ||
        permission === 'clipboard-sanitized-write' ||
        permission === 'fullscreen' ||
        permission === 'openExternal' ||
        permission === 'notifications'
    )
  })
  session.setPermissionCheckHandler(
    (_contents, permission) => permission === 'media' || permission !== 'display-capture'
  )

  // Reveal as soon as the boot splash has a first paint (optimistic UX).
  win.once('ready-to-show', () => {
    revealWindow()
  })
  // Safety net if ready-to-show never fires on some platforms.
  win.webContents.once('did-finish-load', () => {
    if (!revealed) revealWindow()
  })
  win.webContents.on('preload-error', (_event, preloadPath, error) => {
    console.error(`Preload failed (${preloadPath}):`, error)
  })
  win.webContents.on('did-fail-load', (_event, code, description, url) => {
    console.error(`Window failed to load (${code}) ${description} ${url}`)
    revealWindow()
  })

  if (kind === 'workbench') {
    attachTrayCloseBehavior(win, () => getWorkbenchRecords().length <= 1)
  }

  win.webContents.setWindowOpenHandler((details) => {
    void shell.openExternal(details.url)
    return { action: 'deny' }
  })

  win.on('focus', () => {
    lastFocusedId = win.id
    onWindowsChanged?.()
  })

  win.on('page-title-updated', (event, nextTitle) => {
    if (kind === 'module' && nextTitle && !nextTitle.includes(PRODUCT_NAME)) {
      event.preventDefault()
      win.setTitle(`${nextTitle} — ${PRODUCT_NAME}`)
    }
    onWindowsChanged?.()
  })

  win.on('closed', () => {
    windows.delete(win.id)
    if (lastFocusedId === win.id) {
      lastFocusedId = getLiveRecords()[0]?.win.id ?? null
    }
    onWindowsChanged?.()
  })

  void loadWorkbenchUrl(win, path)
  onWindowsChanged?.()
  return win
}

async function loadWorkbenchUrl(win: BrowserWindow, path?: string): Promise<void> {
  const hash = normalizeWindowPath(path)
  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    const base = process.env['ELECTRON_RENDERER_URL'].replace(/\/$/, '')
    await win.loadURL(`${base}#${hash}`)
    return
  }
  await win.loadFile(join(__dirname, '../renderer/index.html'), { hash })
}

function getAppIconPath(): string | undefined {
  const candidates = app.isPackaged
    ? [join(process.resourcesPath, 'resources/tess.png')]
    : [join(__dirname, '../../public/tess.png'), join(process.cwd(), 'public/tess.png')]
  return candidates.find((item) => existsSync(item))
}

function nextWindowBounds(
  kind: WindowKind,
  profile: ReturnType<typeof getModuleWindowProfile>
): { width: number; height: number; minWidth: number; minHeight: number; x?: number; y?: number } {
  const width = profile?.width ?? (kind === 'project' ? 1280 : 1400)
  const height = profile?.height ?? (kind === 'project' ? 840 : 900)
  const minWidth = profile?.minWidth ?? (kind === 'module' ? 720 : kind === 'project' ? 880 : 1024)
  const minHeight = profile?.minHeight ?? (kind === 'module' ? 480 : kind === 'project' ? 600 : 700)
  const source = getFocusedWorkbenchWindow() ?? getLastWorkbenchWindow()
  if (!source) {
    return { width, height, minWidth, minHeight }
  }

  const [x, y] = source.getPosition()
  const nextX = x + CASCADE_OFFSET
  const nextY = y + CASCADE_OFFSET
  const display = screen.getDisplayNearestPoint({ x: nextX, y: nextY }).workArea

  return {
    width: Math.min(width, display.width),
    height: Math.min(height, display.height),
    minWidth,
    minHeight,
    x: Math.min(nextX, display.x + Math.max(0, display.width - width)),
    y: Math.min(nextY, display.y + Math.max(0, display.height - height))
  }
}

export function openProjectWindow(projectId: string, segment = 'overview'): BrowserWindow {
  return openOrFocusWindow({
    path: projectWindowPath(projectId, segment),
    kind: 'project',
    reuse: true
  })
}

function inferWindowKind(path: string): WindowKind {
  const { search } = splitRoute(path)
  if (isProjectWindowSearch(search)) return 'project'
  if (isPopoutModulePath(path)) return 'module'
  if (isProjectWorkspacePath(path)) return 'project'
  return 'workbench'
}

function constrainProjectPath(path: string, projectId?: string | null): string {
  const id = projectId ?? parseProjectIdFromPath(path)
  if (!id) return projectWindowPath('unknown', 'overview')
  const { pathname } = splitRoute(path)
  const prefix = `/project/${id}`
  if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
    const segment = pathname.slice(prefix.length).replace(/^\/+/, '') || 'overview'
    return projectWindowPath(id, segment)
  }
  return projectWindowPath(id, 'overview')
}

function isMac(): boolean {
  return process.platform === 'darwin'
}

function macTitleBarOptions(): Electron.BrowserWindowConstructorOptions {
  if (!isMac()) return {}
  return {
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 11 }
  }
}

function restoreMacWindowButtons(win: BrowserWindow): void {
  if (!isMac() || win.isDestroyed()) return
  win.setWindowButtonVisibility(true)
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

  const sync = () => {
    restoreMacWindowButtons(win)
    emitMacWindowChrome(win)
  }

  win.on('show', sync)
  win.on('focus', () => restoreMacWindowButtons(win))
  win.on('blur', () => restoreMacWindowButtons(win))
  win.on('restore', sync)
  win.on('maximize', sync)
  win.on('unmaximize', sync)
  win.on('enter-full-screen', sync)
  win.on('leave-full-screen', () => {
    restoreMacWindowButtons(win)
    emitMacWindowChrome(win)
    setTimeout(() => restoreMacWindowButtons(win), 50)
    setTimeout(() => restoreMacWindowButtons(win), 350)
  })
  win.on('enter-html-full-screen', () => emitMacWindowChrome(win))
  win.on('leave-html-full-screen', sync)
  win.webContents.on('did-finish-load', () => emitMacWindowChrome(win))
}

export { getAppIconPath }