import type { SeoAuditCategory, SeoAuditFinding, SeoAuditReport, SeoAuditSeverity } from '../types/seo-audit'

export interface SeoAuditSource {
  path: string
  relativePath: string
  content: string
}

const MARKUP_FILE = /\.(?:html?|jsx?|tsx?|vue|astro|svelte|mdx)$/i
const ROBOTS_FILE = /(?:^|\/)robots\.txt$/i
const CONFIG_FILE = /(?:^|\/)(?:next\.config\.[cm]?[jt]s|vite\.config\.[cm]?[jt]s|package\.json)$/i

function lineOf(content: string, index: number): number {
  return content.slice(0, Math.max(0, index)).split(/\r?\n/).length
}

function finding(
  source: SeoAuditSource,
  ruleId: string,
  category: SeoAuditCategory,
  severity: SeoAuditSeverity,
  title: string,
  message: string,
  recommendation: string,
  index = 0,
  confidence = 0.9
): SeoAuditFinding {
  return {
    id: `${ruleId}:${source.relativePath}:${lineOf(source.content, index)}`,
    ruleId,
    category,
    severity,
    title,
    message,
    recommendation,
    filePath: source.path,
    relativePath: source.relativePath,
    line: lineOf(source.content, index),
    confidence
  }
}

function analyzeRobots(source: SeoAuditSource): SeoAuditFinding[] {
  if (!ROBOTS_FILE.test(source.relativePath)) return []
  const results: SeoAuditFinding[] = []
  const blockedAll = /User-agent:\s*\*[\s\S]{0,180}?Disallow:\s*\/(?:\s|$)/i.exec(source.content)
  if (blockedAll) {
    results.push(finding(source, 'crawl.block-all', 'crawlability', 'critical', 'All crawlers are blocked', 'The wildcard crawler policy disallows the entire site.', 'Confirm this is not a production robots.txt policy, then allow public routes that should appear in search.', blockedAll.index))
  }
  const openAi = /User-agent:\s*OAI-SearchBot[\s\S]{0,180}?Disallow:\s*\/(?:\s|$)/i.exec(source.content)
  if (openAi) {
    results.push(finding(source, 'crawl.openai-search-blocked', 'crawlability', 'warning', 'ChatGPT search crawler is blocked', 'OAI-SearchBot cannot retrieve page content for summaries and citations.', 'Allow OAI-SearchBot on public content if ChatGPT search discovery is intended. Keep this decision separate from GPTBot training controls.', openAi.index))
  }
  return results
}

