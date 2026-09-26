import { existsSync, lstatSync, realpathSync } from 'fs'
import { dirname } from 'path'
import { UnsafePathError, assertSafePath, isInsideRoot } from '@shared/lib/voice-path-safety'

/**
 * Tracks the currently opened code-editor workspace so filesystem, git, and
 * captured terminal commands cannot escape the project root.
 */
class WorkspaceSession {
  private rootPath: string | null = null

  getRoot(): string | null {
    return this.rootPath
  }

  requireRoot(): string {
    if (!this.rootPath) {
      throw new UnsafePathError('No folder is open. Open a workspace first.')
    }
    return this.rootPath
  }

  setRoot(rootPath: string): string {
    const resolved = assertSafePath(rootPath, [rootPath])
    if (resolved === '/' || resolved === '\\' || /^[a-zA-Z]:[\\/]?$/.test(resolved)) {
      throw new UnsafePathError('Refusing to open a drive root as a workspace')
    }
    this.rootPath = resolved
    return resolved
  }

  clear(): void {
    this.rootPath = null
  }

  /**
   * Resolve `candidate` inside the open workspace. Uses realpath when the
   * target exists so symlinks cannot escape the root.
   */
  resolve(candidate: string, options?: { mustExist?: boolean }): string {
    const root = this.requireRoot()
    const resolved = assertSafePath(candidate, [root])

    if (existsSync(resolved)) {
      const realRoot = existsSync(root) ? realpathSync(root) : root
      const realTarget = realpathSync(resolved)
      if (!isInsideRoot(realTarget, realRoot)) {
        throw new UnsafePathError('Path resolves outside the workspace.')
      }
      return realTarget
    }

    if (options?.mustExist) {
      throw new UnsafePathError('Path does not exist inside the workspace.')
    }

    const parent = dirname(resolved)
    if (!existsSync(parent)) {
      throw new UnsafePathError('Parent directory does not exist inside the workspace.')
    }
    const realRoot = realpathSync(root)
    const realParent = lstatSync(parent).isSymbolicLink() ? realpathSync(parent) : realpathSync(parent)
    if (!isInsideRoot(realParent, realRoot) && realParent !== realRoot) {
      throw new UnsafePathError('Parent path resolves outside the workspace.')
    }
    return resolved
  }

  resolveCwd(cwd: string): string {
    const resolved = this.resolve(cwd, { mustExist: true })
    const target = lstatSync(resolved).isSymbolicLink() ? realpathSync(resolved) : resolved
    if (!lstatSync(target).isDirectory()) {
      throw new UnsafePathError('Working directory must be a folder inside the workspace.')
    }
    return target
  }
}

export const workspaceSession = new WorkspaceSession()
export { UnsafePathError }
