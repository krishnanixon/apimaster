import type { ApiFolder, ApiRequest } from '../types/api.types'

/** Folders whose parent is `parentId` (null = collection root), preserving array order. */
export function getChildFolders(folders: ApiFolder[], parentId: string | null = null): ApiFolder[] {
  return folders.filter((f) => (f.parentId ?? null) === parentId)
}

/** All descendant folder ids including `folderId` itself. */
export function getDescendantFolderIds(folders: ApiFolder[], folderId: string): Set<string> {
  const ids = new Set<string>([folderId])
  let grew = true
  while (grew) {
    grew = false
    for (const folder of folders) {
      const parent = folder.parentId ?? null
      if (parent && ids.has(parent) && !ids.has(folder.id)) {
        ids.add(folder.id)
        grew = true
      }
    }
  }
  return ids
}

/** True if `maybeDescendantId` is `ancestorId` or nested under it. */
export function isFolderDescendant(
  folders: ApiFolder[],
  ancestorId: string,
  maybeDescendantId: string
): boolean {
  return getDescendantFolderIds(folders, ancestorId).has(maybeDescendantId)
}

/** Folder chain from collection root → the given folder (inclusive). Empty if `folderId` is missing. */
export function getFolderAncestors(folders: ApiFolder[], folderId: string | null | undefined): ApiFolder[] {
  if (!folderId) return []
  const byId = new Map(folders.map((f) => [f.id, f]))
  const chain: ApiFolder[] = []
  let current: ApiFolder | undefined = byId.get(folderId)
  const seen = new Set<string>()
  while (current && !seen.has(current.id)) {
    seen.add(current.id)
    chain.unshift(current)
    current = current.parentId ? byId.get(current.parentId) : undefined
  }
  return chain
}

/** Breadcrumb path names from root → folder (inclusive). */
export function getFolderPath(folders: ApiFolder[], folderId: string): string[] {
  const byId = new Map(folders.map((f) => [f.id, f]))
  const parts: string[] = []
  let current: ApiFolder | undefined = byId.get(folderId)
  const seen = new Set<string>()
  while (current && !seen.has(current.id)) {
    seen.add(current.id)
    parts.unshift(current.name)
    current = current.parentId ? byId.get(current.parentId) : undefined
  }
  return parts
}

/** Flat list of folders with depth for indented pickers. */
export function flattenFolderTree(
  folders: ApiFolder[],
  parentId: string | null = null,
  depth = 0
): Array<{ folder: ApiFolder; depth: number }> {
  const result: Array<{ folder: ApiFolder; depth: number }> = []
  for (const folder of getChildFolders(folders, parentId)) {
    result.push({ folder, depth })
    result.push(...flattenFolderTree(folders, folder.id, depth + 1))
  }
  return result
}

/** Requests in this folder and all nested subfolders. */
export function collectFolderTreeRequests(folders: ApiFolder[], requests: ApiRequest[], folderId: string): ApiRequest[] {
  const ids = getDescendantFolderIds(folders, folderId)
  return requests.filter((r) => r.folderId != null && ids.has(r.folderId))
}
