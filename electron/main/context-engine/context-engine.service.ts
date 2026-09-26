import { dirname, join, relative, resolve as resolvePath } from 'path'
import { promises as fs } from 'fs'
import type { ChatContextAttachment } from '@shared/types'
import type { AgentFileRef } from '@shared/types/agent'
import { DEFAULT_IGNORE_NAMES, isIgnoredName, mergeIgnoreNames } from '@shared/lib/ignore-rules'
import type { ContextChunk, ContextEngineResult } from '@shared/types/context-engine'
import type { CodeSearchHit } from '@shared/types/code-intel'
import {
  allocateTokenBudget,
  assembleContextPack,
  chunkId,
  contextDirectives,
  contextSearchQuery,
  estimateTokens,
  extractRelativeImports,
  looksLikeCodeQuery,
  reciprocalRankFusion
} from '@shared/lib/context-engine'
import { isInsideRoot } from '@shared/lib/voice-path-safety'
import { aiConfigService } from '../ai/config/ai-config.service'
import { codeEditorService } from '../code-editor/code-editor.service'
import { indexerService } from '../code-intel/indexer.service'
import { gitService } from '../git/git.service'
import { workspaceSession } from '../security/workspace-session'
import { buildAttachmentsContext } from '../knowledge/chat-context.service'
import { resolveAssistantContext } from '../knowledge/project-knowledge.service'
import { logger } from '../infra/logger.service'

export interface ResolveContextInput {
  query: string
  projectId?: string | null
  attachments?: ChatContextAttachment[]
  files?: AgentFileRef[]
  model: string
  conversationTokens: number
  systemTokens: number
}

function displayPath(absPath: string, root: string | null): string {
  if (!root) return absPath.replace(/\\/g, '/')
  return relative(root, absPath).replace(/\\/g, '/') || absPath.replace(/\\/g, '/')
}

function hitChunk(hit: CodeSearchHit, source: ContextChunk['source']): ContextChunk {
  const loc = `${hit.relativePath}:${hit.startLine}`
  return {
    id: chunkId(source, hit.relativePath, `${hit.startLine}:${hit.name ?? hit.snippet}`),
    source,
    path: hit.relativePath,
    title: hit.name ? `${hit.name} (${loc})` : loc,
    content: hit.snippet,
    score: Math.max(0, Math.min(1, hit.score > 1 ? hit.score / 20 : hit.score)),
    startLine: hit.startLine
  }
}

async function readCapped(absPath: string, maxChars: number): Promise<string | null> {
  try {
    const content = await codeEditorService.readFile(absPath)
    return content.length > maxChars ? content.slice(0, maxChars) : content
  } catch {
    return null
  }
}

class ContextEngineService {
  async resolve(input: ResolveContextInput): Promise<ContextEngineResult> {
    const config = aiConfigService.get()
    const localModel = config.mode === 'ollama'
    const budget = allocateTokenBudget({
      model: input.model,
      conversationTokens: input.conversationTokens,
      systemTokens: input.systemTokens,
      localModel
    })

    const searchQuery = contextSearchQuery(input.query)
    const chunks = (
      await Promise.all([
        this.collectEditor(searchQuery),
        this.collectPinned(input.files),
        this.collectProjectRules(),
        this.collectCodeSearch(input.query, searchQuery),
        this.collectKnowledge(input),
        this.collectAttachments(input),
        this.collectGit(input.query),
        this.collectDiagnostics(input.query)
      ])
    ).flat()

    const pack = assembleContextPack(chunks, budget, input.model)
    if (pack.summary.trimmed) {
      logger.info(
        `Context pack trimmed to ${pack.summary.promptTokens} tokens (${pack.summary.chunkCount} chunks)`,
        'ContextEngine'
      )
    }
    return pack
  }