function analyzeMarkup(source: SeoAuditSource): SeoAuditFinding[] {
  if (!MARKUP_FILE.test(source.relativePath)) return []
  const content = source.content
  const results: SeoAuditFinding[] = []
  const pageLike = /<(?:html|head|main|article)\b|export\s+(?:const\s+metadata|default\s+function)|definePageMeta\s*\(/i.test(content)
  if (!pageLike) return results

  if (!/<title\b|title\s*[:=]/i.test(content)) {
    results.push(finding(source, 'metadata.title-missing', 'metadata', 'critical', 'Page title not detected', 'No static title or framework metadata title was found in this page-like file.', 'Add a unique, descriptive title through the framework metadata API or a title element.', 0, 0.78))
  }
  if (!/meta[^>]+name=["']description["']|description\s*[:=]/i.test(content)) {
    results.push(finding(source, 'metadata.description-missing', 'metadata', 'warning', 'Meta description not detected', 'No static description was found in this page-like file.', 'Add a concise page-specific description. Verify dynamic metadata in the rendered audit.', 0, 0.76))
  }
  if (!/<h1\b/i.test(content) && !/<Heading[^>]+(?:as|level)=["'{]*h?1/i.test(content)) {
    results.push(finding(source, 'content.h1-missing', 'content', 'warning', 'Primary heading not detected', 'The page has no detectable h1 heading.', 'Add one visible primary heading that clearly identifies the page topic.', 0, 0.72))
  }
  for (const match of content.matchAll(/<img\b[^>]*>/gi)) {
    if (!/\balt\s*=/.test(match[0])) {
      results.push(finding(source, 'content.image-alt-missing', 'content', 'warning', 'Image is missing alt text', 'An image element has no alt attribute.', 'Add meaningful alt text, or alt="" when the image is purely decorative.', match.index ?? 0))
    }
  }
  const jsonLd = /application\/ld\+json|JSON\.stringify\s*\(.*(?:schema|jsonLd)/is.test(content)
  if (!jsonLd) {
    results.push(finding(source, 'structured-data.not-detected', 'structured-data', 'recommendation', 'Structured data not detected', 'No JSON-LD was detected in this page-like source file.', 'Consider accurate JSON-LD when the page represents an eligible organization, article, product, event, or other entity. Do not add schema solely for AI search.', 0, 0.64))
  }
  const factualNumber = /\b\d+(?:\.\d+)?%|\b\d{4}\s+(?:users|customers|studies|respondents|transactions)\b/i.exec(content)
  if (factualNumber && !/(?:source|according to|methodology|href=|citation|reference)/i.test(content)) {
    results.push(finding(source, 'citation.unsourced-statistic', 'citation', 'warning', 'Potentially unsupported numeric claim', 'A quantitative claim was detected without a nearby or page-level source signal.', 'Link to the primary source and include the measurement date, sample, and methodology where relevant.', factualNumber.index, 0.66))
  }
  const longParagraph = /<(?:p|div)\b[^>]*>[^<]{700,}<\/(?:p|div)>/i.exec(content)
  if (longParagraph) {
    results.push(finding(source, 'citation.long-answer-block', 'citation', 'recommendation', 'Dense answer block may be difficult to retrieve', 'A long unstructured text block was detected.', 'Use descriptive headings, short paragraphs, lists, or a semantic table while preserving complete, people-first content.', longParagraph.index, 0.7))
  }
  return results
}

function analyzeCodeQuality(source: SeoAuditSource): SeoAuditFinding[] {
  if (!MARKUP_FILE.test(source.relativePath) && !CONFIG_FILE.test(source.relativePath)) return []
  const results: SeoAuditFinding[] = []
  const consoleCall = /console\.(?:log|debug)\s*\(/.exec(source.content)
  if (consoleCall) results.push(finding(source, 'quality.console-call', 'code-quality', 'recommendation', 'Debug console call in web source', 'Debug logging can leak data and add production noise.', 'Remove it or route it through the project logger with environment-aware levels.', consoleCall.index, 0.96))
  const dangerousHtml = /dangerouslySetInnerHTML\s*=/.exec(source.content)
  if (dangerousHtml) results.push(finding(source, 'quality.unsafe-html', 'code-quality', 'warning', 'Raw HTML injection requires review', 'Raw HTML can introduce security, rendering, and content-consistency problems.', 'Sanitize trusted content and verify that crawlers receive the same meaningful text as users.', dangerousHtml.index, 0.94))
  return results
}

function score(findings: SeoAuditFinding[], categories: SeoAuditCategory[]): number {
  const weights = { critical: 18, warning: 8, recommendation: 3 } as const
  const penalty = findings.filter((item) => categories.includes(item.category)).reduce((sum, item) => sum + weights[item.severity] * item.confidence, 0)
  return Math.max(0, Math.round(100 - Math.min(100, penalty)))
}

export function auditSeoSources(rootPath: string, sources: SeoAuditSource[]): SeoAuditReport {
  const findings = sources.flatMap((source) => [...analyzeRobots(source), ...analyzeMarkup(source), ...analyzeCodeQuality(source)])
  return {
    rootPath,
    generatedAt: new Date().toISOString(),
    scannedFiles: sources.length,
    scores: {
      discoverability: score(findings, ['crawlability', 'metadata']),
      machineUnderstanding: score(findings, ['metadata', 'content', 'structured-data']),
      citationReadiness: score(findings, ['citation', 'content']),
      codeQuality: score(findings, ['code-quality'])
    },
    findings: findings.sort(
      (a, b) =>
        ({ critical: 0, warning: 1, recommendation: 2 })[a.severity] -
        ({ critical: 0, warning: 1, recommendation: 2 })[b.severity]
    )
  }
}
