import './bootstrap/paths'
import { app, BrowserWindow, protocol } from 'electron'
import {
  initializeDatabase,
  disconnectDatabase,
  ensureFlowDiagramTable,
  ensureDocumentLayoutColumns
} from './database/client'
import { registerIpcHandlers } from './ipc/handlers'
import {
  stopClipboardManager,
  syncClipboardToRenderer,
  startClipboardManager
} from './ipc/clipboard.handlers'
import { destroyQuickPicker } from './clipboard-manager/clipboard-popup.window'
import { destroyQuickNote } from './notepad/note-popup.window'
import { connectionManager } from '@vps/core/ConnectionManager'
import { aiManager } from './ai'
import { logger } from './infra/logger.service'
import { registerGlobalShortcuts, unregisterGlobalShortcuts } from './bootstrap/global-shortcuts'
import { createTray, destroyTray, markAppQuitting, showDockIfNeeded } from './bootstrap/tray'
import { buildApplicationMenu, scheduleApplicationMenuRebuild } from './bootstrap/app-menu'
import {
  createWorkbenchWindow,
  focusOrCreateWorkbenchWindow,
  getAppIconPath,
  getFocusedWorkbenchWindow,
  getLastWorkbenchWindow,
  setWorkbenchReadyHandler,
  setWorkbenchWindowsChangedHandler,
  showWorkbenchWindow
} from './windows/window-manager'
import {
  PRESENTATION_ASSET_SCHEME,
  registerPresentationAssetProtocol
} from './presentation/presentation-assets.service'
import { PRODUCT_NAME } from '@shared/constants/product'

protocol.registerSchemesAsPrivileged([
  {
    scheme: PRESENTATION_ASSET_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true }
  }
])

// Chromium otherwise blocks speechSynthesis / AudioContext until a click.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')
app.setName(PRODUCT_NAME)

app.whenReady().then(async () => {
  registerPresentationAssetProtocol()
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.airequirementstudio.app')
  }
  if (process.platform === 'darwin') {
    const iconPath = getAppIconPath()
    if (iconPath) app.dock?.setIcon(iconPath)
  }

  try {
    await initializeDatabase()
    logger.info('Database initialized', 'Main')
  } catch (error) {
    logger.error(`Database init failed: ${error}`, 'Main')
    try {
      await ensureDocumentLayoutColumns()
      logger.info('Document layout columns ensured after partial init failure', 'Main')
    } catch (docError) {
      logger.error(`Document layout migration failed: ${docError}`, 'Main')
    }
    try {
      await ensureFlowDiagramTable()
      logger.info('FlowDiagram table ensured after partial init failure', 'Main')
    } catch (flowError) {
      logger.error(`FlowDiagram migration failed: ${flowError}`, 'Main')
    }
  }

  setWorkbenchReadyHandler(() => {
    syncClipboardToRenderer()
  })
  setWorkbenchWindowsChangedHandler(() => {
    scheduleApplicationMenuRebuild()
  })

  registerIpcHandlers(() => getFocusedWorkbenchWindow())
  aiManager.warmupOnStartup()
  createWorkbenchWindow()
  buildApplicationMenu()
  createTray(
    () => getLastWorkbenchWindow(),
    () => {
      createWorkbenchWindow()
    }
  )
  startClipboardManager()
  registerGlobalShortcuts()

  app.on('activate', () => {
    const win = getLastWorkbenchWindow()
    if (win) {
      showWorkbenchWindow(win)
    } else if (BrowserWindow.getAllWindows().length === 0) {
      focusOrCreateWorkbenchWindow()
    } else {
      showDockIfNeeded()
    }
  })
})

app.on('window-all-closed', () => {
  // Keep running in the background (system tray on Windows/Linux, dock on macOS)
})

app.on('before-quit', async () => {
  markAppQuitting()
  unregisterGlobalShortcuts()
  destroyQuickPicker()
  destroyQuickNote()
  destroyTray()
  stopClipboardManager()
  connectionManager.disconnectAll()
  await disconnectDatabase()
})

process.on('uncaughtException', (error) => {
  logger.error(`Uncaught exception: ${error.message}`, 'Main')
})

process.on('unhandledRejection', (reason) => {
  logger.error(`Unhandled rejection: ${reason}`, 'Main')
})
