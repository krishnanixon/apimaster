import { useMemo } from 'react'
import { getComponentKindMeta } from '@shared/lib/architecture-catalog'
import { useArchitectureEditorStore } from '../stores/architecture-editor.store'
import { SectionShell, SectionEmpty } from './SectionShell'
import { DynamicIcon } from '../lib/dynamic-icon'
import { Button } from '@/shared/components/ui/button'

export function ApiSection() {
  const { model, selectComponents, searchQuery } = useArchitectureEditorStore()

  const withApis = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return model.components
      .filter((c) => c.apis.length > 0)
      .map((component) => ({
        component,
        apis: q
          ? component.apis.filter((api) => `${api.method} ${api.path}`.toLowerCase().includes(q))
          : component.apis
      }))
      .filter((entry) => entry.apis.length > 0)
  }, [model.components, searchQuery])

  const total = withApis.reduce((sum, entry) => sum + entry.apis.length, 0)

  return (
    <SectionShell title="API Layer" description={`${total} endpoints across ${withApis.length} components`}>
      {withApis.length === 0 ? (
        <SectionEmpty
          title={searchQuery ? 'No matching endpoints' : 'No endpoints defined'}
          description={
            searchQuery
              ? 'Try a different search term.'
              : 'Select a component and add endpoints in the properties panel. They are stored on the component, so they travel with it everywhere.'
          }
        />
      ) : (
        <div className="flex flex-col gap-4">
          {withApis.map(({ component, apis }) => {
            const meta = getComponentKindMeta(component.kind)
            return (
              <section key={component.id} className="rounded-lg border border-border/60 bg-card">
                <header className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
                  <div
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded"
                    style={{
                      backgroundColor: `${meta?.color ?? '#64748b'}1a`,
                      color: meta?.color ?? '#64748b'
                    }}
                  >
                    <DynamicIcon name={meta?.icon} className="h-3 w-3" />
                  </div>
                  <p className="min-w-0 flex-1 truncate text-[12.5px] font-medium">{component.name}</p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[11px]"
                    onClick={() => selectComponents([component.id])}
                  >
                    Edit
                  </Button>
                </header>

                <ul className="divide-y divide-border/50">
                  {apis.map((api) => (
                    <li key={api.id} className="flex items-center gap-2.5 px-3 py-1.5">
                      <span className="w-14 shrink-0 rounded bg-muted px-1.5 py-0.5 text-center text-[10px] font-semibold uppercase">
                        {api.method}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-mono text-[11.5px]">{api.path}</span>
                      {api.auth && (
                        <span className="shrink-0 text-[10px] text-muted-foreground">{api.auth}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )
          })}
        </div>
      )}
    </SectionShell>
  )
}
