export interface FuzzyResult<T> {
  item: T
  score: number
  /** Indexes in the haystack that matched, for highlighting. */
  matches: number[]
}

/**
 * Subsequence matcher in the style of VS Code's quick open: characters must appear
 * in order, with bonuses for consecutive runs and matches at word boundaries.
 */
export function fuzzyMatch(needle: string, haystack: string): { score: number; matches: number[] } | null {
  if (!needle) return { score: 0, matches: [] }
  const lowerNeedle = needle.toLowerCase()
  const lowerHaystack = haystack.toLowerCase()

  const matches: number[] = []
  let score = 0
  let haystackIndex = 0
  let previousMatch = -2

  for (let i = 0; i < lowerNeedle.length; i += 1) {
    const char = lowerNeedle[i]
    if (char === ' ') continue
    const found = lowerHaystack.indexOf(char, haystackIndex)
    if (found === -1) return null

    if (found === previousMatch + 1) score += 8
    const previousChar = found > 0 ? haystack[found - 1] : ''
    if (found === 0) score += 10
    else if (/[\\/_\-. ]/.test(previousChar)) score += 6
    else if (previousChar === previousChar.toLowerCase() && haystack[found] !== haystack[found].toLowerCase()) {
      score += 4
    }
    if (haystack[found] === needle[i]) score += 1

    matches.push(found)
    previousMatch = found
    haystackIndex = found + 1
  }

  // Shorter, earlier matches win when the character bonuses tie.
  score -= Math.floor(matches[0] / 4)
  score -= Math.floor(haystack.length / 40)
  return { score, matches }
}

export function fuzzyFilter<T>(
  query: string,
  items: T[],
  keyOf: (item: T) => string,
  limit = 200
): Array<FuzzyResult<T>> {
  if (!query.trim()) {
    return items.slice(0, limit).map((item) => ({ item, score: 0, matches: [] }))
  }
  const results: Array<FuzzyResult<T>> = []
  for (const item of items) {
    const match = fuzzyMatch(query.trim(), keyOf(item))
    if (match) results.push({ item, score: match.score, matches: match.matches })
  }
  results.sort((a, b) => b.score - a.score)
  return results.slice(0, limit)
}
