/**
 * Minimal parser for Bruno's `.bru` files: top-level `name { … }` blocks holding either
 * `key: value` lines (meta, get, headers, params:query, auth:*, vars…), raw text indented by
 * two spaces (body:json, script:*, tests, docs…), or `name [ … ]` lists (vars:secret).
 */

export interface BruPair {
  key: string
  value: string
  enabled: boolean
}

export type BruBlock =
  | { kind: 'dict'; name: string; pairs: BruPair[] }
  | { kind: 'text'; name: string; text: string }
  | { kind: 'list'; name: string; items: string[] }

export interface BruFile {
  blocks: BruBlock[]
  /** First dict block with this name, as a `key → value` map of enabled pairs. */
  dict(name: string): Record<string, string> | undefined
  pairs(name: string): BruPair[]
  text(name: string): string | undefined
  list(name: string): string[]
  has(name: string): boolean
}

const HTTP_BLOCKS = ['get', 'post', 'put', 'delete', 'patch', 'options', 'head', 'connect', 'trace']

const DICT_BLOCKS = new Set([
  'meta',
  ...HTTP_BLOCKS,
  'http',
  'headers',
  'query',
  'params:query',
  'params:path',
  'body:form-urlencoded',
  'body:multipart-form',
  'body:file',
  'vars',
  'vars:pre-request',
  'vars:post-response',
  'assert',
  'settings'
])

function isDictBlock(name: string): boolean {
  return DICT_BLOCKS.has(name) || name.startsWith('auth:') || name === 'auth'
}

function unquote(value: string): string {
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    try {
      return JSON.parse(value) as string
    } catch {
      return value.slice(1, -1)
    }
  }
  return value
}

/** Splits `~"Content-Type": application/json` into its parts. */
function parsePair(line: string): BruPair | null {
  let rest = line.trim()
  if (!rest) return null
  let enabled = true
  if (rest.startsWith('~')) {
    enabled = false
    rest = rest.slice(1)
  }
  let key: string
  let value: string
  if (rest.startsWith('"')) {
    const end = rest.indexOf('"', 1)
    const colon = end === -1 ? -1 : rest.indexOf(':', end)
    if (colon === -1) return null
    key = unquote(rest.slice(0, end + 1))
    value = rest.slice(colon + 1)
  } else {
    const colon = rest.indexOf(':')
    if (colon === -1) return { key: rest, value: '', enabled }
    key = rest.slice(0, colon)
    value = rest.slice(colon + 1)
  }
  return { key: key.trim(), value: value.trim(), enabled }
}

function dedent(lines: string[]): string {
  // Bruno writes text blocks indented by two spaces.
  return lines.map((line) => (line.startsWith('  ') ? line.slice(2) : line.replace(/^\t/, ''))).join('\n').replace(/\s+$/, '')
}

export function parseBru(source: string): BruFile {
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  const blocks: BruBlock[] = []
  let i = 0
  while (i < lines.length) {
    const header = lines[i].match(/^([\w:.-]+)\s*([{[])\s*$/)
    if (!header) {
      i++
      continue
    }
    const [, name, open] = header
    i++
    if (open === '[') {
      const items: string[] = []
      while (i < lines.length && lines[i].trim() !== ']') {
        const item = lines[i].trim().replace(/,$/, '').trim()
        if (item) items.push(item.replace(/^~/, ''))
        i++
      }
      blocks.push({ kind: 'list', name, items })
      i++
      continue
    }
    if (isDictBlock(name)) {
      const pairs: BruPair[] = []
      while (i < lines.length && lines[i].trim() !== '}') {
        const pair = parsePair(lines[i])
        i++
        if (!pair) continue
        // Multi-line values: key: ''' … '''
        if (pair.value === "'''") {
          const body: string[] = []
          while (i < lines.length && lines[i].trim() !== "'''") body.push(lines[i++])
          i++
          pair.value = dedent(body.map((l) => l.replace(/^ {2}/, '')))
        }
        pairs.push(pair)
      }
      blocks.push({ kind: 'dict', name, pairs })
      i++
      continue
    }
    // Text block: ends at a `}` in column 0, so indented braces in JSON/JS stay in the text.
    const body: string[] = []
    while (i < lines.length && lines[i] !== '}') body.push(lines[i++])
    blocks.push({ kind: 'text', name, text: dedent(body) })
    i++
  }

  const find = <K extends BruBlock['kind']>(name: string, kind: K) =>
    blocks.find((b): b is Extract<BruBlock, { kind: K }> => b.name === name && b.kind === kind)

  return {
    blocks,
    dict(name) {
      const block = find(name, 'dict')
      if (!block) return undefined
      return Object.fromEntries(block.pairs.filter((p) => p.enabled).map((p) => [p.key, p.value]))
    },
    pairs: (name) => find(name, 'dict')?.pairs ?? [],
    text: (name) => find(name, 'text')?.text,
    list: (name) => find(name, 'list')?.items ?? [],
    has: (name) => blocks.some((b) => b.name === name)
  }
}

export function bruHttpBlock(file: BruFile): { method: string; fields: Record<string, string> } | null {
  for (const method of HTTP_BLOCKS) {
    const fields = file.dict(method)
    if (fields) return { method: method.toUpperCase(), fields }
  }
  return null
}