  private async collectEditor(query: string): Promise<ContextChunk[]> {
    const snapshot = codeEditorService.getEditorContext()
    const root = workspaceSession.getRoot()
    if (!snapshot || !root) return []
    const chunks: ContextChunk[] = []
    const current = snapshot.currentFile

    if (snapshot.selectedCode.trim()) {
      chunks.push({
        id: chunkId('selection', current ?? 'selection', snapshot.selectedCode),
        source: 'selection',
        path: current ? displayPath(current, root) : undefined,
        title: 'Selection',
        content: snapshot.selectedCode,
        score: 1,
        startLine: snapshot.cursor?.line
      })
    }

    if (current) {
      const body =
        snapshot.visibleContent.trim() ||
        (await readCapped(current, 16_000)) ||
        ''
      if (body.trim()) {
        chunks.push({
          id: chunkId('current_file', current, 'body'),
          source: 'current_file',
          path: displayPath(current, root),
          title: displayPath(current, root),
          content: body,
          score: 0.95
        })
        chunks.push(...(await this.collectDependencies(current, body, root)))
      }
    }

    const otherTabs = snapshot.openTabs.filter((tab) => tab.path && tab.path !== current).slice(0, 4)
    for (const tab of otherTabs) {
      const body =
        (tab.content && tab.content.trim()) ||
        (await readCapped(tab.path, 8_000)) ||
        ''
      if (body.trim()) {
        chunks.push({
          id: chunkId('open_tab', tab.path, 'body'),
          source: 'open_tab',
          path: displayPath(tab.path, root),
          title: displayPath(tab.path, root),
          content: body,
          score: query.trim() ? 0.42 : 0.55
        })
      }
    }

    return chunks
  }

  private async collectPinned(files?: AgentFileRef[]): Promise<ContextChunk[]> {
    if (!files?.length) return []
    const root = workspaceSession.getRoot()
    const rules = mergeIgnoreNames([])
    const chunks: ContextChunk[] = []
    const seen = new Set<string>()

    const pushFile = async (abs: string) => {
      if (seen.has(abs) || chunks.length >= 24) return
      if (looksDangerousExternal(abs)) return
      seen.add(abs)
      const body = await readCapped(abs, 8_000)
      if (!body?.trim()) return
      const rel = displayPath(abs, root)
      chunks.push({
        id: chunkId('pinned', rel, 'body'),
        source: 'pinned',
        path: rel,
        title: rel,
        content: body,
        score: 0.97
      })
    }

    const walkFolder = async (dir: string, depth: number) => {
      if (depth > 6 || chunks.length >= 24) return
      let dirents
      try {
        dirents = await fs.readdir(dir, { withFileTypes: true })
      } catch {
        return
      }
      for (const entry of dirents) {
        if (chunks.length >= 24) return
        if (isIgnoredName(entry.name, rules) || DEFAULT_IGNORE_NAMES.includes(entry.name)) continue
        const abs = join(dir, entry.name)
        if (entry.isDirectory()) await walkFolder(abs, depth + 1)
        else if (entry.isFile() && isTextLike(entry.name)) await pushFile(abs)
      }
    }

    for (const file of files.slice(0, 40)) {
      const abs = resolvePath(file.path)
      try {
        const stat = await fs.stat(abs)
        if (stat.isDirectory() || file.kind === 'folder') await walkFolder(abs, 0)
        else await pushFile(abs)
      } catch {
        // skip missing dropped paths
      }
    }
    return chunks
  }

