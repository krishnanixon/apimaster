import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import {
  DEFAULT_CODE_EDITOR_WORKSPACE_STATE,
  type CodeEditorWorkspaceState
} from '@shared/types/code-editor'

const STATE_FILE = 'code-editor-workspace.json'

function statePath(): string {
  const dir = join(app.getPath('userData'), 'data')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return join(dir, STATE_FILE)
}

class WorkspaceStateService {
  get(): CodeEditorWorkspaceState {
    const path = statePath()
    if (!existsSync(path)) return { ...DEFAULT_CODE_EDITOR_WORKSPACE_STATE }
    try {
      const parsed = JSON.parse(readFileSync(path, 'utf-8')) as Partial<CodeEditorWorkspaceState>
      return {
        ...DEFAULT_CODE_EDITOR_WORKSPACE_STATE,
        ...parsed,
        expandedPaths: Array.isArray(parsed.expandedPaths) ? parsed.expandedPaths : [],
        openTabPaths: Array.isArray(parsed.openTabPaths) ? parsed.openTabPaths : [],
        pinnedTabPaths: Array.isArray(parsed.pinnedTabPaths) ? parsed.pinnedTabPaths : [],
        terminalCwds: Array.isArray(parsed.terminalCwds) ? parsed.terminalCwds : [],
        terminalGroups: Array.isArray(parsed.terminalGroups)
          ? parsed.terminalGroups
              .filter((group) => group && Array.isArray(group.cwds))
              .map((group) => ({
                cwds: group.cwds.filter((cwd): cwd is string => typeof cwd === 'string').slice(0, 4),
                activeIndex: Number.isInteger(group.activeIndex) ? Math.max(0, group.activeIndex) : 0
              }))
              .filter((group) => group.cwds.length > 0)
          : [],
        activeTerminalGroupIndex: Number.isInteger(parsed.activeTerminalGroupIndex)
          ? Math.max(0, parsed.activeTerminalGroupIndex ?? 0)
          : 0,
        customIgnoreNames: Array.isArray(parsed.customIgnoreNames) ? parsed.customIgnoreNames : [],
        showIgnored: parsed.showIgnored === true,
        agentConversation:
          parsed.agentConversation && typeof parsed.agentConversation.workspaceRoot === 'string'
            ? {
                ...parsed.agentConversation,
                pendingPatches: Array.isArray(parsed.agentConversation.pendingPatches)
                  ? parsed.agentConversation.pendingPatches.filter(
                      (item) =>
                        item &&
                        typeof item.id === 'string' &&
                        typeof item.path === 'string' &&
                        typeof item.next === 'string' &&
                        item.status === 'pending'
                    )
                  : undefined
              }
            : null
      }
    } catch {
      return { ...DEFAULT_CODE_EDITOR_WORKSPACE_STATE }
    }
  }

  save(state: Partial<CodeEditorWorkspaceState>): void {
    const current = this.get()
    const incomingConversation = state.agentConversation
    const agentConversation =
      incomingConversation === undefined
        ? current.agentConversation
        : incomingConversation === null
          ? null
          : {
              ...incomingConversation,
              pendingPatches:
                incomingConversation.pendingPatches ??
                (incomingConversation.workspaceRoot === current.agentConversation?.workspaceRoot
                  ? current.agentConversation?.pendingPatches
                  : incomingConversation.pendingPatches)
            }
    const next: CodeEditorWorkspaceState = {
      ...current,
      ...state,
      expandedPaths: Array.isArray(state.expandedPaths) ? state.expandedPaths : current.expandedPaths,
      openTabPaths: Array.isArray(state.openTabPaths) ? state.openTabPaths : current.openTabPaths,
      pinnedTabPaths: Array.isArray(state.pinnedTabPaths) ? state.pinnedTabPaths : current.pinnedTabPaths,
      terminalCwds: Array.isArray(state.terminalCwds) ? state.terminalCwds : current.terminalCwds,
      terminalGroups: Array.isArray(state.terminalGroups) ? state.terminalGroups : current.terminalGroups,
      customIgnoreNames: Array.isArray(state.customIgnoreNames)
        ? state.customIgnoreNames
        : current.customIgnoreNames,
      agentConversation
    }
    writeFileSync(statePath(), JSON.stringify(next, null, 2), 'utf-8')
  }
}

export const workspaceStateService = new WorkspaceStateService()
