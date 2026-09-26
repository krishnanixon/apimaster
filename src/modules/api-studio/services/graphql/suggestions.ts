import { getAutocompleteSuggestions, Position, type CompletionItem } from 'graphql-language-service'
import type { GraphQLSchema } from 'graphql'

export interface GraphQLSuggestion {
  label: string
  detail: string
  documentation?: string
}

export function indexToPosition(text: string, index: number): Position {
  const clamped = Math.max(0, Math.min(index, text.length))
  const lines = text.slice(0, clamped).split('\n')
  return new Position(lines.length - 1, lines[lines.length - 1]?.length ?? 0)
}

/** Schema-aware suggestions used by the editor and tests. */
export function graphqlSuggestions(schema: GraphQLSchema | null | undefined, query: string, cursor: number): GraphQLSuggestion[] {
  if (!schema) return []
  try {
    const items = getAutocompleteSuggestions(schema, query, indexToPosition(query, cursor))
    return items.map(toSuggestion).filter((item) => item.label.trim().length > 0)
  } catch {
    return []
  }
}

export function suggestionDetail(item: CompletionItem): string {
  const direct = item.detail?.trim()
  if (direct) return direct
  const nested = item.labelDetails?.detail?.trim()
  if (nested) return nested
  return item.type ? String(item.type) : ''
}

function toSuggestion(item: CompletionItem): GraphQLSuggestion {
  const documentation = typeof item.documentation === 'string' ? item.documentation : undefined
  return {
    label: item.label,
    detail: suggestionDetail(item),
    documentation
  }
}
