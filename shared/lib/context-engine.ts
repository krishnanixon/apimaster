import { estimateCostUsd } from './ai-models'
import type {
  ContextChunk,
  ContextEngineResult,
  ContextPackSummary,
  ContextSourceKind,
  RankedRetrievalHit,
  TokenBudget
} from '../types/context-engine'

/** Rough tokenizer: ~4 characters per token for mixed code/prose. */
export const CHARS_PER_TOKEN = 4

export const CONTEXT_SOURCE_PRIORITY: Record<ContextSourceKind, number> = {
  selection: 1,
  diagnostics: 2,
  pinned: 3,
  current_file: 4,
  project_rules: 5,
  open_tab: 6,
  dependency: 7,
  symbol: 8,
  file: 9,
  vector: 9,
  git_diff: 10,
  attachment: 11,
  knowledge: 12,
}

const SOURCE_HEADING: Record<ContextSourceKind, string> = {
  selection: 'Current selection',
  diagnostics: 'Problems / diagnostics',
  current_file: 'Current file',
  open_tab: 'Open tab',
  dependency: 'Direct dependency',
  symbol: 'Relevant symbol',
  file: 'Relevant file',
  vector: 'Semantic match',
  git_diff: 'Git diff',
  attachment: 'Attached context',
  knowledge: 'Project knowledge',
  project_rules: 'Project rules',
  pinned: 'Pinned file'
}

export const DEFAULT_OUTPUT_RESERVE_TOKENS = 4_096
// A focused coding context is usually more accurate and much cheaper than filling the
// model window. Tools can fetch another file when the first pack is insufficient.
export const DEFAULT_PACK_CAP_TOKENS = 8_000
export const LOCAL_PACK_CAP_TOKENS = 2_500

export function estimateTokens(text: string): number {
  if (!text) return 0
  return Math.ceil(text.length / CHARS_PER_TOKEN)
}

export function modelContextLimit(model: string): number {
  const id = model.toLowerCase()
  if (/llama|qwen|phi|mistral|gemma|codellama/.test(id)) return 8_192
  if (id.includes('haiku') || id.includes('sonnet') || id.includes('opus')) return 200_000
  if (id.includes('gemini')) return 1_000_000
  if (id.includes('gpt-4.1') || id.includes('gpt-5') || id.includes('o3') || id.includes('o4')) {
    return 128_000
  }
  return 128_000
}

export function allocateTokenBudget(input: {
  model: string
  conversationTokens: number
  systemTokens: number
  localModel?: boolean
  outputReserve?: number
}): TokenBudget {
  const modelContextLimitTokens = modelContextLimit(input.model)
  const outputReserve = input.outputReserve ?? DEFAULT_OUTPUT_RESERVE_TOKENS
  const packCap = input.localModel ? LOCAL_PACK_CAP_TOKENS : DEFAULT_PACK_CAP_TOKENS
  const remaining = Math.max(
    512,
    modelContextLimitTokens - outputReserve - input.systemTokens - input.conversationTokens
  )
  return {
    modelContextLimit: modelContextLimitTokens,
    outputReserve,
    systemReserve: input.systemTokens,
    conversationTokens: input.conversationTokens,
    packCap,
    availableForContext: Math.min(remaining, packCap)
  }
}

