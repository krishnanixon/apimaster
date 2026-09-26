import { RequestCodeEditor } from '../RequestCodeEditor'
import { GraphQLVariableHints } from './GraphQLVariableHints'
import type { GraphQLInspection } from '../../services/graphql/document'

export function GraphQLVariablesEditor({
  value,
  inspection,
  onChange
}: {
  value: string
  inspection: GraphQLInspection
  onChange: (value: string) => void
}) {
  const errors = [
    ...(inspection.variablesError ? [inspection.variablesError] : []),
    ...inspection.variableErrors.filter((error) => error !== inspection.variablesError)
  ]
  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="graphql-variables-editor">
      <GraphQLVariableHints variables={inspection.variables} errors={errors} />
      <RequestCodeEditor
        value={value}
        onChange={onChange}
        languageFile="variables.json"
        label="Variables"
        placeholder={'{\n  "limit": 10\n}'}
        showFormat
        className="min-h-0 flex-1 rounded-none border-0"
      />
    </div>
  )
}
