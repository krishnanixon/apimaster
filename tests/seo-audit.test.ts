import { describe, expect, it } from 'vitest'
import { auditSeoSources } from '../shared/lib/seo-audit'

describe('SEO and LLM-search source audit', () => {
  it('reports blocked search crawlers separately from general crawling', () => {
    const report = auditSeoSources('/project', [
      {
        path: '/project/public/robots.txt',
        relativePath: 'public/robots.txt',
        content: 'User-agent: OAI-SearchBot\nDisallow: /\n'
      }
    ])

    expect(report.findings.map((item) => item.ruleId)).toContain('crawl.openai-search-blocked')
    expect(report.findings.map((item) => item.ruleId)).not.toContain('crawl.block-all')
    expect(report.scores.discoverability).toBeLessThan(100)
  })

  it('finds metadata, content, citation, safety, and image issues with line locations', () => {
    const content = `export default function Page() {
  console.log('debug')
  return <main>
    <p>We improved conversions by 38%.</p>
    <img src="/proof.png" />
    <section dangerouslySetInnerHTML={{ __html: body }} />
  </main>
}`
    const report = auditSeoSources('/project', [
      { path: '/project/app/page.tsx', relativePath: 'app/page.tsx', content }
    ])
    const rules = report.findings.map((item) => item.ruleId)

    expect(rules).toEqual(expect.arrayContaining([
      'metadata.title-missing',
      'metadata.description-missing',
      'content.h1-missing',
      'content.image-alt-missing',
      'citation.unsourced-statistic',
      'quality.console-call',
      'quality.unsafe-html'
    ]))
    expect(report.findings.find((item) => item.ruleId === 'content.image-alt-missing')?.line).toBe(5)
  })

  it('does not treat ordinary utility source as a web page', () => {
    const report = auditSeoSources('/project', [
      {
        path: '/project/src/math.ts',
        relativePath: 'src/math.ts',
        content: 'export const sum = (a: number, b: number) => a + b'
      }
    ])

    expect(report.findings).toEqual([])
    expect(report.scores).toEqual({
      discoverability: 100,
      machineUnderstanding: 100,
      citationReadiness: 100,
      codeQuality: 100
    })
  })

  it('flags a full-site robots disallow', () => {
    const report = auditSeoSources('/project', [
      {
        path: '/project/public/robots.txt',
        relativePath: 'public/robots.txt',
        content: 'User-agent: *\nDisallow: /\n'
      }
    ])
    expect(report.findings.map((item) => item.ruleId)).toContain('crawl.block-all')
  })
})

