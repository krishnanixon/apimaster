import { assertSafeSeoCrawlUrl } from '@shared/lib/seo-crawl-url'
import type { SeoCrawlOptions, SeoCrawlPage, SeoCrawlReport, SeoCrawlerPolicy } from '@shared/types/seo-audit'

const DEFAULT_MAX_PAGES = 100
const MAX_PAGES = 500
const TIMEOUT_MS = 15_000

function textMatch(html: string, pattern: RegExp): string | undefined {
  const value = pattern.exec(html)?.[1]?.replace(/\s+/g, ' ').trim()
  return value || undefined
}

function allowsAgent(robots: string, agent: string): boolean {
  const groups = robots.split(/(?=^\s*User-agent\s*:)/gim)
  const relevant = groups.filter((group) => {
    const names = [...group.matchAll(/^\s*User-agent\s*:\s*([^\s#]+)/gim)].map((match) => match[1].toLowerCase())
    return names.includes(agent.toLowerCase()) || names.includes('*')
  })
  return !relevant.some((group) => /^\s*Disallow\s*:\s*\/\s*(?:#.*)?$/im.test(group))
}

function linksFrom(html: string, base: URL): URL[] {
  const links: URL[] = []
  for (const match of html.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"'#]+)["'][^>]*>/gi)) {
    try {
      const url = new URL(match[1], base)
      if (url.protocol === 'http:' || url.protocol === 'https:') {
        url.hash = ''
        links.push(url)
      }
    } catch {
      // Invalid and non-web links are not crawl targets.
    }
  }
  return links
}

async function fetchWithTimeout(url: string): Promise<Response> {
  return fetch(url, {
    redirect: 'manual',
    headers: { 'user-agent': 'AIWorkbench-SearchIntelligence/1.0' },
    signal: AbortSignal.timeout(TIMEOUT_MS)
  })
}

class SeoCrawlerService {
  async crawl(options: SeoCrawlOptions): Promise<SeoCrawlReport> {
    const start = Date.now()
    const root = assertSafeSeoCrawlUrl(options.startUrl)
    root.hash = ''
    const maxPages = Math.max(1, Math.min(MAX_PAGES, Math.floor(options.maxPages ?? DEFAULT_MAX_PAGES)))
    const robotsUrl = new URL('/robots.txt', root.origin).toString()
    let robots = ''
    let robotsReachable = false
    try {
      const response = await fetchWithTimeout(robotsUrl)
      robotsReachable = response.ok
      if (response.ok) robots = (await response.text()).slice(0, 256_000)
    } catch {
      // A missing robots file is reported but does not stop the crawl.
    }
    const policy: SeoCrawlerPolicy = {
      robotsUrl,
      reachable: robotsReachable,
      googleAllowed: allowsAgent(robots, 'Googlebot'),
      openAiSearchAllowed: allowsAgent(robots, 'OAI-SearchBot'),
      bingAllowed: allowsAgent(robots, 'Bingbot'),
      raw: robots || undefined
    }
    const queue = [root.toString()]
    const queued = new Set(queue)
    const pages: SeoCrawlPage[] = []
    const discoveredBy = new Map<string, string>()
    const statuses = new Map<string, number>()

    while (queue.length > 0 && pages.length < maxPages) {
      const url = queue.shift()!
      const began = Date.now()
      try {
        const response = await fetchWithTimeout(url)
        statuses.set(url, response.status)
        const contentType = response.headers.get('content-type') ?? ''
        const redirectUrl = response.status >= 300 && response.status < 400
          ? new URL(response.headers.get('location') ?? '', url).toString()
          : undefined
        const html = contentType.includes('text/html') ? (await response.text()).slice(0, 2_000_000) : ''
        const base = new URL(url)
        const links = html ? linksFrom(html, base) : []
        for (const link of links) {
          if (link.origin !== root.origin || queued.has(link.toString())) continue
          queued.add(link.toString())
          discoveredBy.set(link.toString(), url)
          if (queue.length + pages.length < maxPages * 4) queue.push(link.toString())
        }
        pages.push({
          url,
          status: response.status,
          contentType,
          title: textMatch(html, /<title\b[^>]*>([\s\S]*?)<\/title>/i),
          description: textMatch(html, /<meta\b[^>]*name=["']description["'][^>]*content=["']([^"']*)/i),
          canonical: textMatch(html, /<link\b[^>]*rel=["']canonical["'][^>]*href=["']([^"']*)/i),
          robots: textMatch(html, /<meta\b[^>]*name=["']robots["'][^>]*content=["']([^"']*)/i),
          h1Count: (html.match(/<h1\b/gi) ?? []).length,
          internalLinks: links.filter((link) => link.origin === root.origin).length,
          externalLinks: links.filter((link) => link.origin !== root.origin).length,
          responseMs: Date.now() - began,
          redirectUrl
        })
      } catch (error) {
        pages.push({ url, status: 0, contentType: '', h1Count: 0, internalLinks: 0, externalLinks: 0, responseMs: Date.now() - began, error: error instanceof Error ? error.message : 'Request failed' })
      }
    }
    const brokenLinks = pages.filter((page) => page.status === 0 || page.status >= 400).map((page) => ({ sourceUrl: discoveredBy.get(page.url) ?? root.toString(), targetUrl: page.url, status: page.status }))
    return { startUrl: root.toString(), origin: root.origin, generatedAt: new Date().toISOString(), durationMs: Date.now() - start, policy, pages, brokenLinks }
  }
}

export const seoCrawlerService = new SeoCrawlerService()
