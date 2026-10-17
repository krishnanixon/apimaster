import './bootstrap/paths'
import { app, BrowserWindow } from 'electron'
import { registerIpcHandlers } from './ipc/handlers'
import { aiManager } from './ai'
import { logger } from './infra/logger.service'
import { buildApplicationMenu } from './bootstrap/app-menu'
import { createMainWindow, getAppIconPath, getMainWindow, showMainWindow } from './windows/window-manager'
import { APP_ID, PRODUCT_NAME } from '@shared/constants/product'
import { mockServerManager } from './mock-server/mock-server-manager'
import { mcpManager } from './mcp/mcp-manager'
import { updaterService } from './infra/updater.service'

app.setName(PRODUCT_NAME)

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    showMainWindow()
  })

  app.whenReady().then(() => {
    if (process.platform === 'win32') {
      app.setAppUserModelId(APP_ID)
    }
    if (process.platform === 'darwin') {
      const iconPath = getAppIconPath()
      if (iconPath) app.dock?.setIcon(iconPath)
    }

    registerIpcHandlers(() => getMainWindow())
    void mcpManager.apply()
    aiManager.warmupOnStartup()
    createMainWindow()
    buildApplicationMenu()
    void updaterService.start(() => getMainWindow())

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
      else showMainWindow()
    })
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  void mockServerManager.shutdownAll()
  void mcpManager.stop()
})

process.on('uncaughtException', (error) => {
  logger.error(`Uncaught exception: ${error.message}`, 'Main')
})

process.on('unhandledRejection', (reason) => {
  logger.error(`Unhandled rejection: ${reason}`, 'Main')
})
