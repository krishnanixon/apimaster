import {
  hrefForWindowMode,
  getModuleWindowProfile,
  isModuleWindowSearch,
  isPopoutModulePath,
  isProjectWindowSearch,
  parseProjectIdFromPath,
  stripModuleWindowQuery
} from '@shared/lib/module-windows'
import { useWindowOpenStore } from '@/shared/stores/window-open.store'

async function withWindowOpenFeedback<T>(message: string, action: () => Promise<T>): Promise<T> {
  const store = useWindowOpenStore.getState()
  store.begin(message)
  try {
    return await action()
  } finally {
    store.end()
  }
}

function moduleOpenMessage(path: string): string {
  const profile = getModuleWindowProfile(path)
  return profile ? `Opening ${profile.label}…` : 'Opening window…'
}

export async function openNewWindow(path?: string): Promise<void> {
  await withWindowOpenFeedback('Opening new window…', async () => {
    await window.electronAPI.windows.create(path)
  })
}

export async function openPathInNewWindow(path: string): Promise<void> {
  await withWindowOpenFeedback(moduleOpenMessage(path), async () => {
    await window.electronAPI.windows.openPath(path)
  })
}

export async function openModuleWindow(path: string): Promise<void> {
  await withWindowOpenFeedback(moduleOpenMessage(path), async () => {
    await window.electronAPI.windows.openModule(path)
  })
}

export async function openInWorkbench(path?: string): Promise<void> {
  await withWindowOpenFeedback('Opening in workbench…', async () => {
    await window.electronAPI.windows.openInWorkbench(path)
  })
}

export async function openProjectWindow(projectId: string, segment = 'overview'): Promise<void> {
  await withWindowOpenFeedback('Opening project…', async () => {
    await window.electronAPI.windows.openProject(projectId, segment)
  })
}

export function currentViewPath(pathname: string, search = ''): string {
  return stripModuleWindowQuery(`${pathname}${search}`)
}

export function isModuleWindowView(search: string): boolean {
  return isModuleWindowSearch(search)
}

export function isProjectWindowView(search: string): boolean {
  return isProjectWindowSearch(search)
}

export function windowHref(path: string, search: string): string {
  return hrefForWindowMode(path, search)
}

export function projectIdFromPath(pathname: string): string | null {
  return parseProjectIdFromPath(pathname)
}

export function handleModifiedWindowClick(
  event: { metaKey: boolean; ctrlKey: boolean; button?: number },
  path: string
): boolean {
  if (!(event.metaKey || event.ctrlKey || event.button === 1)) return false
  if (isPopoutModulePath(path)) {
    void openModuleWindow(path)
  } else if (parseProjectIdFromPath(path)) {
    const projectId = parseProjectIdFromPath(path)!
    const segment = path.replace(`/project/${projectId}/`, '') || 'overview'
    void openProjectWindow(projectId, segment)
  } else {
    void openPathInNewWindow(path)
  }
  return true
}
