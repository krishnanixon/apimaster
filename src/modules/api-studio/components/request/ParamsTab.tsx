import { KeyValueTable } from '../KeyValueTable'
import type { KeyValuePair } from '../../types/api.types'

interface ParamsTabProps {
  params: KeyValuePair[]
  pathParams: KeyValuePair[]
  onChange: (params: KeyValuePair[]) => void
  onPathParamsChange: (params: KeyValuePair[]) => void
}

export function ParamsTab({ params, pathParams, onChange, onPathParamsChange }: ParamsTabProps) {
  return (
    <div className="space-y-4 p-3">
      {pathParams.length > 0 && (
        <section>
          <div className="mb-1.5">
            <h3 className="text-xs font-medium text-foreground">Path variables</h3>
            <p className="text-[11px] text-muted-foreground">
              Filled from <code className="rounded bg-muted px-1">{':id'}</code> or{' '}
              <code className="rounded bg-muted px-1">{'{id}'}</code> tokens in the URL.
            </p>
          </div>
          <KeyValueTable
            pairs={pathParams}
            onChange={onPathParamsChange}
            keyPlaceholder="Variable"
            valuePlaceholder="Value"
            lockKeys
          />
        </section>
      )}

      <section>
        <div className="mb-1.5">
          <h3 className="text-xs font-medium text-foreground">Query params</h3>
          <p className="text-[11px] text-muted-foreground">Appended to the URL when the request is sent.</p>
        </div>
        <KeyValueTable pairs={params} onChange={onChange} keyPlaceholder="Param" valuePlaceholder="Value" />
      </section>
    </div>
  )
}
