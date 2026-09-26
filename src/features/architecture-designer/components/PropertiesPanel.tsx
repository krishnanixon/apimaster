import { useCallback } from 'react'
import { Plus, Trash2, X } from 'lucide-react'
import type { ArchComponent, ArchConnection } from '@shared/types/architecture'
import {
  ARCH_CONNECTION_KINDS,
  getComponentKindMeta,
  getConnectionKindMeta
} from '@shared/lib/architecture-catalog'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Textarea } from '@/shared/components/ui/textarea'
import { useArchitectureEditorStore } from '../stores/architecture-editor.store'
import { DynamicIcon } from '../lib/dynamic-icon'
import { cn } from '@/shared/lib/utils'

export function PropertiesPanel() {
  const { model, selectedComponentIds, selectedConnectionId, dispatch, clearSelection } =
    useArchitectureEditorStore()

  const component =
    selectedComponentIds.length === 1
      ? model.components.find((c) => c.id === selectedComponentIds[0])
      : undefined
  const connection = selectedConnectionId
    ? model.connections.find((c) => c.id === selectedConnectionId)
    : undefined

  return (
    <aside className="flex h-full flex-col overflow-hidden border-l border-border/70 bg-background">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-border/60 px-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Properties
        </p>
        {(component || connection) && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={clearSelection}
            aria-label="Clear selection"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {component ? (
          <ComponentProperties key={component.id} component={component} dispatch={dispatch} />
        ) : connection ? (
          <ConnectionProperties key={connection.id} connection={connection} model={model} dispatch={dispatch} />
        ) : (
          <div className="px-3 py-8 text-center">
            <p className="text-[12px] text-muted-foreground">
              {selectedComponentIds.length > 1
                ? `${selectedComponentIds.length} components selected`
                : 'Select a module on the diagram to edit it here.'}
            </p>
          </div>
        )}
      </div>
    </aside>
  )
}

type Dispatch = ReturnType<typeof useArchitectureEditorStore.getState>['dispatch']

function ComponentProperties({
  component,
  dispatch
}: {
  component: ArchComponent
  dispatch: Dispatch
}) {
  const meta = getComponentKindMeta(component.kind)

  const patch = useCallback(
    (update: Partial<ArchComponent>) =>
      dispatch({ type: 'UPDATE_COMPONENT', componentId: component.id, patch: update }),
    [dispatch, component.id]
  )

  return (
    <div className="flex flex-col gap-4 p-3">
      <div className="flex items-center gap-2">
        <div
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
          style={{ backgroundColor: `${meta?.color ?? '#64748b'}1a`, color: meta?.color ?? '#64748b' }}
        >
          <DynamicIcon name={meta?.icon} className="h-3.5 w-3.5" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-[12px] font-medium">{meta?.label ?? component.kind}</p>
          <p className="truncate text-[11px] capitalize text-muted-foreground">{component.category}</p>
        </div>
      </div>

      <Field label="Name">
        <Input
          value={component.name}
          onChange={(e) => patch({ name: e.target.value })}
          className="h-7 text-[12px]"
        />
      </Field>

      <Field label="Technology">
        <Input
          value={component.technology}
          onChange={(e) => patch({ technology: e.target.value })}
          placeholder="e.g. Node.js"
          className="h-7 text-[12px]"
        />
      </Field>

      <Field label="Description">
        <Textarea
          value={component.description}
          onChange={(e) => patch({ description: e.target.value })}
          rows={3}
          className="resize-none text-[12px]"
        />
      </Field>

      <ListField
        label="Responsibilities"
        items={component.responsibilities}
        placeholder="Add a responsibility"
        onChange={(responsibilities) => patch({ responsibilities })}
      />

      <ListField
        label="Inputs"
        items={component.inputs}
        placeholder="Add an input"
        onChange={(inputs) => patch({ inputs })}
      />

      <ListField
        label="Outputs"
        items={component.outputs}
        placeholder="Add an output"
        onChange={(outputs) => patch({ outputs })}
      />

      <div className="flex flex-col gap-2">
        <FieldLabel>API</FieldLabel>
        {component.apis.length === 0 && (
          <p className="text-[11px] text-muted-foreground">No endpoints defined.</p>
        )}
        {component.apis.map((api) => (
          <div key={api.id} className="flex items-center gap-1.5">
            <span className="w-12 shrink-0 truncate rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase">
              {api.method}
            </span>
            <span className="min-w-0 flex-1 truncate font-mono text-[11px]">{api.path}</span>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0"
              onClick={() => dispatch({ type: 'REMOVE_API', componentId: component.id, apiId: api.id })}
              aria-label={`Remove ${api.method} ${api.path}`}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        ))}
        <ApiAdder
          onAdd={(method, path) =>
            dispatch({ type: 'ADD_API', componentId: component.id, api: { method, path } })
          }
        />
      </div>

      <Field label="Authentication">
        <Input
          value={component.security.authentication ?? ''}
          onChange={(e) => patch({ security: { ...component.security, authentication: e.target.value } })}
          placeholder="e.g. JWT bearer token"
          className="h-7 text-[12px]"
        />
      </Field>

      <Field label="Authorization">
        <Input
          value={component.security.authorization ?? ''}
          onChange={(e) => patch({ security: { ...component.security, authorization: e.target.value } })}
          placeholder="e.g. Role-based"
          className="h-7 text-[12px]"
        />
      </Field>

      <ListField
        label="Environments"
        items={component.environments}
        placeholder="e.g. production"
        onChange={(environments) => patch({ environments })}
      />

      <ListField
        label="Tags"
        items={component.tags}
        placeholder="Add a tag"
        onChange={(tags) => patch({ tags })}
      />

      <Field label="Notes">
        <Textarea
          value={component.notes}
          onChange={(e) => patch({ notes: e.target.value })}
          rows={3}
          className="resize-none text-[12px]"
        />
      </Field>

      <Button
        variant="outline"
        size="sm"
        className="h-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
        onClick={() => dispatch({ type: 'REMOVE_COMPONENT', componentId: component.id })}
      >
        <Trash2 className="h-3.5 w-3.5" />
        Delete component
      </Button>
    </div>
  )
}

function ConnectionProperties({
  connection,
  model,
  dispatch
}: {
  connection: ArchConnection
  model: { components: ArchComponent[] }
  dispatch: Dispatch
}) {
  const from = model.components.find((c) => c.id === connection.from)
  const to = model.components.find((c) => c.id === connection.to)
  const meta = getConnectionKindMeta(connection.kind)

  const patch = useCallback(
    (update: Partial<ArchConnection>) =>
      dispatch({ type: 'UPDATE_CONNECTION', connectionId: connection.id, patch: update }),
    [dispatch, connection.id]
  )

  return (
    <div className="flex flex-col gap-4 p-3">
      <div className="rounded-md border border-border/60 bg-muted/40 p-2 text-[12px]">
        <span className="font-medium">{from?.name ?? 'Unknown'}</span>
        <span className="mx-1.5 text-muted-foreground">to</span>
        <span className="font-medium">{to?.name ?? 'Unknown'}</span>
      </div>

      <Field label="Type">
        <select
          value={connection.kind}
          onChange={(e) => patch({ kind: e.target.value as ArchConnection['kind'] })}
          className="ui-control-sm w-full rounded-md border border-input bg-background text-[12px]"
        >
          {ARCH_CONNECTION_KINDS.map((kind) => (
            <option key={kind.kind} value={kind.kind}>
              {kind.label}
            </option>
          ))}
        </select>
        {meta && <p className="mt-1 text-[11px] text-muted-foreground">{meta.description}</p>}
      </Field>

      <Field label="Label">
        <Input
          value={connection.label}
          onChange={(e) => patch({ label: e.target.value })}
          placeholder="e.g. Fetch orders"
          className="h-7 text-[12px]"
        />
      </Field>

      <Field label="Authentication">
        <Input
          value={connection.auth}
          onChange={(e) => patch({ auth: e.target.value })}
          placeholder="e.g. mTLS"
          className="h-7 text-[12px]"
        />
      </Field>

      <Field label="Payload">
        <Input
          value={connection.dataShape}
          onChange={(e) => patch({ dataShape: e.target.value })}
          placeholder="e.g. Order JSON"
          className="h-7 text-[12px]"
        />
      </Field>

      <label className="flex items-center gap-2 text-[12px]">
        <input
          type="checkbox"
          checked={connection.async}
          onChange={(e) => patch({ async: e.target.checked })}
          className="h-3.5 w-3.5 rounded border-input"
        />
        Asynchronous
      </label>

      <label className="flex items-center gap-2 text-[12px]">
        <input
          type="checkbox"
          checked={connection.bidirectional}
          onChange={(e) => patch({ bidirectional: e.target.checked })}
          className="h-3.5 w-3.5 rounded border-input"
        />
        Bidirectional
      </label>

      <Button
        variant="outline"
        size="sm"
        className="h-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
        onClick={() => dispatch({ type: 'DISCONNECT_COMPONENTS', connectionId: connection.id })}
      >
        <Trash2 className="h-3.5 w-3.5" />
        Remove connection
      </Button>
    </div>
  )
}

/* ------------------------------------------------------------------ helpers */

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </span>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <FieldLabel>{label}</FieldLabel>
      {children}
    </label>
  )
}

