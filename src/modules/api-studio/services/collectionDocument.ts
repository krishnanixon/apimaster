import type { ApiCollection, ApiRequest, KeyValuePair, RequestAuth } from '../types/api.types'
import { isSensitiveKey, redactBodyContent, redactText } from '@shared/lib/redact-secrets'
import { generateSnippet } from './codeGenerator'
import { applyParentInheritance } from './inheritance'

export interface CollectionDocumentOptions {
  redactSecrets?: boolean
  includeScripts?: boolean
  includeCodeExamples?: boolean
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function redact(value: string, enabled: boolean): string {
  if (!enabled || !value.trim()) return value
  if (value.length <= 8) return '••••••••'
  return `${value.slice(0, 2)}••••${value.slice(-2)}`
}

function enabledPairs(pairs: KeyValuePair[], redactSecrets: boolean): { key: string; value: string }[] {
  return pairs
    .filter((p) => p.enabled && p.key.trim())
    .map((p) => ({
      key: p.key,
      value: isSensitiveKey(p.key) ? redact(p.value, redactSecrets) : p.value
    }))
}

function describeAuth(auth: RequestAuth, redactSecrets: boolean): string {
  switch (auth.type) {
    case 'inherit':
      return 'Inherit from parent'
    case 'none':
      return 'None'
    case 'bearer':
      return `Bearer token: \`${redact(auth.bearerToken ?? '', redactSecrets)}\``
    case 'basic':
      return `Basic — user \`${auth.basicUsername || '(empty)'}\`, password \`${redact(auth.basicPassword ?? '', redactSecrets)}\``
    case 'apiKey':
      return `API Key — ${auth.apiKeyLocation ?? 'header'} \`${auth.apiKeyName || '(name)'}\` = \`${redact(auth.apiKeyValue ?? '', redactSecrets)}\``
    case 'oauth2':
      return `OAuth 2.0 (${auth.oauth2GrantType ?? 'authorization_code'}) — client \`${auth.oauth2ClientId || ''}\``
    case 'jwt':
      return `JWT Bearer (${auth.jwtAlgorithm ?? 'HS256'})`
    case 'digest':
      return `Digest — user \`${auth.digestUsername || '(empty)'}\``
    case 'oauth1':
      return `OAuth 1.0 — consumer \`${auth.oauth1ConsumerKey || ''}\``
    case 'aws':
      return `AWS Signature — ${auth.awsRegion || 'us-east-1'} / ${auth.awsService || 'execute-api'}`
    case 'hawk':
      return `Hawk — id \`${auth.hawkId || ''}\``
    default:
      return auth.type
  }
}

function protocolLabel(request: ApiRequest): string {
  if (request.requestType === 'websocket') return 'WebSocket'
  if (request.requestType === 'graphql') return 'GraphQL'
  return 'HTTP'
}

function graphqlMarkdownLines(request: ApiRequest, redactSecrets: boolean): string[] {
  const lines = ['#### GraphQL', '']
  if (request.graphql?.operationName) lines.push(`- **Operation:** \`${request.graphql.operationName}\``)
  const query = request.graphql?.query?.trim()
  if (query) {
    lines.push('```graphql', redactSecrets ? redactText(query) : query, '```', '')
  } else {
    lines.push('_No query_', '')
  }
  const variables = request.graphql?.variables?.trim()
  if (variables) {
    lines.push('##### Variables', '', '```json', redactSecrets ? redactBodyContent(variables) : variables, '```', '')
  }
  return lines
}

function groupRequests(collection: ApiCollection): { title: string; requests: ApiRequest[] }[] {
  const groups: { title: string; requests: ApiRequest[] }[] = []
  const root = collection.requests.filter((r) => !r.folderId)
  if (root.length > 0) groups.push({ title: 'Root', requests: root })
  for (const folder of collection.folders) {
    const requests = collection.requests.filter((r) => r.folderId === folder.id)
    if (requests.length > 0) groups.push({ title: folder.name, requests })
  }
  return groups
}

function requestMarkdown(
  request: ApiRequest,
  options: CollectionDocumentOptions,
  collection: ApiCollection
): string {
  const effective = applyParentInheritance(request, collection)
  const redactSecrets = options.redactSecrets !== false
  const lines: string[] = []
  const typeLabel = protocolLabel(request)

  lines.push(`### ${request.method} ${request.name}`)
  lines.push('')
  lines.push(`- **Type:** ${typeLabel}`)
  lines.push(`- **URL:** \`${(redactSecrets ? redactText(request.url) : request.url) || '(empty)'}\``)
  lines.push(`- **Auth:** ${describeAuth(effective.auth, redactSecrets)}`)
  lines.push('')

  const params = enabledPairs(request.queryParams, redactSecrets)
  if (params.length > 0) {
    lines.push('#### Query parameters')
    lines.push('')
    lines.push('| Key | Value |')
    lines.push('| --- | --- |')
    for (const p of params) lines.push(`| \`${p.key}\` | \`${p.value}\` |`)
    lines.push('')
  }

  const headers = enabledPairs(effective.headers, redactSecrets)
  if (headers.length > 0) {
    lines.push('#### Headers')
    lines.push('')
    lines.push('| Key | Value |')
    lines.push('| --- | --- |')
    for (const h of headers) lines.push(`| \`${h.key}\` | \`${h.value}\` |`)
    lines.push('')
  }

  if (request.requestType === 'graphql') {
    lines.push(...graphqlMarkdownLines(request, redactSecrets))
  }

  if (request.requestType !== 'graphql' && request.body.type !== 'none') {
    lines.push(`#### Body (\`${request.body.type}\`)`)
    lines.push('')
    if (request.body.type === 'form-data' && request.body.formData?.length) {
      lines.push('| Key | Value | Type |')
      lines.push('| --- | --- | --- |')
      for (const f of request.body.formData.filter((x) => x.enabled && x.key.trim())) {
        const value = redactSecrets && isSensitiveKey(f.key) ? redact(f.value, true) : f.value
        lines.push(`| \`${f.key}\` | \`${value}\` | ${f.type} |`)
      }
    } else if (request.body.content.trim()) {
      const lang = request.body.type === 'json' ? 'json' : 'text'
      const content = redactSecrets ? redactBodyContent(request.body.content) : request.body.content
      lines.push('```' + lang)
      lines.push(content)
      lines.push('```')
    } else {
      lines.push('_Empty body_')
    }
    lines.push('')
  }

  if (options.includeScripts) {
    if (request.preRequestScript?.trim()) {
      lines.push('#### Pre-request script')
      lines.push('')
      lines.push('```javascript')
      lines.push(request.preRequestScript.trim())
      lines.push('```')
      lines.push('')
    }
    if (request.tests?.trim()) {
      lines.push('#### Tests')
      lines.push('')
      lines.push('```javascript')
      lines.push(request.tests.trim())
      lines.push('```')
      lines.push('')
    }
  }

  if (options.includeCodeExamples && request.requestType !== 'websocket') {
    try {
      const curl = generateSnippet(request, 'curl', collection)
      lines.push('#### Example (cURL)')
      lines.push('')
      lines.push('```bash')
      lines.push(curl)
      lines.push('```')
      lines.push('')
    } catch {
      /* skip broken snippets */
    }
  }

  return lines.join('\n')
}

/** Deterministic full-collection Markdown documentation. */
export function buildCollectionMarkdown(
  collection: ApiCollection,
  options: CollectionDocumentOptions = {}
): string {
  const opts: CollectionDocumentOptions = {
    redactSecrets: options.redactSecrets !== false,
    includeScripts: options.includeScripts !== false,
    includeCodeExamples: options.includeCodeExamples === true
  }

  const lines: string[] = []
  lines.push(`# ${collection.name}`)
  lines.push('')
  if (collection.description?.trim()) {
    lines.push(collection.description.trim())
    lines.push('')
  }
  lines.push(`_Generated ${new Date().toLocaleString()} · ${collection.requests.length} endpoint(s)_`)
  lines.push('')
  lines.push('## Contents')
  lines.push('')

  const groups = groupRequests(collection)
  for (const group of groups) {
    lines.push(`### ${group.title}`)
    lines.push('')
    for (const req of group.requests) {
      lines.push(`- \`${req.method}\` ${req.name} — \`${req.url || ''}\``)
    }
    lines.push('')
  }

  lines.push('## Endpoints')
  lines.push('')
  for (const group of groups) {
    lines.push(`## ${group.title}`)
    lines.push('')
    for (const req of group.requests) {
      lines.push(requestMarkdown(req, opts, collection))
    }
  }

  return lines.join('\n').trim() + '\n'
}

/** Compact JSON/text summary for the AI document prompt (secrets redacted). */
export function buildCollectionAiSummary(collection: ApiCollection): string {
  const summary = {
    name: collection.name,
    description: collection.description,
    folders: collection.folders.map((f) => f.name),
    endpoints: collection.requests.map((r) => ({
      folder: collection.folders.find((f) => f.id === r.folderId)?.name ?? null,
      name: r.name,
      method: r.method,
      type: r.requestType ?? 'http',
      url: r.url,
      auth: applyParentInheritance(r, collection).auth.type,
      headers: enabledPairs(r.headers, true),
      queryParams: enabledPairs(r.queryParams, true),
      bodyType: r.requestType === 'graphql' ? 'graphql' : r.body.type,
      bodyPreview:
        r.requestType === 'graphql'
          ? redactText(r.graphql?.query ?? '').slice(0, 800)
          : r.body.type === 'none'
            ? ''
            : redactBodyContent(r.body.content).slice(0, 800),
      operationName: r.graphql?.operationName,
      hasPreRequest: Boolean(r.preRequestScript?.trim()),
      hasTests: Boolean(r.tests?.trim())
    }))
  }
  return JSON.stringify(summary, null, 2)
}

function kvTableHtml(rows: { key: string; value: string }[]): string {
  if (rows.length === 0) return ''
  const body = rows
    .map((r) => `<tr><td><code>${escapeHtml(r.key)}</code></td><td><code>${escapeHtml(r.value)}</code></td></tr>`)
    .join('')
  return `<table><thead><tr><th>Key</th><th>Value</th></tr></thead><tbody>${body}</tbody></table>`
}

function requestHtml(
  request: ApiRequest,
  options: CollectionDocumentOptions,
  collection: ApiCollection
): string {
  const effective = applyParentInheritance(request, collection)
  const redactSecrets = options.redactSecrets !== false
  const parts: string[] = []
  const typeLabel = protocolLabel(request)

  parts.push(`<h3><code>${escapeHtml(request.method)}</code> ${escapeHtml(request.name)}</h3>`)
  parts.push('<ul>')
  parts.push(`<li><strong>Type:</strong> ${typeLabel}</li>`)
  parts.push(
    `<li><strong>URL:</strong> <code>${escapeHtml((redactSecrets ? redactText(request.url) : request.url) || '(empty)')}</code></li>`
  )
  parts.push(`<li><strong>Auth:</strong> ${escapeHtml(describeAuth(effective.auth, redactSecrets).replace(/`/g, ''))}</li>`)
  parts.push('</ul>')

  const params = enabledPairs(request.queryParams, redactSecrets)
  if (params.length > 0) {
    parts.push('<h4>Query parameters</h4>')
    parts.push(kvTableHtml(params))
  }

  const headers = enabledPairs(effective.headers, redactSecrets)
  if (headers.length > 0) {
    parts.push('<h4>Headers</h4>')
    parts.push(kvTableHtml(headers))
  }

  if (request.requestType === 'graphql') {
    parts.push('<h4>GraphQL</h4>')
    if (request.graphql?.operationName) {
      parts.push(`<p><strong>Operation:</strong> <code>${escapeHtml(request.graphql.operationName)}</code></p>`)
    }
    const query = request.graphql?.query?.trim()
    if (query) {
      const text = redactSecrets ? redactText(query) : query
      parts.push(`<pre><code>${escapeHtml(text)}</code></pre>`)
    }
    const variables = request.graphql?.variables?.trim()
    if (variables) {
      const text = redactSecrets ? redactBodyContent(variables) : variables
      parts.push('<h5>Variables</h5>')
      parts.push(`<pre><code>${escapeHtml(text)}</code></pre>`)
    }
  }

  if (request.requestType !== 'graphql' && request.body.type !== 'none') {
    parts.push(`<h4>Body (<code>${escapeHtml(request.body.type)}</code>)</h4>`)
    if (request.body.type === 'form-data' && request.body.formData?.length) {
      const rows = request.body.formData
        .filter((f) => f.enabled && f.key.trim())
        .map((f) => {
          const value = redactSecrets && isSensitiveKey(f.key) ? redact(f.value, true) : f.value
          return `<tr><td><code>${escapeHtml(f.key)}</code></td><td><code>${escapeHtml(value)}</code></td><td>${escapeHtml(f.type)}</td></tr>`
        })
        .join('')
      parts.push(
        `<table><thead><tr><th>Key</th><th>Value</th><th>Type</th></tr></thead><tbody>${rows}</tbody></table>`
      )
    } else if (request.body.content.trim()) {
      const content = redactSecrets ? redactBodyContent(request.body.content) : request.body.content
      parts.push(`<pre><code>${escapeHtml(content)}</code></pre>`)
    } else {
      parts.push('<p><em>Empty body</em></p>')
    }
  }

  if (options.includeScripts) {
    if (request.preRequestScript?.trim()) {
      parts.push('<h4>Pre-request script</h4>')
      parts.push(`<pre><code>${escapeHtml(request.preRequestScript.trim())}</code></pre>`)
    }
    if (request.tests?.trim()) {
      parts.push('<h4>Tests</h4>')
      parts.push(`<pre><code>${escapeHtml(request.tests.trim())}</code></pre>`)
    }
  }

  if (options.includeCodeExamples && request.requestType !== 'websocket') {
    try {
      const curl = generateSnippet(request, 'curl', collection)
      parts.push('<h4>Example (cURL)</h4>')
      parts.push(`<pre><code>${escapeHtml(curl)}</code></pre>`)
    } catch {
      /* skip */
    }
  }

  return parts.join('\n')
}

/** Deterministic full-collection HTML documentation (for api_spec documents). */
export function buildCollectionHtml(
  collection: ApiCollection,
  options: CollectionDocumentOptions = {}
): string {
  const opts: CollectionDocumentOptions = {
    redactSecrets: options.redactSecrets !== false,
    includeScripts: options.includeScripts !== false,
    includeCodeExamples: options.includeCodeExamples === true
  }

  const groups = groupRequests(collection)
  const toc = groups
    .map((g) => {
      const items = g.requests
        .map((r) => `<li><code>${escapeHtml(r.method)}</code> ${escapeHtml(r.name)}</li>`)
        .join('')
      return `<h3>${escapeHtml(g.title)}</h3><ul>${items}</ul>`
    })
    .join('')

  const body = groups
    .map((g) => {
      const reqs = g.requests.map((r) => requestHtml(r, opts, collection)).join('\n')
      return `<h2>${escapeHtml(g.title)}</h2>\n${reqs}`
    })
    .join('\n')

  return `<h1>${escapeHtml(collection.name)}</h1>
