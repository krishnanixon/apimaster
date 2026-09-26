import { execFile } from 'child_process'
import { promisify } from 'util'
import { logger } from '../infra/logger.service'

const execFileAsync = promisify(execFile)

let capturedHwnd: number | null = null
let capturedMacApp: string | null = null

interface Win32Api {
  GetForegroundWindow: () => number
  GetWindowThreadProcessId: (hwnd: number, processId: Buffer) => number
  SetForegroundWindow: (hwnd: number) => number
  IsWindow: (hwnd: number) => number
}

let win32: Win32Api | null = null
let ownProcessId: number | null = null

function loadWin32(): Win32Api | null {
  if (process.platform !== 'win32') return null
  if (win32) return win32

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const koffi = require('koffi') as typeof import('koffi')
    const user32 = koffi.load('user32.dll')
    win32 = {
      GetForegroundWindow: user32.func('uintptr_t __stdcall GetForegroundWindow()'),
      GetWindowThreadProcessId: user32.func(
        'uint32 __stdcall GetWindowThreadProcessId(uintptr_t hWnd, _Out_ uint32 *lpdwProcessId)'
      ),
      SetForegroundWindow: user32.func('int __stdcall SetForegroundWindow(uintptr_t hWnd)'),
      IsWindow: user32.func('int __stdcall IsWindow(uintptr_t hWnd)')
    }
    ownProcessId = process.pid
    return win32
  } catch (error) {
    logger.warn(`Win32 paste helpers unavailable: ${error}`, 'Paste')
    return null
  }
}

function isOwnWindow(hwnd: number): boolean {
  const api = loadWin32()
  if (!api || !hwnd || ownProcessId === null) return false

  const pidBuf = Buffer.alloc(4)
  api.GetWindowThreadProcessId(hwnd, pidBuf)
  return pidBuf.readUInt32LE(0) === ownProcessId
}

function isValidExternalWindow(hwnd: number): boolean {
  const api = loadWin32()
  if (!api || !hwnd) return false
  if (!api.IsWindow(hwnd)) return false
  if (isOwnWindow(hwnd)) return false
  return true
}

function escapeAppleScriptString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

async function captureMacForegroundApp(): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('osascript', [
      '-e',
      'tell application "System Events" to get name of first application process whose frontmost is true'
    ])
    const name = stdout.trim()
    if (!name || /electron|ai workbench|requirement studio|ai-requirement-studio/i.test(name)) {
      return null
    }
    return name
  } catch (error) {
    logger.warn(`Failed to capture macOS frontmost app: ${error}`, 'Paste')
    return null
  }
}

function simulateCtrlV(): boolean {
  if (process.platform !== 'win32') return false

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const koffi = require('koffi') as typeof import('koffi')
    const user32 = koffi.load('user32.dll')
    const keybd_event = user32.func(
      'void __stdcall keybd_event(uint8 bVk, uint8 bScan, uint32 dwFlags, uintptr_t dwExtraInfo)'
    )

    const KEYEVENTF_KEYUP = 0x0002
    const VK_CONTROL = 0x11
    const VK_V = 0x56

    keybd_event(VK_CONTROL, 0, 0, 0)
    keybd_event(VK_V, 0, 0, 0)
    keybd_event(VK_V, 0, KEYEVENTF_KEYUP, 0)
    keybd_event(VK_CONTROL, 0, KEYEVENTF_KEYUP, 0)
    return true
  } catch (error) {
    logger.warn(`Ctrl+V simulation failed: ${error}`, 'Paste')
    return false
  }
}

async function simulateCmdVMac(appName: string): Promise<boolean> {
  const escaped = escapeAppleScriptString(appName)
  // `activate` can bounce native fullscreen apps out of their Space.
  // Setting frontmost via System Events restores the fullscreen Space instead.
  const script = [
    `tell application "System Events"`,
    `  set frontmost of first process whose name is "${escaped}" to true`,
    `end tell`,
    'delay 0.14',
    'tell application "System Events" to keystroke "v" using command down'
  ].join('\n')

  try {
    await execFileAsync('osascript', ['-e', script])
    return true
  } catch (error) {
    logger.warn(
      `Cmd+V simulation failed (Accessibility permission may be required): ${error}`,
      'Paste'
    )
    return false
  }
}

/** Frontmost app name for clipboard source labels. Null for this app or on failure. */
export async function getForegroundAppName(): Promise<string | null> {
  if (process.platform === 'darwin') {
    return captureMacForegroundApp()
  }
  return null
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function captureForegroundWindow(): void {
  capturedHwnd = null
  capturedMacApp = null

  if (process.platform === 'win32') {
    const api = loadWin32()
    if (!api) return
    const hwnd = api.GetForegroundWindow()
    capturedHwnd = isValidExternalWindow(hwnd) ? hwnd : null
    return
  }

  if (process.platform === 'darwin') {
    // Fire-and-forget; openQuickPicker awaits a short settle before paste uses it.
    void captureMacForegroundApp().then((name) => {
      capturedMacApp = name
    })
  }
}

/** Prefer awaiting this when opening the picker so the target app is known. */
export async function captureForegroundWindowAsync(): Promise<void> {
  capturedHwnd = null
  capturedMacApp = null

  if (process.platform === 'win32') {
    captureForegroundWindow()
    return
  }

  if (process.platform === 'darwin') {
    capturedMacApp = await captureMacForegroundApp()
  }
}

export async function pasteToPreviousWindow(): Promise<boolean> {
  if (process.platform === 'darwin') {
    let appName = capturedMacApp
    capturedMacApp = null
    if (!appName) {
      // User may have switched back to Notes/Docs while we were working.
      appName = await captureMacForegroundApp()
    }
    if (!appName) {
      logger.info('No valid macOS app to paste into; content left on clipboard', 'Paste')
      return false
    }
    await delay(140)
    return simulateCmdVMac(appName)
  }

  if (process.platform !== 'win32') {
    logger.info('Auto-paste is unsupported on this platform; content copied to clipboard', 'Paste')
    return false
  }

  const api = loadWin32()
  let hwnd = capturedHwnd
  capturedHwnd = null

  if ((!api || !hwnd || !isValidExternalWindow(hwnd)) && api) {
    const current = api.GetForegroundWindow()
    hwnd = isValidExternalWindow(current) ? current : null
  }

  if (!api || !hwnd || !isValidExternalWindow(hwnd)) {
    logger.info('No valid foreground window to paste into', 'Paste')
    return false
  }

  try {
    api.SetForegroundWindow(hwnd)
    await delay(80)
    const ok = simulateCtrlV()
    if (!ok) {
      logger.warn('SendInput paste simulation returned unexpected result', 'Paste')
    }
    return ok
  } catch (error) {
    logger.warn(`Paste to previous window failed: ${error}`, 'Paste')
    return false
  }
}
