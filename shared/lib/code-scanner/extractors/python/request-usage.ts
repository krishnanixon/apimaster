/** What a Flask or Django view reads from `request`, found by pattern over its body. */
import { addInput, emptyInputs, type RequestInputs } from '../common'
import type { LogicalLine } from './source'

const NAME = `['"]([\\w.-]+)['"]`

/** `request.X['a']`, `request.X.get('a')`, `request.X.getlist('a')` for each source attribute. */
function accessPattern(sources: string): RegExp {
  return new RegExp(`request\\.(?:${sources})(?:\\s*\\[\\s*|\\.get(?:list)?\\(\\s*)${NAME}`, 'g')
}

const BODY_SOURCES = 'json|get_json\\([^)]*\\)|form|values|data|POST|files'
const QUERY_SOURCES = 'args|GET|query_params'

export function scanRequestUsage(body: LogicalLine[]): RequestInputs {
  const inputs = emptyInputs()
  const text = body.map((l) => l.text).join('\n')

  for (const m of text.matchAll(accessPattern(BODY_SOURCES))) addInput(inputs, 'body', m[1])
  for (const m of text.matchAll(accessPattern(QUERY_SOURCES))) addInput(inputs, 'query', m[1])
  for (const m of text.matchAll(accessPattern('headers'))) addInput(inputs, 'headers', m[1])
  // Django: request.META['HTTP_X_API_KEY'] → x-api-key
  for (const m of text.matchAll(/request\.META(?:\s*\[\s*|\.get\(\s*)['"]HTTP_([\w]+)['"]/g)) {
    addInput(inputs, 'headers', m[1].toLowerCase().replace(/_/g, '-'))
  }

  // `data = request.get_json()` then `data['name']` / `data.get('name')`
  for (const m of text.matchAll(/\b([A-Za-z_]\w*)\s*=\s*request\.(?:json|get_json\([^)]*\)|form|data|POST)\s*$/gm)) {
    const alias = m[1]
    const aliasAccess = new RegExp(`\\b${alias}(?:\\s*\\[\\s*|\\.get\\(\\s*)${NAME}`, 'g')
    for (const a of text.matchAll(aliasAccess)) addInput(inputs, 'body', a[1])
  }
  return inputs
}
