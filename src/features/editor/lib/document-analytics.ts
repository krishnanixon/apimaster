/**
 * Lightweight, fully client-side document analytics for the editor status bar
 * and right-sidebar quality panel.
 *
 * These are heuristic scores — they give writers fast, deterministic feedback
 * without an AI round-trip. A future phase can replace/augment them with a
 * real AI analysis service (see roadmap). Keeping them pure and synchronous
 * means they can run on every keystroke without jank.
 */

export interface DocumentAnalytics {
  wordCount: number
  charCount: number
  charCountNoSpaces: number
  sentenceCount: number
  paragraphCount: number
  headingCount: number
  sectionCount: number
  readingTimeMin: number
  requirementCount: number
  requirementIds: string[]
  grammarScore: number
  requirementScore: number
  aiScore: number
}

const REQUIREMENT_ID_PATTERN = /\b(?:REQ|FR|NFR|UC|API|BR|TC|RISK|DB)-\d{1,4}\b/gi

function clamp(value: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, Math.round(value)))
}

function htmlToText(html: string): string {
  // Replace block boundaries with spaces so words don't run together.
  return html
    .replace(/<\/(p|div|li|h[1-6]|tr|br)>/gi, ' ')
    .replace(/<br\s*\/?>(?=)/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

export function analyzeDocument(html: string): DocumentAnalytics {
  const text = htmlToText(html)
  const words = text ? text.split(/\s+/).filter(Boolean) : []
  const wordCount = words.length
  const charCount = text.length
  const charCountNoSpaces = text.replace(/\s/g, '').length

  const sentences = text.split(/[.!?]+(?:\s|$)/).filter((s) => s.trim().length > 0)
  const sentenceCount = sentences.length

  const headingMatches = html.match(/<h[1-3][\s>]/gi) ?? []
  const headingCount = headingMatches.length
  const sectionCount = (html.match(/<h2[\s>]/gi) ?? []).length
  const paragraphCount = (html.match(/<p[\s>]/gi) ?? []).length

  const idMatches = text.match(REQUIREMENT_ID_PATTERN) ?? []
  const requirementIds = Array.from(new Set(idMatches.map((id) => id.toUpperCase())))

  // "shall" / "must" style normative statements are strong requirement signals.
  const normativeCount = (text.match(/\b(shall|must|should|will)\b/gi) ?? []).length
  const listItemCount = (html.match(/<li[\s>]/gi) ?? []).length
  const requirementCount = Math.max(requirementIds.length, normativeCount, 0)

  const readingTimeMin = Math.max(1, Math.ceil(wordCount / 200))

  // --- Grammar score: readability heuristic ---------------------------------
  // Penalize very long average sentences and reward reasonable length docs.
  const avgWordsPerSentence = sentenceCount > 0 ? wordCount / sentenceCount : wordCount
  let grammarScore = 100
  if (avgWordsPerSentence > 25) grammarScore -= (avgWordsPerSentence - 25) * 1.5
  if (avgWordsPerSentence > 0 && avgWordsPerSentence < 5 && wordCount > 40) grammarScore -= 6
  // Double spaces / trailing artifacts are minor issues.
  const doubleSpaces = (html.replace(/<[^>]+>/g, '').match(/ {2,}/g) ?? []).length
  grammarScore -= Math.min(10, doubleSpaces)
  grammarScore = clamp(grammarScore, 40)

  // --- Requirement score: completeness heuristic ----------------------------
  const lower = text.toLowerCase()
  const hasAcceptance = /acceptance criteria|given\s+when\s+then|given .* when .* then/.test(lower)
  const hasActors = /\b(user|admin|system|actor|stakeholder|customer)\b/.test(lower)
  const hasBusinessRules = /business rule|constraint|policy/.test(lower)
  const hasNonFunctional = /performance|security|scalab|availab|usabilit|reliab/.test(lower)

  let requirementScore = 0
  requirementScore += headingCount > 0 ? 20 : 0
  requirementScore += sectionCount >= 3 ? 15 : sectionCount > 0 ? 8 : 0
  requirementScore += requirementCount >= 5 ? 20 : requirementCount > 0 ? 10 : 0
  requirementScore += hasAcceptance ? 15 : 0
  requirementScore += hasActors ? 10 : 0
  requirementScore += hasBusinessRules ? 10 : 0
  requirementScore += hasNonFunctional ? 10 : 0
  if (wordCount < 80) requirementScore = Math.min(requirementScore, 35)
  requirementScore = clamp(requirementScore)

  // --- Composite AI score ---------------------------------------------------
  const structureScore = clamp(
    (headingCount > 0 ? 40 : 0) +
      (listItemCount > 0 ? 20 : 0) +
      (wordCount > 150 ? 40 : (wordCount / 150) * 40)
  )
  const aiScore = clamp(requirementScore * 0.45 + grammarScore * 0.25 + structureScore * 0.3)

  return {
    wordCount,
    charCount,
    charCountNoSpaces,
    sentenceCount,
    paragraphCount,
    headingCount,
    sectionCount,
    readingTimeMin,
    requirementCount,
    requirementIds,
    grammarScore,
    requirementScore,
    aiScore
  }
}

export function scoreTone(score: number): 'good' | 'warn' | 'bad' {
  if (score >= 80) return 'good'
  if (score >= 55) return 'warn'
  return 'bad'
}
