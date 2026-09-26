import type { ApiRequest, ApiCollection } from '../types/api.types'
import { resolveRequest } from './requestBuilder'

export type SnippetLanguage = 'curl' | 'javascript' | 'nodejs' | 'python'

export const SNIPPET_LANGUAGES: { id: SnippetLanguage; label: string }[] = [
  { id: 'curl', label: 'cURL' },
  { id: 'javascript', label: 'JavaScript (fetch)' },
  { id: 'nodejs', label: 'Node.js (axios)' },
  { id: 'python', label: 'Python (requests)' }
]

function buildFullUrl(url: string, params: Record<string, string>): string {
  const entries = Object.entries(params)
  if (entries.length === 0) return url
  const qs = entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&')
  return `${url}${url.includes('?') ? '&' : '?'}${qs}`
}

function escapeSingleQuotes(value: string): string {
  return value.replace(/'/g, `'\\''`)
}

function bodyAsString(body: ReturnType<typeof resolveRequest>['body']): string | undefined {
  if (body.type === 'none') return undefined
  if (body.type === 'form-data') return undefined
  return body.content
}

export function generateSnippet(
  request: ApiRequest,
  language: SnippetLanguage,
  collection?: ApiCollection | null
): string {
  const resolved = resolveRequest(request, { collection })
  const fullUrl = buildFullUrl(resolved.url, resolved.params)
  const body = bodyAsString(resolved.body)
  const headers = { ...resolved.headers }
  if (resolved.body.type === 'json' && !headers['Content-Type'] && !headers['content-type']) {
    headers['Content-Type'] = 'application/json'
  }

  switch (language) {
    case 'curl':
      return generateCurl(resolved.method, fullUrl, headers, body, resolved.body.type === 'form-data' ? resolved.body.formData : undefined)
    case 'javascript':
      return generateFetch(resolved.method, fullUrl, headers, body)
    case 'nodejs':
      return generateAxios(resolved.method, fullUrl, headers, body)
    case 'python':
      return generatePython(resolved.method, fullUrl, headers, body)
    default:
      return ''
  }
}

function generateCurl(
  method: string,
  url: string,
  headers: Record<string, string>,
  body: string | undefined,
  formData: { key: string; value: string; enabled: boolean; type: string }[] | undefined
): string {
  const lines = [`curl -X ${method} '${escapeSingleQuotes(url)}'`]
  for (const [key, value] of Object.entries(headers)) {
    lines.push(`  -H '${escapeSingleQuotes(key)}: ${escapeSingleQuotes(value)}'`)
  }
  if (formData) {
    for (const field of formData) {
      if (!field.enabled || !field.key) continue
      const prefix = field.type === 'file' ? '@' : ''
      lines.push(`  -F '${escapeSingleQuotes(field.key)}=${prefix}${escapeSingleQuotes(field.value ?? '')}'`)
    }
  } else if (body) {
    lines.push(`  --data '${escapeSingleQuotes(body)}'`)
  }
  return lines.join(' \\\n')
}

function generateFetch(method: string, url: string, headers: Record<string, string>, body: string | undefined): string {
  const fields: Record<string, string> = { method: `'${method}'`, headers: indent(JSON.stringify(headers, null, 2), 1) }
  if (body) fields.body = JSON.stringify(body)

  return [
    `fetch('${url}', ${objectLiteral(fields)})`,
    `  .then((res) => res.json())`,
    `  .then((data) => console.log(data))`,
    `  .catch((err) => console.error(err));`
  ].join('\n')
}

function generateAxios(method: string, url: string, headers: Record<string, string>, body: string | undefined): string {
  const fields: Record<string, string> = {
    method: `'${method.toLowerCase()}'`,
    url: `'${url}'`,
    headers: indent(JSON.stringify(headers, null, 2), 1)
  }
  if (body) fields.data = JSON.stringify(body)

  return [
    `const axios = require('axios');`,
    ``,
    `axios(${objectLiteral(fields)})`,
    `  .then((res) => console.log(res.data))`,
    `  .catch((err) => console.error(err));`
  ].join('\n')
}

function objectLiteral(fields: Record<string, string>): string {
  const entries = Object.entries(fields).map(([key, value]) => `  ${key}: ${value}`)
  return `{\n${entries.join(',\n')}\n}`
}

function generatePython(method: string, url: string, headers: Record<string, string>, body: string | undefined): string {
  const lines = [`import requests`, ``, `url = "${url}"`, `headers = ${pythonDict(headers)}`]
  if (body) lines.push(`payload = ${JSON.stringify(body)}`)
  lines.push(``, `response = requests.request("${method}", url, headers=headers${body ? ', data=payload' : ''})`, ``, `print(response.status_code)`, `print(response.text)`)
  return lines.join('\n')
}

function pythonDict(obj: Record<string, string>): string {
  const entries = Object.entries(obj).map(([k, v]) => `    "${k}": "${v.replace(/"/g, '\\"')}"`)
  return entries.length === 0 ? '{}' : `{\n${entries.join(',\n')}\n}`
}

function indent(text: string, levels: number): string {
  const pad = '  '.repeat(levels)
  return text
    .split('\n')
    .map((line, i) => (i === 0 ? line : pad + line))
    .join('\n')
}
