import { readFileSync, realpathSync } from 'fs'
import { resolve, sep } from 'path'
import type {
  CodeScanEnrichEstimate,
  CodeScanEnrichInput,
  CodeScanEnrichProgress,
  CodeScanEnrichResult,
  DetectedEndpoint
} from '@shared/types/code-scanner'
import {
  applyEnrichment,
  buildEndpointContext,
  buildEnrichMessages,
  canEnrich,
  ENRICH_BATCH_SIZE,
  ENRICH_OUTPUT_TOKENS_PER_ENDPOINT,
  estimateEnrichTokens,
  parseEnrichResponse,
  type EndpointContext
} from '@shared/lib/code-scanner/enrich'
import { fallbackProviderId, isCloudProviderId, normalizeCloudProvider, resolveProviderModel, selectProviderId } from '@shared/lib/ai-routing'
import { shouldAddFallback } from '@shared/lib/ai-credit-guard'
import type { AIProviderId } from '@shared/types'
import { aiManager, aiRouter } from '../ai'
import { CreditBudgetError } from '../ai/credit-guard'
import { logger } from '../infra/logger.service'

const MAX_FILE_BYTES = 1024 * 1024

/** Reads project files for snippets, never outside the scanned folder (symlinks included). */
export function lineReader(root: string): (file: string) => string[] | null {
  const cache = new Map<string, string[] | null>()
  let realRoot: string
  try {
    realRoot = realpathSync(root)
  } catch {
    realRoot = root
  }
  return (file) => {
    if (cache.has(file)) return cache.get(file)!
    let lines: string[] | null = null
    try {
      const real = realpathSync(resolve(root, file))
      if (real.startsWith(realRoot + sep)) {
        const text = readFileSync(real, 'utf8')
        lines = text.length <= MAX_FILE_BYTES ? text.split('\n') : null
      }
    } catch {
      lines = null
    }
    cache.set(file, lines)
    return lines
  }
}

class CodeScannerAiService {
  private readonly running = new Map<string, AbortController>()

  private contexts(root: string, endpoints: DetectedEndpoint[]): Array<{ endpoint: DetectedEndpoint; context: EndpointContext }> {
    const read = lineReader(root)
    return endpoints.filter(canEnrich).map((endpoint, i) => ({ endpoint, context: buildEndpointContext(endpoint, `e${i}`, read) }))
  }

  /**
   * Which providers the run will use. Mirrors `aiRouter.chat`: the provider depends on the request
   * type and prompt size (hybrid mode sends large prompts to the cloud), plus the optional fallback.
   * The consent dialog must name every provider that could receive the code.
   */
  async estimate(root: string, endpoints: DetectedEndpoint[]): Promise<CodeScanEnrichEstimate> {
    const items = this.contexts(root, endpoints)
    const config = aiManager.getConfig()
    const status = await aiManager.getStatus()
    const statusOf = (id: AIProviderId) => status.providers.find((p) => p.id === id)

    const primaries = new Set<AIProviderId>()
    const fallbacks = new Set<AIProviderId>()
    for (let i = 0; i < items.length; i += ENRICH_BATCH_SIZE) {
      const batch = items.slice(i, i + ENRICH_BATCH_SIZE).map((item) => item.context)
      const chars = buildEnrichMessages(batch).reduce((n, m) => n + m.content.length, 0)
      const primary = selectProviderId(config, 'API_GENERATION', chars)
      primaries.add(primary)
      const secondary = fallbackProviderId(primary, normalizeCloudProvider(config.cloudProvider))
      if (shouldAddFallback(config, primary) && secondary !== primary && statusOf(secondary)?.configured) fallbacks.add(secondary)
    }
    for (const id of primaries) fallbacks.delete(id)

    const label = (ids: Set<AIProviderId>) => [...ids].map((id) => statusOf(id)?.label ?? id).join(' + ') || null
    const [first] = primaries
    const missing = [...primaries].find((id) => !statusOf(id)?.configured)
    const offline = [...primaries].find((id) => statusOf(id)?.configured && !statusOf(id)?.online)
    return {
      endpoints: items.length,
      batches: Math.ceil(items.length / ENRICH_BATCH_SIZE),
      approxTokens: estimateEnrichTokens(items.map((i) => i.context)),
      provider: label(primaries),
      model: first ? resolveProviderModel(config, first) : null,
      fallbackProvider: label(fallbacks),
      cloud: [...primaries, ...fallbacks].some((id) => isCloudProviderId(id)),
      ready: items.length > 0 && !missing && !offline,
      reason: items.length === 0
        ? 'Nothing to enrich in the selection.'
        : missing
          ? `${statusOf(missing)?.label ?? missing} is not configured. Set it up in Settings → AI.`
          : offline
            ? `${statusOf(offline)?.label ?? offline} is not reachable right now.`
            : undefined
    }
  }

  cancel(enrichId: string): void {
    this.running.get(enrichId)?.abort()
  }

  async enrich(
    root: string,
    input: CodeScanEnrichInput,
    onProgress: (progress: CodeScanEnrichProgress) => void
  ): Promise<CodeScanEnrichResult> {
    const controller = new AbortController()
    this.running.set(input.enrichId, controller)
    const items = this.contexts(root, input.endpoints)
    const updated = new Map<string, DetectedEndpoint>()
    const total = Math.ceil(items.length / ENRICH_BATCH_SIZE)
    let failedBatches = 0
    let tokens = 0
    let model: string | null = null
    let error: string | undefined

    try {
      for (let b = 0; b < total; b++) {
        if (controller.signal.aborted) {
          error = 'Cancelled'
          break
        }
        onProgress({ enrichId: input.enrichId, done: b, total })
        const batch = items.slice(b * ENRICH_BATCH_SIZE, (b + 1) * ENRICH_BATCH_SIZE)
        try {
          const result = await aiRouter.chat(buildEnrichMessages(batch.map((i) => i.context)), {
            temperature: 0.2,
            maxTokens: batch.length * ENRICH_OUTPUT_TOKENS_PER_ENDPOINT + 200,
            json: true,
            signal: controller.signal,
            requestType: 'API_GENERATION',
            meta: { feature: 'code-scanner-enrich' }
          })
          tokens += result.totalTokens ?? 0
          model = result.model
          const answers = new Map(parseEnrichResponse(result.text).map((a) => [a.id, a]))
          if (answers.size === 0) failedBatches++
          for (const { endpoint, context } of batch) {
            const answer = answers.get(context.key)
            if (!answer) continue
            const groundText = [
              ...context.snippets.map((s) => s.code),
              JSON.stringify(context.body ?? null),
              ...context.query,
              ...context.headers
            ].join('\n')
            const next = applyEnrichment(endpoint, answer, groundText)
            if (next !== endpoint) updated.set(endpoint.id, next)
          }
        } catch (e) {
          if (e instanceof CreditBudgetError) {
            error = e.message
            break
          }
          if (controller.signal.aborted) {
            error = 'Cancelled'
            break
          }
          failedBatches++
          logger.warn(`Code scanner enrichment batch failed: ${e instanceof Error ? e.message : String(e)}`, 'CodeScanner')
        }
      }
      onProgress({ enrichId: input.enrichId, done: total, total })
    } finally {
      this.running.delete(input.enrichId)
    }

    logger.info(`Enriched ${updated.size} of ${items.length} endpoints (${tokens} tokens)`, 'CodeScanner')
    return { endpoints: [...updated.values()], enriched: updated.size, failedBatches, tokens, model, error }
  }
}

export const codeScannerAiService = new CodeScannerAiService()
