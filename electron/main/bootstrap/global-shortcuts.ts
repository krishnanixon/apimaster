import { globalShortcut } from 'electron'
import { clipboardManagerService } from '../clipboard-manager/clipboard.service'
import { toggleQuickNote } from '../notepad/note-popup.window'
import { logger } from '../infra/logger.service'
import { openOrFocusWindow } from '../windows/window-manager'

const SHORTCUTS = {
  vault: 'CommandOrControl+Shift+U',
  notepad: 'CommandOrControl+Shift+N',
  quickNote: 'CommandOrControl+Shift+Space',
  terminal: 'CommandOrControl+`',
  clipboard: 'CommandOrControl+Shift+V'
} as const

export function registerGlobalShortcuts(): void {
  const bindings: Array<{ accelerator: string; action: () => void; label: string }> = [
    {
      accelerator: SHORTCUTS.vault,
      label: 'Vault',
      action: () => {
        openOrFocusWindow({ path: '/vault', kind: 'module', reuse: true })
      }
    },
    {
      accelerator: SHORTCUTS.notepad,
      label: 'Notepad',
      action: () => {
        openOrFocusWindow({ path: '/notepad', kind: 'module', reuse: true })
      }
    },
    {
      accelerator: SHORTCUTS.quickNote,
      label: 'Quick Note',
      action: () => toggleQuickNote()
    },
    {
      accelerator: SHORTCUTS.terminal,
      label: 'Terminal',
      action: () => {
        openOrFocusWindow({ path: '/terminal', kind: 'module', reuse: true })
      }
    },
    {
      accelerator: SHORTCUTS.clipboard,
      label: 'Clipboard',
      action: () => {
        void clipboardManagerService.openQuickPicker()
      }
    }
  ]

  for (const { accelerator, action, label } of bindings) {
    try {
      const ok = globalShortcut.register(accelerator, action)
      if (ok) {
        logger.info(`Global shortcut registered: ${label} (${accelerator})`, 'Shortcuts')
      } else {
        logger.warn(`Global shortcut unavailable: ${label} (${accelerator})`, 'Shortcuts')
      }
    } catch (error) {
      logger.error(`Shortcut registration failed for ${label}: ${error}`, 'Shortcuts')
    }
  }
}

export function unregisterGlobalShortcuts(): void {
  globalShortcut.unregisterAll()
}

export const GLOBAL_SHORTCUT_LABELS = {
  vault: `Vault (${process.platform === 'darwin' ? '⌘⇧U' : 'Ctrl+Shift+U'})`,
  notepad: `Notes (${process.platform === 'darwin' ? '⌘⇧N' : 'Ctrl+Shift+N'})`,
  quickNote: `Quick Note (${process.platform === 'darwin' ? '⌘⇧Space' : 'Ctrl+Shift+Space'})`,
  terminal: `Terminal (${process.platform === 'darwin' ? '⌘`' : 'Ctrl+`'})`,
  clipboard: `Clipboard (${process.platform === 'darwin' ? '⌘⇧V' : 'Ctrl+Shift+V'})`
} as const
