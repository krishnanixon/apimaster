import { v4 as uuidv4 } from 'uuid'
import { getStorageEngine } from '../core/storageEngine'
import type { CreateFolderInput, Folder, FolderTreeNode } from '../types/folder.types'

function buildTree(folders: Folder[], noteCounts: Map<string | null, number>): FolderTreeNode[] {
  const map = new Map<string, FolderTreeNode>()

  for (const folder of folders) {
    map.set(folder.id, {
      ...folder,
      children: [],
      noteCount: noteCounts.get(folder.id) ?? 0
    })
  }

  const roots: FolderTreeNode[] = []

  for (const node of map.values()) {
    if (node.parentId && map.has(node.parentId)) {
      map.get(node.parentId)!.children.push(node)
    } else {
      roots.push(node)
    }
  }

  const sortNodes = (nodes: FolderTreeNode[]) => {
    nodes.sort((a, b) => a.name.localeCompare(b.name))
    for (const node of nodes) sortNodes(node.children)
  }
  sortNodes(roots)

  return roots
}

export const folderService = {
  async createFolder(input: CreateFolderInput): Promise<Folder> {
    const storage = await getStorageEngine()
    const now = Date.now()

    const folder: Folder = {
      id: uuidv4(),
      name: input.name.trim() || 'New Folder',
      parentId: input.parentId ?? null,
      createdAt: now,
      updatedAt: now
    }

    await storage.saveFolder(folder)
    return folder
  },

  async updateFolder(id: string, name: string): Promise<Folder> {
    const storage = await getStorageEngine()
    const existing = await storage.getFolder(id)
    if (!existing) throw new Error(`Folder not found: ${id}`)

    const updated: Folder = { ...existing, name: name.trim(), updatedAt: Date.now() }
    await storage.saveFolder(updated)
    return updated
  },

  async deleteFolder(id: string): Promise<void> {
    const storage = await getStorageEngine()
    const allFolders = await storage.getAllFolders()
    const childIds = this.collectDescendantIds(id, allFolders)

    const notes = await storage.getAllNotes()
    for (const note of notes) {
      if (note.folderId === id || childIds.includes(note.folderId ?? '')) {
        await storage.saveNote({ ...note, folderId: null, updatedAt: Date.now() })
      }
    }

    for (const childId of childIds) await storage.deleteFolder(childId)
    await storage.deleteFolder(id)
  },

  async getAllFolders(): Promise<Folder[]> {
    const storage = await getStorageEngine()
    return storage.getAllFolders()
  },

  async getFolderTree(): Promise<FolderTreeNode[]> {
    const storage = await getStorageEngine()
    const folders = await storage.getAllFolders()
    const notes = await storage.getAllNotes()

    const noteCounts = new Map<string | null, number>()
    for (const note of notes) {
      const key = note.folderId
      noteCounts.set(key, (noteCounts.get(key) ?? 0) + 1)
    }

    return buildTree(folders, noteCounts)
  },

  collectDescendantIds(parentId: string, folders: Folder[]): string[] {
    const ids: string[] = []
    for (const folder of folders) {
      if (folder.parentId === parentId) {
        ids.push(folder.id)
        ids.push(...this.collectDescendantIds(folder.id, folders))
      }
    }
    return ids
  }
}
