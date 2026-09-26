export interface Folder {
  id: string
  name: string
  parentId: string | null
  createdAt: number
  updatedAt: number
}

export interface FolderTreeNode extends Folder {
  children: FolderTreeNode[]
  noteCount: number
}

export interface CreateFolderInput {
  name: string
  parentId?: string | null
}
