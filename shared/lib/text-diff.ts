export type DiffOp = 'equal' | 'insert' | 'delete'

export interface DiffToken {
  type: DiffOp
  value: string
}

/** Guard against O(n*m) blowup on very large inputs. */
const MAX_DIFF_CELLS = 4_000_000

/** Longest-common-subsequence based diff for arbitrary comparable arrays. */
export function diffArrays<T>(
  a: T[],
  b: T[],
  isEqual: (x: T, y: T) => boolean = (x, y) => x === y,
  mergeAdjacentTokens = true
): DiffToken[] {
  const n = a.length
  const m = b.length

  if (n * m > MAX_DIFF_CELLS) {
    const tokens: DiffToken[] = []
    for (const item of a) tokens.push({ type: 'delete', value: String(item) })
    for (const item of b) tokens.push({ type: 'insert', value: String(item) })
    return tokens
  }

  const dp: Int32Array[] = new Array(n + 1)
  for (let i = 0; i <= n; i++) dp[i] = new Int32Array(m + 1)

  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = isEqual(a[i], b[j]) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }

  const result: DiffToken[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (isEqual(a[i], b[j])) {
      result.push({ type: 'equal', value: String(a[i]) })
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      result.push({ type: 'delete', value: String(a[i]) })
      i++
    } else {
      result.push({ type: 'insert', value: String(b[j]) })
      j++
    }
  }
  while (i < n) {
    result.push({ type: 'delete', value: String(a[i]) })
    i++
  }
  while (j < m) {
    result.push({ type: 'insert', value: String(b[j]) })
    j++
  }

  return mergeAdjacentTokens ? mergeAdjacent(result) : result
}

function mergeAdjacent(tokens: DiffToken[]): DiffToken[] {
  const merged: DiffToken[] = []
  for (const token of tokens) {
    const last = merged[merged.length - 1]
    if (last && last.type === token.type) {
      last.value += token.value
    } else {
      merged.push({ ...token })
    }
  }
  return merged
}

function tokenizeWords(text: string): string[] {
  return text.match(/\S+|\s+/g) ?? []
}

/** Word-level diff (including whitespace tokens) between two plain-text strings. */
export function diffWords(oldText: string, newText: string): DiffToken[] {
  return diffArrays(tokenizeWords(oldText), tokenizeWords(newText))
}

export interface DiffStats {
  wordsAdded: number
  wordsRemoved: number
  hasChanges: boolean
}

export function diffStats(tokens: DiffToken[]): DiffStats {
  let wordsAdded = 0
  let wordsRemoved = 0
  for (const token of tokens) {
    if (token.type === 'equal') continue
    const wordCount = (token.value.match(/\S+/g) ?? []).length
    if (token.type === 'insert') wordsAdded += wordCount
    else wordsRemoved += wordCount
  }
  return { wordsAdded, wordsRemoved, hasChanges: wordsAdded > 0 || wordsRemoved > 0 }
}
