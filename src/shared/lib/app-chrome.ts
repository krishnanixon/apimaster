/** Routes where the sidebar auto-collapses and the top bar is hidden. */
const STANDALONE_MODULE_PREFIXES = [
  '/notepad',
  '/vps',
  '/vault',
  '/clipboard',
  '/terminal',
  '/code-editor',
  '/api-studio',
  '/database-studio',
  '/vector-studio',
  '/rag-studio'
] as const

/** Project-scoped hybrid studio segments that use standalone chrome. */
const PROJECT_STANDALONE_SEGMENTS = new Set([
  'api-studio',
  'database-studio',
  'vector-studio',
  'rag-studio'
])

export function isStandaloneModuleRoute(pathname: string): boolean {
  const path = pathname.split('?')[0]?.replace(/\/+$/, '') || '/'
  if (STANDALONE_MODULE_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) {
    return true
  }

  const projectMatch = path.match(/^\/project\/[^/]+\/([^/]+)/)
  if (projectMatch && PROJECT_STANDALONE_SEGMENTS.has(projectMatch[1])) {
    return true
  }

  return false
}

/** Full-screen editor routes — sidebar and top bar are fully hidden. */
export function isImmersiveRoute(pathname: string): boolean {
  return (
    /\/editor\/[^/]+$/.test(pathname) ||
    /\/flows\/[^/]+$/.test(pathname) ||
    /\/architecture-designer\/[^/]+$/.test(pathname) ||
    /\/presentations\/[^/]+$/.test(pathname)
  )
}
