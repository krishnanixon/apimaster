import { promises as fs } from 'fs'
import { extname, join, relative } from 'path'
import { auditSeoSources, type SeoAuditSource } from '@shared/lib/seo-audit'
import type { SeoAuditReport } from '@shared/types/seo-audit'
import { DEFAULT_IGNORE_NAMES } from '@shared/lib/ignore-rules'
import { workspaceSession } from '../security/workspace-session'

const AUDIT_EXTENSIONS = new Set(['.html', '.htm', '.js', '.jsx', '.ts', '.tsx', '.vue', '.astro', '.svelte', '.mdx', '.json', '.txt'])
const MAX_FILES = 5_000
const MAX_BYTES = 512 * 1024
const READ_CONCURRENCY = 24

async function mapPool<T, R>(items: T[], concurrency: number, worker: (item: T) => Promise<R | null>): Promise<R[]> {
  const results: R[] = []
  let next = 0
  const runners = Array.from({ length: Math.min(concurrency, Math.max(1, items.length)) }, async () => {
    while (next < items.length) {
      const index = next++
      const value = await worker(items[index]!)
      if (value) results.push(value)
    }
  })
  await Promise.all(runners)
  return results
}

class SeoAuditService {
  async run(): Promise<SeoAuditReport> {
    const rootPath = workspaceSession.requireRoot()
    const candidates: Array<{ path: string; relativePath: string }> = []

    const walk = async (dir: string, depth: number): Promise<void> => {
      if (depth > 24 || candidates.length >= MAX_FILES) return
      let entries
      try {
        entries = await fs.readdir(dir, { withFileTypes: true })
      } catch {
        return
      }
      for (const entry of entries) {
        if (candidates.length >= MAX_FILES) break
        if (DEFAULT_IGNORE_NAMES.includes(entry.name)) continue
        const path = join(dir, entry.name)
        if (entry.isDirectory()) {
          await walk(path, depth + 1)
          continue
        }
        if (!entry.isFile() || !AUDIT_EXTENSIONS.has(extname(entry.name).toLowerCase())) continue
        candidates.push({
          path,
          relativePath: relative(rootPath, path).replace(/\\/g, '/')
        })
      }
    }

    await walk(rootPath, 0)
    const MAX_TOTAL_BYTES = 48 * 1024 * 1024
    let totalBytes = 0
    const sources = await mapPool(candidates, READ_CONCURRENCY, async (candidate) => {
      if (totalBytes >= MAX_TOTAL_BYTES) return null
      try {
        const stat = await fs.stat(candidate.path)
        if (stat.size > MAX_BYTES) return null
        if (totalBytes + stat.size > MAX_TOTAL_BYTES) return null
        const content = await fs.readFile(candidate.path, 'utf8')
        totalBytes += stat.size
        const source: SeoAuditSource = {
          path: candidate.path,
          relativePath: candidate.relativePath,
          content
        }
        return source
      } catch {
        return null
      }
    })
    return auditSeoSources(rootPath, sources)
  }
}

export const seoAuditService = new SeoAuditService()