export function looksLikeCodeQuery(query: string): boolean {
  const text = query.trim()
  if (!text) return false
  if (text.length < 8) return /[./_`()]/.test(text)
  if (
    /\b(function|class|const|let|var|import|export|interface|type|enum|def|fn|impl|struct|component|hook|endpoint|refactor|implement|bug|error|stack|diff|compile|typescript|python)\b/i.test(
      text
    )
  ) {
    return true
  }
  if (/\.\w{1,8}\b/.test(text)) return true
  if (/[A-Z][a-z]+[A-Z]/.test(text)) return true
  if (/[`'"][\w./\\-]+[`'"]/.test(text)) return true
  return false
}

export type ContextDirective = 'codebase' | 'git' | 'selection' | 'rules' | 'problems'

/** Explicit @context references are kept separate from fuzzy query heuristics. */
export function contextDirectives(query: string): Set<ContextDirective> {
  const found = new Set<ContextDirective>()
  const matches = query.matchAll(/(?:^|\s)@(codebase|git|selection|rules|problems)\b/gi)
  for (const match of matches) found.add(match[1]!.toLowerCase() as ContextDirective)
  return found
}

/** Remove UI-only @directives before sending a query to text/symbol retrieval. */
export function contextSearchQuery(query: string): string {
  return query
    .replace(/(?:^|\s)@(codebase|git|selection|rules|problems)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const RELATIVE_IMPORT_RE =
  /(?:from\s+|import\s+|require\s*\(\s*)['"](\.[^'"]+)['"]/g

export function extractRelativeImports(content: string): string[] {
  const found: string[] = []
  const seen = new Set<string>()
  RELATIVE_IMPORT_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = RELATIVE_IMPORT_RE.exec(content))) {
    const spec = match[1]
    if (!spec || seen.has(spec)) continue
    seen.add(spec)
    found.push(spec)
  }
  return found
}

export function compressText(text: string, maxChars: number): { text: string; compressed: boolean } {
  if (maxChars <= 0) return { text: '', compressed: true }
  if (text.length <= maxChars) return { text, compressed: false }
  const marker = '\n…[compressed]…\n'
  const budget = Math.max(32, maxChars - marker.length)
  const head = Math.floor(budget * 0.65)
  const tail = budget - head
  return {
    text: `${text.slice(0, head)}${marker}${text.slice(-tail)}`,
    compressed: true
  }
}

export function chunkId(source: ContextSourceKind, path: string | undefined, extra: string): string {
  return `${source}:${path ?? ''}:${extra.slice(0, 48)}`
}

/**
 * Reciprocal rank fusion — merge ranked lists from FTS, symbols, and vectors
 * without depending on incomparable raw scores.
 */
export function reciprocalRankFusion(
  lists: RankedRetrievalHit[][],
  k = 60
): Map<string, number> {
  const scores = new Map<string, number>()
  for (const list of lists) {
    list.forEach((item, index) => {
      const add = 1 / (k + index + 1)
      scores.set(item.id, (scores.get(item.id) ?? 0) + add)
    })
  }
  return scores
}

export function normalizeRetrievalScore(raw: number, maxRaw: number): number {
  if (maxRaw <= 0) return 0
  return Math.max(0, Math.min(1, raw / maxRaw))
}

export function rankChunks(chunks: ContextChunk[]): ContextChunk[] {
  return [...chunks].sort((a, b) => {
    const pri = CONTEXT_SOURCE_PRIORITY[a.source] - CONTEXT_SOURCE_PRIORITY[b.source]
    if (pri !== 0) return pri
    if (b.score !== a.score) return b.score - a.score
    return (a.path ?? a.title).localeCompare(b.path ?? b.title)
  })
}

export function dedupeChunks(chunks: ContextChunk[]): ContextChunk[] {
  const byKey = new Map<string, ContextChunk>()
  const exactContent = new Map<string, ContextChunk>()
  for (const chunk of chunks) {
    const key = `${chunk.source}:${chunk.path ?? chunk.id}:${chunk.startLine ?? 0}`
    const existing = byKey.get(key)
    if (!existing) {
      byKey.set(key, chunk)
      continue
    }
    const better =
      chunk.score > existing.score ||
      (chunk.score === existing.score && chunk.content.length > existing.content.length)
    if (better) byKey.set(key, chunk)
  }

  // The same file commonly arrives as current + pinned + open tab. Keep the
  // highest-ranked copy instead of paying for identical content more than once.
  for (const chunk of rankChunks([...byKey.values()])) {
    const normalized = chunk.content.trim().replace(/\r\n/g, '\n')
    const contentKey = `${chunk.path ?? ''}:${chunk.startLine ?? 0}:${normalized}`
    if (!exactContent.has(contentKey)) exactContent.set(contentKey, chunk)
  }
  return [...exactContent.values()]
}

const MAX_CHUNK_CHARS: Partial<Record<ContextSourceKind, number>> = {
  selection: 6_000,
  diagnostics: 4_000,
  current_file: 8_000,
  open_tab: 5_000,
  dependency: 4_000,
  symbol: 2_400,
  file: 3_200,
  vector: 2_400,
  git_diff: 6_000,
  attachment: 8_000,
  knowledge: 6_000,
  project_rules: 6_000,
  pinned: 6_000
}

export function applyTokenBudget(
  chunks: ContextChunk[],
  budgetTokens: number
): { kept: ContextChunk[]; dropped: number; compressed: boolean } {
  const ranked = rankChunks(chunks)
  const kept: ContextChunk[] = []
  let used = 0
  let compressed = false

  for (const chunk of ranked) {
    const cap = MAX_CHUNK_CHARS[chunk.source] ?? 4_000
    const squashed = compressText(chunk.content, cap)
    const next: ContextChunk = squashed.compressed ? { ...chunk, content: squashed.text } : chunk
    if (squashed.compressed) compressed = true
    const tokens = estimateTokens(next.content)
    if (tokens <= 0) continue
    if (used + tokens > budgetTokens) {
      const remainingChars = Math.max(0, (budgetTokens - used) * CHARS_PER_TOKEN)
      if (remainingChars < 120) continue
      const fit = compressText(next.content, remainingChars)
      kept.push({ ...next, content: fit.text })
      compressed = true
      break
    }
    kept.push(next)
    used += tokens
  }

  return { kept, dropped: Math.max(0, ranked.length - kept.length), compressed }
}

export function buildContextPrompt(chunks: ContextChunk[]): string {
  if (chunks.length === 0) return ''
  const body = chunks
    .map((chunk) => {
      const heading = SOURCE_HEADING[chunk.source]
      const loc = chunk.path
        ? chunk.startLine
          ? `${chunk.path}:${chunk.startLine}`
          : chunk.path
        : chunk.title
      return `### ${heading} — ${loc}\n${chunk.content.trim()}`
    })
    .join('\n\n')
  return [
    'Workspace context (ranked and budgeted — this is not the full repository).',
    'Prefer these excerpts. Ask to open a file if you need more.',
    '',
    body
  ].join('\n')
}

export function summarizeContextPack(
  chunks: ContextChunk[],
  model: string,
  trimmed: boolean,
  budgetTokens: number
): ContextPackSummary {
  const files = [
    ...new Set(chunks.map((chunk) => chunk.path).filter((path): path is string => Boolean(path)))
  ]
  const promptTokens = chunks.reduce((sum, chunk) => sum + estimateTokens(chunk.content), 0)
  const byKind = new Map<ContextSourceKind, { count: number; tokens: number }>()
  for (const chunk of chunks) {
    const current = byKind.get(chunk.source) ?? { count: 0, tokens: 0 }
    current.count += 1
    current.tokens += estimateTokens(chunk.content)
    byKind.set(chunk.source, current)
  }
  return {
    files,
    chunkCount: chunks.length,
    promptTokens,
    budgetTokens,
    estimatedCostUsd: estimateCostUsd(model, promptTokens, 0),
    trimmed,
    sources: [...byKind.entries()].map(([kind, usage]) => ({
      kind,
      count: usage.count,
      tokens: usage.tokens
    })),
    model
  }
}

export function assembleContextPack(
  chunks: ContextChunk[],
  budget: TokenBudget,
  model: string
): ContextEngineResult {
  const unique = dedupeChunks(chunks.filter((chunk) => chunk.content.trim()))
  const { kept, dropped, compressed } = applyTokenBudget(unique, budget.availableForContext)
  const formatted = buildContextPrompt(kept)
  return {
    formatted,
    chunks: kept,
    summary: summarizeContextPack(
      kept,
      model,
      dropped > 0 || compressed,
      budget.availableForContext
    )
  }
}