  private async collectProjectRules(): Promise<ContextChunk[]> {
    const root = workspaceSession.getRoot()
    if (!root) return []
    const files: { abs: string; rel: string }[] = []
    const named = ['AGENTS.md', '.ai-workbench/rules.md']
    for (const rel of named) {
      const abs = join(root, rel)
      if (!isInsideRoot(abs, root)) continue
      files.push({ abs, rel })
    }
    const rulesDir = join(root, '.ai-workbench', 'rules')
    try {
      const dirents = await fs.readdir(rulesDir, { withFileTypes: true })
      for (const entry of dirents) {
        if (!entry.isFile()) continue
        if (!/\.(md|txt)$/i.test(entry.name)) continue
        const abs = join(rulesDir, entry.name)
        if (!isInsideRoot(abs, root)) continue
        files.push({ abs, rel: displayPath(abs, root) })
      }
    } catch {
      // no rules folder
    }

    const chunks: ContextChunk[] = []
    for (const file of files.slice(0, 8)) {
      const body = await readCapped(file.abs, 8_000)
      if (!body?.trim()) continue
      chunks.push({
        id: chunkId('project_rules', file.rel, 'rules'),
        source: 'project_rules',
        path: file.rel,
        title: file.rel,
        content: body,
        score: 0.88
      })
    }
    return chunks
  }

  private async collectDependencies(
    currentFile: string,
    content: string,
    root: string
  ): Promise<ContextChunk[]> {
    const specs = extractRelativeImports(content).slice(0, 6)
    const chunks: ContextChunk[] = []
    for (const spec of specs) {
      const abs = resolvePath(dirname(currentFile), spec)
      if (!isInsideRoot(abs, root)) continue
      const candidates = [
        abs,
        `${abs}.ts`,
        `${abs}.tsx`,
        `${abs}.js`,
        `${abs}.jsx`,
        resolvePath(abs, 'index.ts'),
        resolvePath(abs, 'index.tsx')
      ]
      let body: string | null = null
      let used = abs
      for (const candidate of candidates) {
        body = await readCapped(candidate, 6_000)
        if (body) {
          used = candidate
          break
        }
      }
      if (!body) continue
      chunks.push({
        id: chunkId('dependency', used, spec),
        source: 'dependency',
        path: displayPath(used, root),
        title: spec,
        content: body,
        score: 0.7
      })
    }
    return chunks
  }

