/** Local filesystem code editor workspace. */

import type { AgentConversationState } from './agent'
import type { PersistedTerminalGroup } from './terminal'

export interface FileSystemEntry {
  /** Absolute path on disk */
  path: string
  name: string
  isDirectory: boolean
  ignored?: boolean
}

export interface OpenedWorkspace {
  rootPath: string
  rootName: string
  entries: FileSystemEntry[]
}

export interface ReadDirectoryOptions {
  includeIgnored?: boolean
}

export interface ReadDirectoryResult {
  path: string
  entries: FileSystemEntry[]
}

export interface FileContentResult {
  path: string
  content: string
}

export interface WriteFileInput {
  path: string
  content: string
}

export type FileSystemEntryKind = 'file' | 'folder'

export interface CreateEntryInput {
  /** Directory the new entry is created inside */
  parentPath: string
  name: string
  kind: FileSystemEntryKind
}

export interface RenameEntryInput {
  path: string
  newName: string
}

export interface CopyMoveEntryInput {
  sourcePath: string
  destDir: string
}

export interface FileSearchHit {
  path: string
  name: string
  relativePath: string
}

export interface IgnoreRulesState {
  defaults: string[]
  custom: string[]
  names: string[]
  showIgnored: boolean
}

export interface EditorCursor {
  line: number
  column: number
  offset: number
}

export interface EditorTabSnapshot {
  path: string
  name: string
  dirty: boolean
  /** Capped body so the agent can see other open files, not just names. */
  content?: string
}

export interface EditorDiagnosticSnippet {
  file?: string
  line?: number
  column?: number
  code?: string
  message: string
  severity?: 'error' | 'warning' | 'info'
  source?: string
}

export interface EditorContextSnapshot {
  rootPath: string | null
  currentFile: string | null
  selectedCode: string
  cursor: EditorCursor | null
  openTabs: EditorTabSnapshot[]
  visibleContent: string
  /** Bounded Problems panel snapshot for @problems / debug context. */
  diagnostics?: EditorDiagnosticSnippet[]
}

/** Persisted code editor workspace preferences */
export interface CodeEditorWorkspaceState {
  lastRootPath: string | null
  openTabPaths: string[]
  pinnedTabPaths: string[]
  activeTabPath: string | null
  expandedPaths: string[]
  terminalPanelOpen: boolean
  terminalCwds: string[]
  activeTerminalIndex: number
  terminalGroups: PersistedTerminalGroup[]
  activeTerminalGroupIndex: number
  showIgnored: boolean
  customIgnoreNames: string[]
  agentConversation: AgentConversationState | null
}

export type EditorAiKind = 'inline-edit' | 'inline-ask' | 'completion' | 'next-edit'

export interface EditorAiRequest {
  requestId: string
  kind: EditorAiKind
  instruction?: string
  filePath?: string
  language?: string
  prefix: string
  suffix: string
  selection?: string
  model?: string
}

export interface EditorAiChunk {
  requestId: string
  content: string
  done: boolean
}

export const DEFAULT_CODE_EDITOR_WORKSPACE_STATE: CodeEditorWorkspaceState = {
  lastRootPath: null,
  openTabPaths: [],
  pinnedTabPaths: [],
  activeTabPath: null,
  expandedPaths: [],
  terminalPanelOpen: true,
  terminalCwds: [],
  activeTerminalIndex: 0,
  terminalGroups: [],
  activeTerminalGroupIndex: 0,
  showIgnored: false,
  customIgnoreNames: [],
  agentConversation: null
}
