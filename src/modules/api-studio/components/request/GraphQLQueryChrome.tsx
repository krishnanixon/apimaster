import { RefreshCw, Wand2 } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Spinner } from '@/shared/components/ui/spinner'
import { cn } from '@/shared/lib/utils'
import type { GraphQLOperationInfo } from '../../services/graphql/document'
import { schemaStatusLabel, type GraphQLSchemaStatus } from '../../services/graphql/schema'

interface GraphQLQueryChromeProps {
  operations: GraphQLOperationInfo[]
  operationName?: string
  onOperationName: (name: string | undefined) => void
  schemaStatus: GraphQLSchemaStatus
  schemaDetail?: string
  loading: boolean
  onFormat: () => void
  onFetchSchema: () => void
  issues: string[]
}

const STATUS_CLASS: Record<GraphQLSchemaStatus, string> = {
  available: 'text-emerald-600 dark:text-emerald-400',
  loading: 'text-muted-foreground',
  outdated: 'text-amber-600 dark:text-amber-400',
  unavailable: 'text-muted-foreground'
}

export function GraphQLQueryChrome({
  operations,
  operationName,
  onOperationName,
  schemaStatus,
  schemaDetail,
  loading,
  onFormat,
  onFetchSchema,
  issues
}: GraphQLQueryChromeProps) {
  const multiple = operations.length > 1
  const selected = multiple ? (operationName ?? '') : (operations[0]?.name ?? '')

  return (
    <div className="shrink-0 border-b border-border/60">
      <div className="flex flex-wrap items-center gap-1.5 px-2 py-1.5">
        <label className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
          Operation
          <select
            aria-label="GraphQL operation"
            className="h-7 max-w-[220px] rounded border border-border/80 bg-background px-1.5 text-xs text-foreground"
            value={selected}
            disabled={operations.length === 0}
            onChange={(event) => onOperationName(event.target.value || undefined)}
          >
            {operations.length === 0 && <option value="">No operation</option>}
            {multiple && <option value="">Select operation</option>}
            {operations.map((operation) => {
              const value = operation.name ?? ''
              const label = operation.name ? `${operation.operation} ${operation.name}` : `${operation.operation} (anonymous)`
              return (
                <option key={`${operation.operation}:${value || 'anonymous'}`} value={value}>
                  {label}
                </option>
              )
            })}
          </select>
        </label>

        <span
          className={cn('text-[11px]', STATUS_CLASS[schemaStatus])}
          title={schemaDetail || schemaStatusLabel(schemaStatus)}
          data-testid="graphql-schema-status"
        >
          {schemaStatusLabel(schemaStatus)}
        </span>

        <div className="ml-auto flex items-center gap-1">
          <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 px-2 text-[11px]" onClick={onFormat}>
            <Wand2 className="h-3 w-3" />
            Format query
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 gap-1 px-2 text-[11px]"
            onClick={onFetchSchema}
            disabled={loading}
          >
            {loading ? <Spinner size="sm" /> : <RefreshCw className="h-3 w-3" />}
            {schemaStatus === 'available' || schemaStatus === 'outdated' ? 'Refresh schema' : 'Fetch schema'}
          </Button>
        </div>
      </div>
      {issues.length > 0 && (
        <ul className="max-h-24 space-y-0.5 overflow-auto border-t border-border/50 px-2 py-1.5" aria-label="GraphQL issues">
          {issues.map((issue) => (
            <li key={issue} className="text-[11px] leading-snug text-destructive">
              {issue}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
