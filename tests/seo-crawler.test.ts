import { afterEach, describe, expect, it } from 'vitest'
import { createServer, type Server } from 'node:http'
import { assertSafeSeoCrawlUrl } from '../shared/lib/seo-crawl-url'
import { seoCrawlerService } from '../electron/main/seo/seo-crawler.service'

let server: Server | undefined
afterEach(() => new Promise<void>((resolve) => server?.close(() => resolve()) ?? resolve()))

describe('SEO crawl URL safety', () => {
  it('allows normal http(s) targets used for local audits', () => {
    expect(assertSafeSeoCrawlUrl('http://127.0.0.1:3000').hostname).toBe('127.0.0.1')
    expect(assertSafeSeoCrawlUrl('https://example.com/path').hostname).toBe('example.com')
  })

  it('rejects credentials and cloud metadata endpoints', () => {
    expect(() => assertSafeSeoCrawlUrl('http://user:pass@example.com')).toThrow(/credentials/i)
    expect(() => assertSafeSeoCrawlUrl('http://169.254.169.254/latest')).toThrow(/metadata/i)
    expect(() => assertSafeSeoCrawlUrl('file:///tmp/index.html')).toThrow(/HTTP/i)
  })
})

describe('SEO live crawler', () => {
  it('discovers same-origin pages, crawler policy, metadata, and broken links', async () => {
    server = createServer((request, response) => {
      if (request.url === '/robots.txt') return void response.end('User-agent: OAI-SearchBot\nDisallow: /\n')
      if (request.url === '/missing') { response.statusCode = 404; return void response.end('missing') }
      response.setHeader('content-type', 'text/html')
      if (request.url === '/next') return void response.end('<title>Next</title><h1>Next</h1>')
      response.end('<title>Home</title><meta name="description" content="Welcome"><h1>Home</h1><a href="/next">Next</a><a href="/missing">Missing</a><a href="https://example.com">External</a>')
    })
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Test server did not start')

    const report = await seoCrawlerService.crawl({ startUrl: `http://127.0.0.1:${address.port}`, maxPages: 5 })

    expect(report.policy.openAiSearchAllowed).toBe(false)
    expect(report.policy.googleAllowed).toBe(true)
    expect(report.pages).toHaveLength(3)
    expect(report.pages[0]).toMatchObject({ title: 'Home', description: 'Welcome', h1Count: 1, internalLinks: 2, externalLinks: 1 })
    expect(report.brokenLinks[0]).toMatchObject({ status: 404 })
  })
})
