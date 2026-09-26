import { useEffect, useMemo } from 'react'
import type { GraphQLSchema } from 'graphql'
import { RequestCodeEditor } from '../RequestCodeEditor'
import { GraphQLQueryChrome } from './GraphQLQueryChrome'
import { formatGraphQL, type GraphQLInspection } from '../../services/graphql/document'
import { graphqlEditorExtensions } from '../../services/graphql/editorExtensions'
import { schemaStatusLabel, type GraphQLSchemaStatus } from '../../services/graphql/schema'

interface GraphQLQueryEditorProps {
  query: string
  operationName?: string
  inspection: GraphQLInspection
  schema: GraphQLSchema | null
  schemaStatus: GraphQLSchemaStatus
  schemaDetail?: string
  schemaLoading: boolean
  onQuery: (query: string) => void
  onOperationName: (name: string | undefined) => void
  onFormat: () => void
  onFetchSchema: () => void
}

export function GraphQLQueryEditor({
  query,
  operationName,
  inspection,
  schema,
  schemaStatus,
  schemaDetail,
  schemaLoading,
  onQuery,
  onOperationName,
  onFormat,
  onFetchSchema
}: GraphQLQueryEditorProps) {
  const extensions = useMemo(() => graphqlEditorExtensions(schema), [schema])
  const issues = [
    ...(inspection.syntaxError && inspection.syntaxError !== 'Write a GraphQL query before sending.'
      ? [inspection.syntaxError]
      : []),
    ...(inspection.documentError ? [inspection.documentError] : []),
    ...inspection.validationErrors
  ]

  useEffect(() => {
    if (inspection.operations.length !== 1) return
    const only = inspection.operations[0]?.name ?? undefined
    if ((operationName ?? undefined) !== only) onOperationName(only)
  }, [inspection.operations, onOperationName, operationName])

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="graphql-query-editor">
      <GraphQLQueryChrome
        operations={inspection.operations}
        operationName={operationName}
        onOperationName={onOperationName}
        schemaStatus={schemaStatus}
        schemaDetail={schemaDetail || schemaStatusLabel(schemaStatus)}
        loading={schemaLoading}
        onFormat={onFormat}
        onFetchSchema={onFetchSchema}
        issues={issues}
      />
      <RequestCodeEditor
        value={query}
        onChange={onQuery}
        label="GraphQL"
        placeholder={'query GetUsers($limit: Int!) {\n  users(limit: $limit) {\n    id\n    name\n  }\n}'}
        showFormat
        formatText={(value) => {
          try {
            return formatGraphQL(value)
          } catch {
            return null
          }
        }}
        formatTitle="Format query (⇧⌥F)"
        extraExtensions={extensions}
        className="min-h-0 flex-1 rounded-none border-0"
      />
    </div>
  )
}
