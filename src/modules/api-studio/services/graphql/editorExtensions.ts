import { autocompletion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete'
import { graphqlLanguageSupport, lint, stateExtensions, getSchema } from 'cm6-graphql'
import type { Extension } from '@codemirror/state'
import type { GraphQLSchema } from 'graphql'
import { graphqlSuggestions } from './suggestions'

const KEYWORDS = ['query', 'mutation', 'subscription', 'fragment', 'on', 'true', 'false', 'null']

function keywordSource(context: CompletionContext): CompletionResult | null {
  const word = context.matchBefore(/\w*/)
  if (!word || (word.from === word.to && !context.explicit)) return null
  const options = KEYWORDS.filter((keyword) => keyword.startsWith(word.text)).map((label) => ({
    label,
    type: 'keyword'
  }))
  return options.length > 0 ? { from: word.from, options } : null
}

function schemaSource(context: CompletionContext): CompletionResult | null {
  const schema = getSchema(context.state) || null
  if (!schema) return keywordSource(context)

  const word = context.matchBefore(/[A-Za-z0-9_]*$/)
  if (!word || (word.from === word.to && !context.explicit)) return null

  const suggestions = graphqlSuggestions(schema, context.state.doc.toString(), context.pos)
  if (suggestions.length === 0) return null

  return {
    from: word.from,
    options: suggestions.map((item) => ({
      label: item.label,
      detail: item.detail,
      type: item.detail || 'field',
      info: item.documentation
    }))
  }
}

/** Syntax, indentation, schema lint, and autocomplete. REST editors do not use this. */
export function graphqlEditorExtensions(schema?: GraphQLSchema | null): Extension[] {
  return [
    graphqlLanguageSupport(),
    stateExtensions(schema ?? undefined),
    lint,
    autocompletion({ override: [schemaSource] })
  ]
}
