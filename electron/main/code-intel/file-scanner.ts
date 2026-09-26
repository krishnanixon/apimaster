import { createHash } from 'crypto'
import { promises as fs } from 'fs'
import { relative, join } from 'path'
import type { IgnoreRuleSet } from '@shared/lib/ignore-rules'
import { isIgnoredName, isIgnoredPath } from '@shared/lib/ignore-rules'
import { detectLanguage, isIndexableSourceFile } from '@shared/lib/language-detect'
import type { SourceLanguage } from '@shared/types/code-intel'

export interface ScannedFile {
  path: string
  relativePath: string
  language: SourceLanguage
  size: number
  mtimeMs: number
}

export const MAX_INDEX_FILE_BYTES = 512 * 1024
export const MAX_INDEX_FILES = 20_000

export async function scanWorkspaceFiles(
  rootPath: string,
  rules: IgnoreRuleSet,
  options?: { maxFiles?: number; maxBytes?: number }
): Promise<ScannedFile[]> {
  const maxFiles = options?.maxFiles ?? MAX_INDEX_FILES
  const maxBytes = options?.maxBytes ?? MAX_INDEX_FILE_BYTES
  const files: ScannedFile[] = []

  const walk = async (dir: string, depth: number): Promise<void> => {
    if (files.length >= maxFiles || depth > 24) return
    let dirents
    try {
      dirents = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of dirents) {
      if (files.length >= maxFiles) return
      if (isIgnoredName(entry.name, rules)) continue
      const full = join(dir, entry.name)
      if (isIgnoredPath(rootPath, full, rules)) continue
      if (entry.isDirectory()) {
        await walk(full, depth + 1)
        continue
      }
      if (!entry.isFile() || !isIndexableSourceFile(full)) continue
      try {
        const stat = await fs.stat(full)
        if (stat.size > maxBytes) continue
        files.push({
          path: full,
          relativePath: relative(rootPath, full).replace(/\\/g, '/'),
          language: detectLanguage(full),
          size: stat.size,
          mtimeMs: Math.floor(stat.mtimeMs)
        })
      } catch {
        // skip unreadable
      }
    }
  }

  await walk(rootPath, 0)
  return files
}

export function hashContent(content: string): string {
  return createHash('sha1').update(content).digest('hex')
}
