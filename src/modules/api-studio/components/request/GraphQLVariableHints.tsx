import type { GraphQLVariableInfo } from '../../services/graphql/document'

export function GraphQLVariableHints({
  variables,
  errors
}: {
  variables: GraphQLVariableInfo[]
  errors: string[]
}) {
  if (variables.length === 0 && errors.length === 0) return null
  return (
    <div className="shrink-0 space-y-1 border-b border-border/60 px-2 py-1.5">
      {variables.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Query variables">
          {variables.map((variable) => (
            <li
              key={variable.name}
              className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
            >
              ${variable.name}: {variable.type}
              {variable.required ? ' required' : variable.hasDefault ? ' default' : ''}
            </li>
          ))}
        </ul>
      )}
      {errors.map((error) => (
        <p key={error} className="text-[11px] text-destructive">
          {error}
        </p>
      ))}
    </div>
  )
}
