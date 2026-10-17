import { KeyValueTable } from '../KeyValueTable'
import type { InheritedHeader } from '../../services/inheritance'
import type { KeyValuePair } from '../../types/api.types'

interface HeadersTabProps {
  headers: KeyValuePair[]
  onChange: (headers: KeyValuePair[]) => void
  inheritedHeaders?: InheritedHeader[]
  /** Show the secret lock (the request is in a folder-linked collection). */
  secretToggle?: boolean
}

export function HeadersTab({ headers, onChange, inheritedHeaders = [], secretToggle = false }: HeadersTabProps) {
  return (
    <div className="space-y-4 p-3">
      {inheritedHeaders.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Inherited from parent
          </p>
          <KeyValueTable
            pairs={inheritedHeaders}
            onChange={() => undefined}
            keyPlaceholder="Header"
            valuePlaceholder="Value"
            readOnly
          />
          <p className="text-[11px] text-muted-foreground">
            Add the same header name below to override it on this request.
          </p>
        </div>
      )}
      <div className="space-y-1.5">
        {inheritedHeaders.length > 0 && (
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">This request</p>
        )}
        <KeyValueTable
          pairs={headers}
          onChange={onChange}
          keyPlaceholder="Header"
          valuePlaceholder="Value"
          secretToggle={secretToggle}
        />
      </div>
    </div>
  )
}
