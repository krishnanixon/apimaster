import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import {
  DEFAULT_TERMINAL_WORKSPACE_STATE,
  type TerminalWorkspaceState
} from '@shared/types/terminal'

const STATE_FILE = 'terminal-workspace.json'

function statePath(): string {
  const dir = join(app.getPath('userData'), 'data')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return join(dir, STATE_FILE)
}

class TerminalStateService {
  get(): TerminalWorkspaceState {
    const path = statePath()
    if (!existsSync(path)) return { ...DEFAULT_TERMINAL_WORKSPACE_STATE }
    try {
      const parsed = JSON.parse(readFileSync(path, 'utf-8')) as Partial<TerminalWorkspaceState>
      return {
        ...DEFAULT_TERMINAL_WORKSPACE_STATE,
        ...parsed,
        recentFolderPaths: Array.isArray(parsed.recentFolderPaths) ? parsed.recentFolderPaths : [],
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
          : 0
      }
    } catch {
      return { ...DEFAULT_TERMINAL_WORKSPACE_STATE }
    }
  }

  save(state: TerminalWorkspaceState): void {
    writeFileSync(statePath(), JSON.stringify(state, null, 2), 'utf-8')
  }
}

export const terminalStateService = new TerminalStateService()
