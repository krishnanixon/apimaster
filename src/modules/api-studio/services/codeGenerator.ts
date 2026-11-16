import type { ApiRequest, ApiCollection } from '../types/api.types'
import { resolveRequest } from './requestBuilder'

export type SnippetLanguage = 'curl' | 'http' | 'javascript' | 'nodejs' | 'python' | 'powershell' | 'go' | 'php'

export const SNIPPET_LANGUAGES: { id: SnippetLanguage; label: string }[] = [
  { id: 'curl', label: 'cURL' },
  { id: 'http', label: 'HTTP' },
  { id: 'javascript', label: 'JavaScript (fetch)' },
  { id: 'nodejs', label: 'Node.js (axios)' },
  { id: 'python', label: 'Python (requests)' },
  { id: 'powershell', label: 'PowerShell' },
  { id: 'go', label: 'Go' },
  { id: 'php', label: 'PHP (cURL)' }
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
  if (body.type === 'x-www-form-urlencoded') {
    // Stored one `key=value` per line; on the wire it is `a=1&b=2`.
    return body.content
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => {
        const eq = line.indexOf('=')
        return eq === -1
          ? encodeURIComponent(line)
          : `${encodeURIComponent(line.slice(0, eq))}=${encodeURIComponent(line.slice(eq + 1))}`
      })
      .join('&')
  }
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
  const hasContentType = Object.keys(headers).some((k) => k.toLowerCase() === 'content-type')
  if (resolved.body.type === 'json' && !hasContentType) headers['Content-Type'] = 'application/json'
  if (resolved.body.type === 'x-www-form-urlencoded' && !hasContentType && body) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded'
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
    case 'http':
      return generateHttp(resolved.method, fullUrl, headers, body)
    case 'powershell':
      return generatePowerShell(resolved.method, fullUrl, headers, body)
    case 'go':
      return generateGo(resolved.method, fullUrl, headers, body)
    case 'php':
      return generatePhp(resolved.method, fullUrl, headers, body)
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

function generateHttp(method: string, url: string, headers: Record<string, string>, body: string | undefined): string {
  let host = ''
  let target = url
  const match = /^([a-z]+:\/\/)([^/?#]+)(.*)$/i.exec(url)
  if (match) {
    host = match[2]
    target = match[3] || '/'
  }
  const lines = [`${method} ${target} HTTP/1.1`]
  if (host) lines.push(`Host: ${host}`)
  for (const [key, value] of Object.entries(headers)) lines.push(`${key}: ${value}`)
  if (body) lines.push('', body)
  return lines.join('\n')
}

function psString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

function generatePowerShell(method: string, url: string, headers: Record<string, string>, body: string | undefined): string {
  const lines = ['$headers = @{']
  for (const [key, value] of Object.entries(headers)) lines.push(`  ${psString(key)} = ${psString(value)}`)
  lines.push('}')
  if (body) lines.push(`$body = @'\n${body}\n'@`)
  lines.push(
    '',
    `$response = Invoke-RestMethod -Uri ${psString(url)} -Method ${method} -Headers $headers${body ? ' -Body $body' : ''}`,
    '$response | ConvertTo-Json -Depth 10'
  )
  return lines.join('\n')
}

function goString(value: string): string {
  return value.includes('`') ? JSON.stringify(value) : `\`${value}\``
}

function generateGo(method: string, url: string, headers: Record<string, string>, body: string | undefined): string {
  const lines = [
    'package main',
    '',
    'import (',
    '\t"fmt"',
    '\t"io"',
    '\t"net/http"',
    ...(body ? ['\t"strings"'] : []),
    ')',
    '',
    'func main() {',
    ...(body ? [`\tpayload := strings.NewReader(${goString(body)})`] : []),
    `\treq, err := http.NewRequest(${JSON.stringify(method)}, ${JSON.stringify(url)}, ${body ? 'payload' : 'nil'})`,
    '\tif err != nil {',
    '\t\tpanic(err)',
    '\t}'
  ]
  for (const [key, value] of Object.entries(headers)) {
    lines.push(`\treq.Header.Add(${JSON.stringify(key)}, ${JSON.stringify(value)})`)
  }
  lines.push(
    '',
    '\tres, err := http.DefaultClient.Do(req)',
    '\tif err != nil {',
    '\t\tpanic(err)',
    '\t}',
    '\tdefer res.Body.Close()',
    '\tdata, _ := io.ReadAll(res.Body)',
    '\tfmt.Println(res.Status)',
    '\tfmt.Println(string(data))',
    '}'
  )
  return lines.join('\n')
}

function phpString(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
}

function generatePhp(method: string, url: string, headers: Record<string, string>, body: string | undefined): string {
  const headerLines = Object.entries(headers).map(([k, v]) => `    ${phpString(`${k}: ${v}`)},`)
  const lines = [
    '<?php',
    '',
    '$curl = curl_init();',
    '',
    'curl_setopt_array($curl, [',
    `  CURLOPT_URL => ${phpString(url)},`,
    '  CURLOPT_RETURNTRANSFER => true,',
    `  CURLOPT_CUSTOMREQUEST => ${phpString(method)},`,
    ...(body ? [`  CURLOPT_POSTFIELDS => ${phpString(body)},`] : []),
    '  CURLOPT_HTTPHEADER => [',
    ...headerLines,
    '  ],',
    ']);',
    '',
    '$response = curl_exec($curl);',
    'curl_close($curl);',
    'echo $response;'
  ]
  return lines.join('\n')
}