  private collectCodeSearch(query: string, searchQuery = contextSearchQuery(query)): ContextChunk[] {
    const snapshot = codeEditorService.getEditorContext()
    const directives = contextDirectives(query)
    const shouldSearch =
      directives.has('codebase') ||
      looksLikeCodeQuery(query) ||
      Boolean(snapshot?.selectedCode.trim() || snapshot?.currentFile)
    if (!shouldSearch || !searchQuery) return []
    try {
      const textHits = indexerService.search({ mode: 'text', query: searchQuery, limit: 8 })
      const symbolHits = indexerService.search({ mode: 'symbol', query: searchQuery, limit: 8 })
      const fused = reciprocalRankFusion([
        textHits.map((hit) => ({ id: `${hit.relativePath}:${hit.startLine}` })),
        symbolHits.map((hit) => ({ id: `${hit.relativePath}:${hit.startLine}` }))
      ])
      const byId = new Map<string, { hit: CodeSearchHit; source: ContextChunk['source'] }>()
      for (const hit of symbolHits) {
        byId.set(`${hit.relativePath}:${hit.startLine}`, { hit, source: 'symbol' })
      }
      for (const hit of textHits) {
        const id = `${hit.relativePath}:${hit.startLine}`
        if (!byId.has(id)) byId.set(id, { hit, source: 'file' })
      }
      return [...byId.entries()]
        .map(([id, row]) => {
          const rrf = fused.get(id) ?? 0
          const built = hitChunk(row.hit, row.source)
          return { ...built, score: Math.min(1, built.score * 0.4 + rrf * 8) }
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, 8)
    } catch (error) {
      logger.warn(
        `Code search skipped: ${error instanceof Error ? error.message : error}`,
        'ContextEngine'
      )
      return []
    }
  }

  private async collectKnowledge(input: ResolveContextInput): Promise<ContextChunk[]> {
    try {
      const resolved = await resolveAssistantContext({
        projectId: input.projectId ?? null,
        query: input.query,
        mode: 'auto'
      })
      if (!resolved.formatted.trim()) return []
      return [
        {
          id: chunkId('knowledge', input.projectId ?? 'global', resolved.source),
          source: resolved.usedRag ? 'vector' : 'knowledge',
          title: resolved.usedRag ? 'RAG' : 'Knowledge',
          content: resolved.formatted,
          score: resolved.usedRag ? 0.75 : 0.55
        }
      ]
    } catch (error) {
      logger.warn(
        `Knowledge retrieve skipped: ${error instanceof Error ? error.message : error}`,
        'ContextEngine'
      )
      return []
    }
  }

  private async collectAttachments(input: ResolveContextInput): Promise<ContextChunk[]> {
    if (!input.attachments?.length || !input.projectId) return []
    try {
      const block = await buildAttachmentsContext(input.projectId, input.attachments)
      if (!block.trim()) return []
      return [
        {
          id: chunkId('attachment', input.projectId, input.attachments.map((a) => a.id).join(',')),
          source: 'attachment',
          title: 'Attachments',
          content: block,
          score: 0.85
        }
      ]
    } catch {
      return []
    }
  }

  private async collectGit(query: string): Promise<ContextChunk[]> {
    if (!workspaceSession.getRoot()) return []
    const snapshot = codeEditorService.getEditorContext()
    const directives = contextDirectives(query)
    if (!directives.has('git') && !looksLikeCodeQuery(query) && !snapshot?.currentFile) return []
    try {
      const git = await gitService.snapshot()
      if (!git.available) return []
      const changed = git.entries
        .filter((entry) => entry.status === 'modified' || entry.status === 'added')
        .slice(0, 3)
      const chunks: ContextChunk[] = []
      for (const entry of changed) {
        try {
          const diff = await gitService.diff(entry.path, false)
          if (!diff.diff.trim()) continue
          chunks.push({
            id: chunkId('git_diff', entry.path, entry.status),
            source: 'git_diff',
            path: entry.path.replace(/\\/g, '/'),
            title: entry.path,
            content: diff.diff.slice(0, 8_000),
            score: 0.6
          })
        } catch {
          // ignore per-file diff failures
        }
      }
      return chunks
    } catch {
      return []
    }
  }

  private collectDiagnostics(query: string): ContextChunk[] {
    const snapshot = codeEditorService.getEditorContext()
    const diagnostics = snapshot?.diagnostics ?? []
    if (diagnostics.length === 0) return []
    const directives = contextDirectives(query)
    const wantsProblems =
      directives.has('problems') ||
      /\b(fix|bug|error|diagnostic|lint|type\s*error|tsc|eslint|compile)\b/i.test(query)
    if (!wantsProblems) return []

    const lines = diagnostics.slice(0, 40).map((item) => {
      const loc = [item.file, item.line].filter(Boolean).join(':')
      const code = item.code ? ` [${item.code}]` : ''
      const severity = item.severity ? `${item.severity} ` : ''
      return `- ${severity}${loc || 'workspace'}${code}: ${item.message}`
    })
    return [
      {
        id: chunkId('diagnostics', snapshot?.rootPath ?? 'workspace', lines[0] ?? 'diag'),
        source: 'diagnostics',
        title: `Problems (${Math.min(diagnostics.length, 40)})`,
        content: lines.join('\n'),
        score: directives.has('problems') ? 0.98 : 0.82
      }
    ]
  }
}

export const contextEngine = new ContextEngineService()
export { estimateTokens }

function isTextLike(name: string): boolean {
  return /\.(ts|tsx|js|jsx|mjs|cjs|json|md|txt|css|scss|html|yml|yaml|toml|sql|py|go|rs|java|kt|swift|vue|svelte|xml|env|sh|ps1)$/i.test(
    name
  )
}

function looksDangerousExternal(abs: string): boolean {
  const n = abs.replace(/\\/g, '/').toLowerCase()
  return (
    n.includes('/windows/system32') ||
    n.startsWith('/etc/') ||
    n.startsWith('/sys/') ||
    n.startsWith('/proc/') ||
    n.includes('/.ssh/')
  )
}
