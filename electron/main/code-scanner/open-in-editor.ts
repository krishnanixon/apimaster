import { app, shell } from 'electron'
import { realpathSync } from 'fs'
import { resolve, sep } from 'path'

/** Editors that open `scheme://file/<path>:<line>` links, in the order we try them. */
const EDITOR_SCHEMES: Array<{ scheme: string; name: string }> = [
  { scheme: 'vscode', name: 'VS Code' },
  { scheme: 'cursor', name: 'Cursor' },
  { scheme: 'windsurf', name: 'Windsurf' },
  { scheme: 'zed', name: 'Zed' }
]

export interface OpenSourceResult {
  /** Editor that opened the file at the line, or null when it opened in the default app (no line). */
  editor: string | null
}

/**
 * Opens a scanned file at a line. Only files inside `root` (symlinks resolved) can be opened, so a
 * renderer can't use this to launch arbitrary paths.
 */
export async function openSourceInEditor(root: string, file: string, line: number): Promise<OpenSourceResult> {
  const realRoot = realpathSync(root)
  const real = realpathSync(resolve(root, file))
  if (!real.startsWith(realRoot + sep)) throw new Error('That file is outside the scanned folder')

  const target = `${real.startsWith('/') ? '' : '/'}${real.replace(/\\/g, '/')}:${Math.max(1, Math.floor(line))}`
  for (const { scheme, name } of EDITOR_SCHEMES) {
    const url = `${scheme}://file${encodeURI(target)}`
    if (!app.getApplicationNameForProtocol(url)) continue
    await shell.openExternal(url)
    return { editor: name }
  }
  const error = await shell.openPath(real)
  if (error) throw new Error(error)
  return { editor: null }
}
