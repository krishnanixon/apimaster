import { useEffect } from 'react'

export function isMacClient(): boolean {
  if (typeof navigator === 'undefined') return false
  return /Mac/i.test(navigator.platform) || /Mac OS X/i.test(navigator.userAgent)
}

function applyChromeState(state?: { fullscreen?: boolean; maximized?: boolean }): void {
  const root = document.documentElement
  // Stylesheets match [data-fullscreen='true'], so write the value, not a bare attribute.
  for (const [name, on] of [
    ['data-fullscreen', state?.fullscreen],
    ['data-maximized', state?.maximized]
  ] as const) {
    if (on) root.setAttribute(name, 'true')
    else root.removeAttribute(name)
  }
}

/** Keeps macOS traffic lights and top chrome visible after fullscreen / focus changes. */
export function useMacWindowChrome(): void {
  useEffect(() => {
    if (isMacClient()) {
      document.documentElement.dataset.platform = 'mac'
    }

    const api = window.electronAPI?.windows
    if (!api?.onChrome) return undefined
    return api.onChrome((state) => applyChromeState(state))
  }, [])
}