${collection.description?.trim() ? `<p>${escapeHtml(collection.description.trim())}</p>` : ''}
<p><em>Generated ${escapeHtml(new Date().toLocaleString())} · ${collection.requests.length} endpoint(s)</em></p>
<h2>Contents</h2>
${toc}
<h2>Endpoints</h2>
${body}`
}

/**
 * Lightweight Markdown → HTML for AI-generated docs.
 * Covers headings, lists, tables, fenced code, paragraphs, inline code/bold.
 */
export function markdownToSimpleHtml(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const out: string[] = []
  let i = 0
  let inCode = false
  let codeLang = ''
  let codeBuf: string[] = []
  let inUl = false
  let inOl = false
  let inTable = false

  function closeLists() {
    if (inUl) {
      out.push('</ul>')
      inUl = false
    }
    if (inOl) {
      out.push('</ol>')
      inOl = false
    }
  }

  function closeTable() {
    if (inTable) {
      out.push('</tbody></table>')
      inTable = false
    }
  }

  function inline(text: string): string {
    return escapeHtml(text)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
  }

  while (i < lines.length) {
    const line = lines[i]

    const fence = line.match(/^```(\w*)\s*$/)
    if (fence) {
      closeLists()
      closeTable()
      if (!inCode) {
        inCode = true
        codeLang = fence[1] || ''
        codeBuf = []
      } else {
        out.push(
          `<pre><code${codeLang ? ` class="language-${escapeHtml(codeLang)}"` : ''}>${escapeHtml(codeBuf.join('\n'))}</code></pre>`
        )
        inCode = false
        codeBuf = []
      }
      i++
      continue
    }

    if (inCode) {
      codeBuf.push(line)
      i++
      continue
    }

    if (/^\|.+\|$/.test(line.trim())) {
      closeLists()
      const cells = line
        .trim()
        .slice(1, -1)
        .split('|')
        .map((c) => c.trim())
      const isSep = cells.every((c) => /^:?-+:?$/.test(c))
      if (!inTable) {
        out.push('<table><thead><tr>' + cells.map((c) => `<th>${inline(c)}</th>`).join('') + '</tr></thead><tbody>')
        inTable = true
      } else if (!isSep) {
        out.push('<tr>' + cells.map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>')
      }
      i++
      continue
    } else {
      closeTable()
    }

    const heading = line.match(/^(#{1,4})\s+(.+)$/)
    if (heading) {
      closeLists()
      const level = heading[1].length
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`)
      i++
      continue
    }

    const ul = line.match(/^[-*]\s+(.+)$/)
    if (ul) {
      closeTable()
      if (inOl) {
        out.push('</ol>')
        inOl = false
      }
      if (!inUl) {
        out.push('<ul>')
        inUl = true
      }
      out.push(`<li>${inline(ul[1])}</li>`)
      i++
      continue
    }

    const ol = line.match(/^\d+\.\s+(.+)$/)
    if (ol) {
      closeTable()
      if (inUl) {
        out.push('</ul>')
        inUl = false
      }
      if (!inOl) {
        out.push('<ol>')
        inOl = true
      }
      out.push(`<li>${inline(ol[1])}</li>`)
      i++
      continue
    }

    if (!line.trim()) {
      closeLists()
      i++
      continue
    }

    closeLists()
    out.push(`<p>${inline(line)}</p>`)
    i++
  }

  closeLists()
  closeTable()
  if (inCode) {
    out.push(`<pre><code>${escapeHtml(codeBuf.join('\n'))}</code></pre>`)
  }

  return out.join('\n')
}
