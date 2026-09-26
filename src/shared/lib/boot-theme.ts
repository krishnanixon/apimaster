/** Persisted color mode for first-paint before React settings hydrate. */
export const COLOR_MODE_STORAGE_KEY = 'aws-color-mode'

export type StoredColorMode = 'light' | 'dark'

export function readStoredColorMode(): StoredColorMode | null {
  try {
    const value = localStorage.getItem(COLOR_MODE_STORAGE_KEY)
    if (value === 'light' || value === 'dark') return value
  } catch {
    /* ignore */
  }
  return null
}

export function writeStoredColorMode(mode: StoredColorMode): void {
  try {
    localStorage.setItem(COLOR_MODE_STORAGE_KEY, mode)
  } catch {
    /* ignore */
  }
}

export function resolvePreferredColorMode(): StoredColorMode {
  return (
    readStoredColorMode() ??
    (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
  )
}
