export type GitFileStatus =
  | 'unmodified'
  | 'untracked'
  | 'modified'
  | 'added'
  | 'deleted'
  | 'renamed'
  | 'conflicted'

export interface GitStatusEntry {
  path: string
  originalPath?: string
  status: GitFileStatus
  staged: boolean
  unstaged: boolean
}

export interface GitLogEntry {
  hash: string
  author: string
  date: string
  subject: string
}

export interface GitStashEntry {
  ref: string
  hash: string
  relativeDate: string
  message: string
}

export interface GitSnapshot {
  rootPath: string
  available: boolean
  branch: string | null
  branches: string[]
  ahead: number
  behind: number
  entries: GitStatusEntry[]
  error?: string
}

export interface GitDiffResult {
  path: string
  staged: boolean
  diff: string
}

export interface GitCommitInput {
  message: string
}

export interface GitCheckoutInput {
  branch: string
  create?: boolean
}

export interface GitRevertInput {
  path?: string
  /** Discard working-tree changes for a path, or revert HEAD when omitted. */
  mode: 'discard' | 'revert-head'
}

export type GitRemoteAction = 'fetch' | 'pull' | 'push' | 'stash' | 'stash-pop'

export interface GitCommandResult {
  action: GitRemoteAction
  code: number
  stdout: string
  stderr: string
}
