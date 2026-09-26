import type { GraphQLResponseInfo } from '../../types/api.types'

export function GraphQLErrorsView({ info }: { info: GraphQLResponseInfo }) {
  if (info.parseError && info.errors.length === 0) {
    return <p className="p-3 text-xs text-muted-foreground">{info.parseError}</p>
  }
  if (info.errors.length === 0) {
    return <p className="p-3 text-xs text-muted-foreground">No GraphQL errors.</p>
  }
  return (
    <ul className="h-full space-y-2 overflow-auto p-3" aria-label="GraphQL errors">
      {info.errors.map((error, index) => (
        <li key={`${error.message}-${index}`} className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2">
          <p className="text-xs font-medium text-destructive">{error.message}</p>
          {error.path && error.path.length > 0 && (
            <p className="mt-1 font-mono text-[10px] text-muted-foreground">{error.path.join('.')}</p>
          )}
          {error.locations && error.locations.length > 0 && (
            <p className="mt-1 text-[10px] text-muted-foreground">
              {error.locations.map((location) => `line ${location.line}, column ${location.column}`).join(' · ')}
            </p>
          )}
        </li>
      ))}
    </ul>
  )
}
