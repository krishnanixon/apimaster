import { useLayoutEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { isImmersiveRoute, isStandaloneModuleRoute } from '@/shared/lib/app-chrome'
import { isProjectWindowSearch } from '@shared/lib/module-windows'
import { useUIStore } from '@/shared/stores/ui.store'

/** True on full-screen editor routes — app sidebar and top bar are hidden. */
export function useImmersiveLayout(): boolean {
  const { pathname } = useLocation()
  return isImmersiveRoute(pathname)
}

/** True on notepad / VPS / vault — sidebar auto-collapses, top bar hidden. */
export function useStandaloneModuleLayout(): boolean {
  const { pathname } = useLocation()
  return isStandaloneModuleRoute(pathname)
}

/** Syncs immersive + standalone module layout side effects. */
export function useImmersiveLayoutEffect(): boolean {
  const { pathname, search } = useLocation()
  const immersive = isImmersiveRoute(pathname)
  const projectWindow = isProjectWindowSearch(search)
  const standaloneModule = !projectWindow && isStandaloneModuleRoute(pathname)
  const setSidebarCollapsed = useUIStore((s) => s.setSidebarCollapsed)

  useLayoutEffect(() => {
    if (immersive) {
      document.documentElement.setAttribute('data-immersive', 'true')
    } else {
      document.documentElement.removeAttribute('data-immersive')
    }
    return () => document.documentElement.removeAttribute('data-immersive')
  }, [immersive])

  useLayoutEffect(() => {
    // Only auto-collapse the rail when sidebar chrome is active.
    if (standaloneModule && useUIStore.getState().navChromeStyle === 'sidebar') {
      setSidebarCollapsed(true)
    }
  }, [standaloneModule, setSidebarCollapsed])

  return immersive
}
