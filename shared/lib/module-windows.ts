export const MODULE_WINDOW_QUERY = 'window'
export const MODULE_WINDOW_VALUE = 'module'
export const PROJECT_WINDOW_VALUE = 'project'

export type WindowKind = 'workbench' | 'module' | 'project'

export interface ModuleWindowProfile {
  id: string
  label: string
  width: number
  height: number
  minWidth: number
  minHeight: number
}

interface GlobalPreset extends ModuleWindowProfile {
  path: string
}

const GLOBAL_PRESETS: GlobalPreset[] = [
  { id: 'api-studio', label: 'API Studio', path: '/api-studio', width: 1280, height: 820, minWidth: 860, minHeight: 560 },
  { id: 'database-studio', label: 'Database', path: '/database-studio', width: 1280, height: 820, minWidth: 860, minHeight: 560 },
  { id: 'vector-studio', label: 'Vector Studio', path: '/vector-studio', width: 1240, height: 800, minWidth: 840, minHeight: 540 },
  { id: 'rag-studio', label: 'RAG Studio', path: '/rag-studio', width: 1180, height: 780, minWidth: 800, minHeight: 540 },
  { id: 'terminal', label: 'Terminal', path: '/terminal', width: 1100, height: 700, minWidth: 720, minHeight: 480 },
  { id: 'code-editor', label: 'Code Editor', path: '/code-editor', width: 1280, height: 840, minWidth: 860, minHeight: 560 },
  { id: 'vps', label: 'VPS', path: '/vps', width: 1200, height: 800, minWidth: 840, minHeight: 540 },
  { id: 'vault', label: 'Vault', path: '/vault', width: 1000, height: 720, minWidth: 720, minHeight: 520 },
  { id: 'notepad', label: 'Notes', path: '/notepad', width: 960, height: 720, minWidth: 700, minHeight: 500 },
  { id: 'clipboard', label: 'Clipboard', path: '/clipboard', width: 920, height: 680, minWidth: 640, minHeight: 480 },
  { id: 'document-library', label: 'Document Library', path: '/document-library', width: 1180, height: 800, minWidth: 800, minHeight: 560 },
  { id: 'assistant', label: 'New Chat', path: '/assistant', width: 1040, height: 760, minWidth: 720, minHeight: 520 }
]

const PROJECT_SEGMENTS: Record<string, ModuleWindowProfile> = {
  chat: { id: 'chat', label: 'Project AI', width: 1040, height: 780, minWidth: 720, minHeight: 520 },
  knowledge: { id: 'knowledge', label: 'Knowledge', width: 1180, height: 800, minWidth: 800, minHeight: 560 },
  documents: { id: 'documents', label: 'Documents', width: 1180, height: 800, minWidth: 800, minHeight: 560 },
  templates: { id: 'templates', label: 'Templates', width: 1180, height: 800, minWidth: 800, minHeight: 560 },
  flows: { id: 'flows', label: 'Flows', width: 1280, height: 840, minWidth: 860, minHeight: 560 },
  'architecture-designer': { id: 'architecture-designer', label: 'Architecture', width: 1360, height: 880, minWidth: 940, minHeight: 600 },
  presentations: { id: 'presentations', label: 'Presentations', width: 1280, height: 860, minWidth: 900, minHeight: 600 },
  generate: { id: 'generate', label: 'Generate', width: 1100, height: 780, minWidth: 760, minHeight: 540 },
  'api-studio': { id: 'api-studio', label: 'API Studio', width: 1280, height: 820, minWidth: 860, minHeight: 560 },
  'database-studio': { id: 'database-studio', label: 'Database', width: 1280, height: 820, minWidth: 860, minHeight: 560 },
  'vector-studio': { id: 'vector-studio', label: 'Vector Studio', width: 1240, height: 800, minWidth: 840, minHeight: 540 },
  'rag-studio': { id: 'rag-studio', label: 'RAG Studio', width: 1180, height: 780, minWidth: 800, minHeight: 540 }
}

export const MODULE_WINDOW_MENU = GLOBAL_PRESETS.map((preset) => ({
  label: preset.label,
  path: preset.path
}))

export const PROJECT_WINDOW_MENU: Array<{ id: string; label: string; segment: string }> = [
  { id: 'overview', label: 'Overview', segment: 'overview' },
  { id: 'chat', label: 'Project AI', segment: 'chat' },
  { id: 'knowledge', label: 'Knowledge', segment: 'knowledge' },
  { id: 'documents', label: 'Documents', segment: 'documents' },
  { id: 'templates', label: 'Templates', segment: 'templates' },
  { id: 'flows', label: 'Flows', segment: 'flows' },
  { id: 'architecture-designer', label: 'Architecture', segment: 'architecture-designer' },
  { id: 'presentations', label: 'Presentations', segment: 'presentations' },
  { id: 'generate', label: 'Generate', segment: 'generate' }
]

