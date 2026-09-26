export type SeoAuditCategory =
  | 'crawlability'
  | 'metadata'
  | 'content'
  | 'structured-data'
  | 'citation'
  | 'code-quality'

export type SeoAuditSeverity = 'critical' | 'warning' | 'recommendation'

export interface SeoAuditFinding {
  id: string
  ruleId: string
  category: SeoAuditCategory
  severity: SeoAuditSeverity
  title: string
  message: string
  recommendation: string
  filePath: string
  relativePath: string
  line: number
  confidence: number
}

export interface SeoAuditScore {
  discoverability: number
  machineUnderstanding: number
  citationReadiness: number
  codeQuality: number
}

export interface SeoAuditReport {
  rootPath: string
  generatedAt: string
  scannedFiles: number
  scores: SeoAuditScore
  findings: SeoAuditFinding[]
}

export interface SeoCrawlOptions {
  startUrl: string
  maxPages?: number
}

export interface SeoCrawlPage {
  url: string
  status: number
  contentType: string
  title?: string
  description?: string
  canonical?: string
  robots?: string
  h1Count: number
  internalLinks: number
  externalLinks: number
  responseMs: number
  redirectUrl?: string
  error?: string
}

export interface SeoCrawlerPolicy {
  robotsUrl: string
  reachable: boolean
  googleAllowed: boolean
  openAiSearchAllowed: boolean
  bingAllowed: boolean
  raw?: string
}

export interface SeoCrawlReport {
  startUrl: string
  origin: string
  generatedAt: string
  durationMs: number
  policy: SeoCrawlerPolicy
  pages: SeoCrawlPage[]
  brokenLinks: Array<{ sourceUrl: string; targetUrl: string; status: number }>
}