function ListField({
  label,
  items,
  placeholder,
  onChange
}: {
  label: string
  items: string[]
  placeholder: string
  onChange: (items: string[]) => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <FieldLabel>{label}</FieldLabel>
      {items.map((item, index) => (
        <div key={`${item}-${index}`} className="flex items-center gap-1.5">
          <Input
            value={item}
            onChange={(e) => {
              const next = [...items]
              next[index] = e.target.value
              onChange(next)
            }}
            className="h-7 text-[12px]"
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0"
            onClick={() => onChange(items.filter((_, i) => i !== index))}
            aria-label={`Remove ${item || 'item'}`}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      ))}
      <InlineAdder placeholder={placeholder} onAdd={(value) => onChange([...items, value])} />
    </div>
  )
}

function InlineAdder({
  placeholder,
  onAdd
}: {
  placeholder: string
  onAdd: (value: string) => void
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        const input = e.currentTarget.elements.namedItem('value') as HTMLInputElement
        const value = input.value.trim()
        if (!value) return
        onAdd(value)
        input.value = ''
      }}
      className="flex items-center gap-1.5"
    >
      <Input name="value" placeholder={placeholder} className="h-7 text-[12px]" />
      <Button type="submit" variant="ghost" size="icon" className="h-6 w-6 shrink-0" aria-label="Add">
        <Plus className="h-3.5 w-3.5" />
      </Button>
    </form>
  )
}

function ApiAdder({ onAdd }: { onAdd: (method: string, path: string) => void }) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        const form = e.currentTarget
        const method = (form.elements.namedItem('method') as HTMLSelectElement).value
        const pathInput = form.elements.namedItem('path') as HTMLInputElement
        const path = pathInput.value.trim()
        if (!path) return
        onAdd(method, path)
        pathInput.value = ''
      }}
      className="flex items-center gap-1.5"
    >
      <select
        name="method"
        defaultValue="GET"
        className={cn('ui-control-sm w-16 shrink-0 rounded-md border border-input bg-background text-[11px]')}
      >
        {['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((method) => (
          <option key={method} value={method}>
            {method}
          </option>
        ))}
      </select>
      <Input name="path" placeholder="/resource" className="h-7 font-mono text-[11px]" />
      <Button type="submit" variant="ghost" size="icon" className="h-6 w-6 shrink-0" aria-label="Add endpoint">
        <Plus className="h-3.5 w-3.5" />
      </Button>
    </form>
  )
}
