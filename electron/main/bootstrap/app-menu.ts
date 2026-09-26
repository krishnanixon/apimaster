import { app, Menu, type MenuItemConstructorOptions } from 'electron'
import { PRODUCT_NAME } from '@shared/constants/product'
import {
  MODULE_WINDOW_MENU,
  PROJECT_WINDOW_MENU,
  parseProjectIdFromPath,
  projectWindowPath
} from '@shared/lib/module-windows'
import {
  createWorkbenchWindow,
  getAllWorkbenchWindows,
  getFocusedWorkbenchWindow,
  listWindowInfo,
  navigateWorkbenchWindow,
  openOrFocusWindow,
  openProjectWindow,
  showWorkbenchWindow
} from '../windows/window-manager'
import { markAppQuitting } from './tray'

let rebuildTimer: ReturnType<typeof setTimeout> | null = null

export function scheduleApplicationMenuRebuild(): void {
  if (rebuildTimer) clearTimeout(rebuildTimer)
  rebuildTimer = setTimeout(() => {
    rebuildTimer = null
    buildApplicationMenu()
  }, 80)
}

export function buildApplicationMenu(): void {
  const isMac = process.platform === 'darwin'
  const windows = getAllWorkbenchWindows()
  const focused = getFocusedWorkbenchWindow()
  const focusedId = focused?.id
  const focusedInfo = listWindowInfo().find((item) => item.id === focusedId)
  const projectId = focusedInfo?.kind === 'project' ? parseProjectIdFromPath(focusedInfo.path) : null

  const windowList: MenuItemConstructorOptions[] = windows.map((win, index) => ({
    label: win.getTitle().trim() || `${PRODUCT_NAME} ${index + 1}`,
    type: 'checkbox',
    checked: win.id === focusedId,
    click: () => showWorkbenchWindow(win)
  }))

  const moduleMenu: MenuItemConstructorOptions[] = MODULE_WINDOW_MENU.map((item) => ({
    label: item.label,
    click: () => {
      openOrFocusWindow({ path: item.path, kind: 'module', reuse: true })
    }
  }))

  const projectMenu: MenuItemConstructorOptions[] = PROJECT_WINDOW_MENU.map((item) => ({
    label: item.label,
    enabled: Boolean(projectId),
    click: () => {
      if (!projectId || !focused) return
      navigateWorkbenchWindow(focused, projectWindowPath(projectId, item.segment))
    }
  }))

  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [{ role: 'appMenu' as const }] : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'New Window',
          accelerator: 'CommandOrControl+N',
          click: () => {
            createWorkbenchWindow({ kind: 'workbench' })
          }
        },
        {
          label: 'Open Workbench',
          click: () => {
            openOrFocusWindow({ path: '/dashboard', kind: 'workbench', reuse: true })
          }
        },
        ...(projectId
          ? ([
              {
                label: 'Open Project Overview',
                click: () => openProjectWindow(projectId, 'overview')
              }
            ] as MenuItemConstructorOptions[])
          : []),
        {
          label: 'Open Module',
          submenu: moduleMenu
        },
        { type: 'separator' },
        {
          label: 'Close Window',
          accelerator: 'CommandOrControl+Shift+W',
          click: (_menu, browserWindow) => {
            browserWindow?.close()
          }
        },
        ...(!isMac
          ? ([
              { type: 'separator' },
              {
                label: 'Quit',
                accelerator: 'CommandOrControl+Q',
                click: () => {
                  markAppQuitting()
                  app.quit()
                }
              }
            ] as MenuItemConstructorOptions[])
          : [])
      ]
    },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    ...(projectId
      ? ([
          {
            label: 'Project',
            submenu: projectMenu
          }
        ] as MenuItemConstructorOptions[])
      : []),
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac ? ([{ type: 'separator' }, { role: 'front' }] as MenuItemConstructorOptions[]) : []),
        ...(windowList.length > 0 ? ([{ type: 'separator' }, ...windowList] as MenuItemConstructorOptions[]) : [])
      ]
    }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
