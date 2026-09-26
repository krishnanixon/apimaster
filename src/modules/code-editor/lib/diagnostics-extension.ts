import { forceLinting, linter, lintGutter, type Diagnostic } from '@codemirror/lint'
import type { Extension } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'
import type { DiagnosticHit } from '@shared/types/agent'
import { useProblemsStore } from '../stores/problems.store'
import { pathsMatch } from './paths'

function severityFor(hit: DiagnosticHit): Diagnostic['severity'] {
  if (hit.severity === 'warning') return 'warning'
  if (hit.severity === 'info') return 'info'
  return 'error'
}

/** Maps a 1-based line/column pair onto the document range covering that token. */
function rangeFor(view: EditorView, line: number, column?: number): { from: number; to: number } {
  const doc = view.state.doc
  const lineInfo = doc.line(Math.max(1, Math.min(line, doc.lines)))
  if (!column || column < 1) return { from: lineInfo.from, to: lineInfo.to }
  const from = Math.min(lineInfo.from + column - 1, lineInfo.to)
  const text = lineInfo.text.slice(column - 1)
  const token = /^[\w$]+/.exec(text)?.[0]
  const to = token ? Math.min(from + token.length, lineInfo.to) : lineInfo.to
  return { from, to: to > from ? to : Math.min(from + 1, lineInfo.to) }
}

/**
 * Surfaces workspace diagnostics (tsc/eslint/vitest output collected in the problems
 * store) as CodeMirror lint markers for the file shown in this editor.
 */
export function diagnosticsExtension(filePath: string): Extension {
  return [
    lintGutter(),
    linter(
      (view): Diagnostic[] => {
        const hits = useProblemsStore.getState().items
        const diagnostics: Diagnostic[] = []
        for (const hit of hits) {
          if (!hit.file || !hit.line || !pathsMatch(filePath, hit.file)) continue
          const { from, to } = rangeFor(view, hit.line, hit.column)
          diagnostics.push({
            from,
            to,
            severity: severityFor(hit),
            source: hit.code ? `${hit.source} ${hit.code}` : hit.source,
            message: hit.message
          })
        }
        return diagnostics
      },
      { delay: 150 }
    )
  ]
}

/** Re-runs the linter after the problems store changes, since the source is external to the doc. */
export function refreshDiagnostics(view: EditorView | null): void {
  if (view) forceLinting(view)
}
