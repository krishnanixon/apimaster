import { app, Tray, Menu, nativeImage, BrowserWindow } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'
import { PRODUCT_NAME } from '@shared/constants/product'
import { logger } from '../infra/logger.service'

type MainWindowGetter = () => BrowserWindow | null
type CreateWindowFn = () => void

let tray: Tray | null = null
let quitting = false

function resolveTrayIcon(): Electron.NativeImage | undefined {
  const candidates = app.isPackaged
    ? [join(process.resourcesPath, 'resources/tess.png')]
    : [
        join(__dirname, '../../../public/tess.png'),
        join(process.cwd(), 'public/tess.png')
      ]

  const iconPath = candidates.find((path) => existsSync(path))
  if (!iconPath) return undefined

  const image = nativeImage.createFromPath(iconPath)
  if (image.isEmpty()) return undefined
  if (process.platform === 'darwin') {
    image.setTemplateImage(true)
  }
  return image.resize({ width: 16, height: 16 })
}

export function isAppQuitting(): boolean {
  return quitting
}

export function markAppQuitting(): void {
  quitting = true
}

export function createTray(getMainWindow: MainWindowGetter, createWindow: CreateWindowFn): Tray | null {
  if (tray) return tray

  const icon = resolveTrayIcon()
  if (!icon) {
    logger.warn('Tray icon not found — system tray disabled', 'Tray')
    return null
  }

  tray = new Tray(icon)
  tray.setToolTip(PRODUCT_NAME)

  const showWindow = () => {
    const win = getMainWindow()
    if (win) {
      if (win.isMinimized()) win.restore()
      win.show()
      win.focus()
    } else {
      createWindow()
    }
  }

  const contextMenu = Menu.buildFromTemplate([
    { label: `Show ${PRODUCT_NAME}`, click: showWindow },
    { label: 'New Window', click: () => createWindow() },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        markAppQuitting()
        app.quit()
      }
    }
  ])

  tray.setContextMenu(contextMenu)
  tray.on('double-click', showWindow)

  logger.info('System tray initialized', 'Tray')
  return tray
}

export function destroyTray(): void {
  tray?.destroy()
  tray = null
}

export function attachTrayCloseBehavior(win: BrowserWindow, shouldHide?: () => boolean): void {
  win.on('close', (event) => {
    if (quitting) return
    if (shouldHide && !shouldHide()) return
    event.preventDefault()
    win.hide()
    if (process.platform === 'darwin') {
      app.dock?.hide()
    }
  })
}

export function showDockIfNeeded(): void {
  if (process.platform === 'darwin') {
    app.dock?.show()
  }
}
