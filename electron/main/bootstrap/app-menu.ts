import { app, Menu, shell, type MenuItemConstructorOptions } from 'electron'
import {
  COMPANY_NAME,
  COPYRIGHT,
  ISSUES_URL,
  PRODUCT_NAME,
  REPOSITORY_URL
} from '@shared/constants/product'
import { navigateMainWindow } from '../windows/window-manager'

export function buildApplicationMenu(): void {
  const isMac = process.platform === 'darwin'

  app.setAboutPanelOptions({
    applicationName: PRODUCT_NAME,
    copyright: COPYRIGHT,
    credits: `A product of ${COMPANY_NAME}`,
    website: REPOSITORY_URL
  })

  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            role: 'appMenu' as const,
            submenu: [
              { role: 'about' as const },
              { type: 'separator' as const },
              {
                label: 'Settings…',
                accelerator: 'CommandOrControl+,',
                click: () => navigateMainWindow('/settings')
              },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const }
            ]
          }
        ]
      : []),
    {
      label: 'File',
      submenu: [
        {
          label: PRODUCT_NAME,
          accelerator: 'CommandOrControl+Shift+A',
          click: () => navigateMainWindow('/')
        },
        ...(isMac
          ? []
          : [
              {
                label: 'Settings',
                accelerator: 'CommandOrControl+,',
                click: () => navigateMainWindow('/settings')
              },
              { type: 'separator' as const },
              { role: 'quit' as const }
            ])
      ]
    },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        {
          label: 'Source Code',
          click: () => void shell.openExternal(REPOSITORY_URL)
        },
        {
          label: 'Report an Issue',
          click: () => void shell.openExternal(ISSUES_URL)
        }
      ]
    }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
