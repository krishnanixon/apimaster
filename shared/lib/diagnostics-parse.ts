import type { DiagnosticHit } from '../types/agent'

const TSC_RE =
  /^(?<file>.+?)\((?<line>\d+),(?<column>\d+)\):\s+(?<severity>error|warning)\s+(?<code>TS\d+):\s+(?<message>.+)$/gm
const ESLINT_RE =
  /^(?<file>.+?):(?<line>\d+):(?<column>\d+):\s+(?<severity>error|warning)\s+(?<message>.+)$/gm
const VITEST_RE = /FAIL\s+(?<file>\S+)[\s\S]*?(?:AssertionError|Error):\s*(?<message>.+)/g

function severityOf(raw: string | undefined): DiagnosticHit['severity'] {
  return raw === 'warning' ? 'warning' : 'error'
}

export function parseDiagnostics(output: string): DiagnosticHit[] {
  const hits: DiagnosticHit[] = []
  const seen = new Set<string>()

  const push = (hit: DiagnosticHit) => {
    const key = `${hit.source}:${hit.file}:${hit.line}:${hit.message}`
    if (seen.has(key)) return
    seen.add(key)
    hits.push(hit)
  }

  for (const match of output.matchAll(TSC_RE)) {
    push({
      file: match.groups?.file,
      line: match.groups?.line ? Number(match.groups.line) : undefined,
      column: match.groups?.column ? Number(match.groups.column) : undefined,
      code: match.groups?.code,
      message: match.groups?.message?.trim() ?? '',
      severity: severityOf(match.groups?.severity),
      source: 'tsc'
    })
  }
  for (const match of output.matchAll(ESLINT_RE)) {
    push({
      file: match.groups?.file,
      line: match.groups?.line ? Number(match.groups.line) : undefined,
      column: match.groups?.column ? Number(match.groups.column) : undefined,
      message: match.groups?.message?.trim() ?? '',
      severity: severityOf(match.groups?.severity),
      source: 'eslint'
    })
  }
  for (const match of output.matchAll(VITEST_RE)) {
    push({
      file: match.groups?.file,
      message: match.groups?.message?.trim() ?? 'Test failed',
      severity: 'error',
      source: 'vitest'
    })
  }

  if (hits.length === 0 && /error/i.test(output)) {
    const first = output
      .split('\n')
      .map((line) => line.trim())
      .find((line) => /error/i.test(line))
    if (first) push({ message: first.slice(0, 400), source: 'generic' })
  }

  return hits.slice(0, 500)
}

export function formatDiagnostics(hits: DiagnosticHit[]): string {
  if (hits.length === 0) return 'No diagnostics parsed from the command output.'
  return hits
    .slice(0, 40)
    .map((hit) => {
      const loc = [hit.file, hit.line].filter(Boolean).join(':')
      const code = hit.code ? ` ${hit.code}` : ''
      return `- [${hit.source}]${code} ${loc ? `${loc} — ` : ''}${hit.message}`
    })
    .join('\n')
}