export function splitRoute(path: string): { pathname: string; search: string } {
  const raw = (path || '/').replace(/^#/, '')
  const withSlash = raw.startsWith('/') ? raw : `/${raw}`
  const queryIndex = withSlash.indexOf('?')
  if (queryIndex === -1) {
    return { pathname: normalizePathname(withSlash), search: '' }
  }
  return {
    pathname: normalizePathname(withSlash.slice(0, queryIndex)),
    search: withSlash.slice(queryIndex + 1)
  }
}

export function normalizeWindowPath(path?: string): string {
  if (!path || path === '/') return '/'
  const { pathname, search } = splitRoute(path)
  return search ? `${pathname}?${search}` : pathname
}

export function moduleWindowKey(path: string): string {
  return splitRoute(path).pathname
}

export function isModuleWindowSearch(search: string): boolean {
  return windowMode(search) === MODULE_WINDOW_VALUE
}

export function isProjectWindowSearch(search: string): boolean {
  return windowMode(search) === PROJECT_WINDOW_VALUE
}

function windowMode(search: string): string | null {
  return new URLSearchParams(search.startsWith('?') ? search.slice(1) : search).get(MODULE_WINDOW_QUERY)
}

export function isModuleWindowPath(path: string): boolean {
  return isModuleWindowSearch(splitRoute(path).search)
}

export function withModuleWindowQuery(path: string): string {
  const { pathname, search } = splitRoute(path)
  const params = new URLSearchParams(search)
  params.set(MODULE_WINDOW_QUERY, MODULE_WINDOW_VALUE)
  return `${pathname}?${params.toString()}`
}

export function stripModuleWindowQuery(path: string): string {
  const { pathname, search } = splitRoute(path)
  const params = new URLSearchParams(search)
  params.delete(MODULE_WINDOW_QUERY)
  const next = params.toString()
  return next ? `${pathname}?${next}` : pathname
}

export function isProjectWindowPath(path: string): boolean {
  return isProjectWindowSearch(splitRoute(path).search)
}

export function withProjectWindowQuery(path: string): string {
  const { pathname, search } = splitRoute(path)
  const params = new URLSearchParams(search)
  params.set(MODULE_WINDOW_QUERY, PROJECT_WINDOW_VALUE)
  return `${pathname}?${params.toString()}`
}

export function parseProjectIdFromPath(path: string): string | null {
  const match = splitRoute(path).pathname.match(/^\/project\/([^/]+)/)
  return match?.[1] ?? null
}

export function isProjectWorkspacePath(path: string): boolean {
  return parseProjectIdFromPath(path) != null
}

export function projectWindowKey(path: string): string {
  const projectId = parseProjectIdFromPath(path)
  return projectId ? `/project/${projectId}` : splitRoute(path).pathname
}

export function projectWindowPath(projectId: string, segment = 'overview'): string {
  const safe = (segment || 'overview').replace(/^\/+/, '')
  return `/project/${projectId}/${safe}`
}

export function hrefForWindowMode(path: string, search: string): string {
  if (isProjectWindowSearch(search)) return withProjectWindowQuery(path)
  if (isModuleWindowSearch(search)) return withModuleWindowQuery(path)
  return path
}

export function getModuleWindowProfile(path: string): ModuleWindowProfile | null {
  const { pathname } = splitRoute(path)
  const global = GLOBAL_PRESETS.find((preset) => preset.path === pathname)
  if (global) return global

  if (/\/editor\/[^/]+$/.test(pathname)) {
    return { id: 'editor', label: 'Document', width: 1280, height: 860, minWidth: 860, minHeight: 560 }
  }
  if (/\/flows\/[^/]+$/.test(pathname)) {
    return { id: 'flow-editor', label: 'Flow', width: 1280, height: 860, minWidth: 860, minHeight: 560 }
  }
  if (/\/architecture-designer\/[^/]+$/.test(pathname)) {
    return { id: 'architecture-editor', label: 'Architecture', width: 1360, height: 880, minWidth: 940, minHeight: 600 }
  }
  if (/\/presentations\/[^/]+$/.test(pathname)) {
    return { id: 'presentation-editor', label: 'Presentation', width: 1280, height: 860, minWidth: 900, minHeight: 600 }
  }

  const projectMatch = pathname.match(/^\/project\/[^/]+\/([^/]+)/)
  if (!projectMatch) return null
  return PROJECT_SEGMENTS[projectMatch[1]] ?? null
}

export function isPopoutModulePath(path: string): boolean {
  return getModuleWindowProfile(path) != null
}

export function moduleWindowTitle(path: string, productName: string): string {
  if (isProjectWindowPath(path) || (parseProjectIdFromPath(path) && !getModuleWindowProfile(path))) {
    return `Project — ${productName}`
  }
  const profile = getModuleWindowProfile(path)
  return profile ? `${profile.label} — ${productName}` : productName
}

function normalizePathname(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, '')
  return trimmed || '/'
}
