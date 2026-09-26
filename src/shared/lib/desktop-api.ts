import type { ElectronAPI } from '@shared/ipc/api'

const WAIT_MS = 50
const WAIT_ATTEMPTS = 20

let missingApiWarned = false

export function getDesktopApi(): ElectronAPI | undefined {
  if (typeof window === 'undefined') return undefined
  return window.electronAPI
}

export function isElectronRenderer(): boolean {
  if (typeof navigator === 'undefined') return false
  return /Electron/i.test(navigator.userAgent)
}

/** Resolves once the preload bridge is available, or quickly if this is not Electron. */
export async function waitForDesktopApi(): Promise<ElectronAPI | undefined> {
  const existing = getDesktopApi()
  if (existing) return existing

  if (isElectronRenderer()) {
    for (let i = 0; i < WAIT_ATTEMPTS && !getDesktopApi(); i++) {
      await new Promise((resolve) => window.setTimeout(resolve, WAIT_MS))
    }
  }

  const api = getDesktopApi()
  if (!api && !missingApiWarned) {
    missingApiWarned = true
    console.warn('Desktop API is unavailable. Restart the application if this is the Electron window.')
  }
  return api
}
