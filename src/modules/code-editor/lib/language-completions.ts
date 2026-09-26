import { type CompletionContext, type CompletionResult, type CompletionSource } from '@codemirror/autocomplete'
import { EditorState, type Extension } from '@codemirror/state'
import { getDesktopApi } from '@/shared/lib/desktop-api'
import { isTsLikePath } from './language-files'

function kindToType(kind: string): string {
  const value = kind.toLowerCase()
  if (value.includes('class')) return 'class'
  if (value.includes('interface') || value.includes('type')) return 'type'
  if (value.includes('method') || value.includes('function')) return 'function'
  if (value.includes('property') || value.includes('var') || value.includes('let') || value.includes('const'))
    return 'variable'
  if (value.includes('keyword')) return 'keyword'
  if (value.includes('module') || value.includes('file')) return 'namespace'
  return 'text'
}

function sourceFor(filePath: string): CompletionSource {
  return async (context: CompletionContext): Promise<CompletionResult | null> => {
    const word = context.matchBefore(/[\w$]+/)
    if (!word && !context.explicit) return null
    const line = context.state.doc.lineAt(context.pos)
    const api = getDesktopApi()?.language
    if (!api?.completions) return null
    const result = await api.completions({
      path: filePath,
      line: line.number,
      column: context.pos - line.from + 1,
      content: context.state.doc.toString()
    })
    const data = result.success ? result.data : null
    if (!data || data.items.length === 0) return null
    return {
      from: word?.from ?? Math.max(line.from, line.from + data.fromColumn - 1),
      options: data.items.map((item) => ({
        label: item.label,
        type: kindToType(item.kind),
        detail: item.detail,
        apply: item.insertText ?? item.label
      }))
    }
  }
}

/** TypeScript/JavaScript completions from the in-process language service. */
export function languageCompletions(filePath: string): Extension {
  if (!isTsLikePath(filePath)) return []
  const source = sourceFor(filePath)
  return EditorState.languageData.of(() => [{ autocomplete: source }])
}
