export interface QualityIssue {
  id: string
  label: string
  count: number
  hint: string
}

const PLACEHOLDER_PATTERN = /\b(TBD|TODO|FIXME|WIP)\b|\[[^\]]{2,80}\]|_{3,}/gi

export function countPlaceholders(html: string): number {
  const text = html.replace(/<[^>]+>/g, ' ')
  return (text.match(PLACEHOLDER_PATTERN) ?? []).length
}

export function analyzeDocumentQuality(html: string): QualityIssue[] {
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  const placeholderCount = countPlaceholders(html)
  const emptyHeadings = (html.match(/<h[1-3][^>]*>\s*(?:&nbsp;)?\s*<\/h[1-3]>/gi) ?? []).length
  const emptySections = (html.match(/<h2[^>]*>[\s\S]*?<\/h2>\s*(?:<p>(?:\s|&nbsp;)*<\/p>\s*)?(?=<h2|<\/)/gi) ?? []).length
  const hasAcceptance = /acceptance criteria|given\s+when\s+then/i.test(text)
  const reqIds = text.match(/\b(?:REQ|FR|NFR|US|UC|API|BR|TC|RISK|DB)-\d{1,4}\b/gi) ?? []
  const unchecked = (html.match(/data-checked="false"/gi) ?? []).length
  const wordCount = text ? text.split(/\s+/).filter(Boolean).length : 0

  const issues: QualityIssue[] = []
  if (placeholderCount > 0) {
    issues.push({
      id: 'placeholders',
      label: 'Placeholders left',
      count: placeholderCount,
      hint: 'Jump to TBD / [brackets] and replace them'
    })
  }
  if (emptyHeadings > 0) {
    issues.push({
      id: 'empty-headings',
      label: 'Empty headings',
      count: emptyHeadings,
      hint: 'Give every heading a title'
    })
  }
  if (emptySections > 0) {
    issues.push({
      id: 'empty-sections',
      label: 'Thin sections',
      count: emptySections,
      hint: 'Add content under empty H2s'
    })
  }
  if (!hasAcceptance && wordCount > 80) {
    issues.push({
      id: 'acceptance',
      label: 'No acceptance criteria',
      count: 1,
      hint: 'Insert Given / When / Then blocks'
    })
  }
  if (reqIds.length === 0 && wordCount > 80) {
    issues.push({
      id: 'ids',
      label: 'No requirement IDs',
      count: 1,
      hint: 'Insert REQ blocks so items are traceable'
    })
  }
  if (unchecked > 0) {
    issues.push({
      id: 'open-questions',
      label: 'Open checklist items',
      count: unchecked,
      hint: 'Resolve or assign open questions'
    })
  }
  if (wordCount > 0 && wordCount < 80) {
    issues.push({
      id: 'short',
      label: 'Very short draft',
      count: wordCount,
      hint: 'Expand with template sections or AI'
    })
  }
  return issues
}
