import { Menu, shell, type MenuItemConstructorOptions } from 'electron'
import { PRODUCT_NAME } from '@shared/constants/product'
import { navigateMainWindow } from '../windows/window-manager'

export function buildApplicationMenu(): void {
  const isMac = process.platform === 'darwin'

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
          label: 'Report an Issue',
          click: () => void shell.openExternal('https://github.com')
        }
      ]
    }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
