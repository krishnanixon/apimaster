import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { useArchitectureEditorStore } from '../stores/architecture-editor.store'
import { SectionShell, SectionEmpty } from './SectionShell'

const SUGGESTED = ['Development', 'Staging', 'Production']

export function EnvironmentsSection() {
  const { model, dispatch } = useArchitectureEditorStore()
  const [draft, setDraft] = useState('')

  const add = (name: string) => {
    const trimmed = name.trim()
    if (!trimmed) return
    dispatch({ type: 'ADD_ENVIRONMENT', environment: { name: trimmed } })
    setDraft('')
  }

  const missing = SUGGESTED.filter(
    (name) => !model.environments.some((env) => env.name.toLowerCase() === name.toLowerCase())
  )

  return (
    <SectionShell
      title="Environments"
      description="Where this architecture is deployed"
      actions={
        <form
          onSubmit={(e) => {
            e.preventDefault()
            add(draft)
          }}
          className="flex items-center gap-1.5"
        >
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Environment name"
            className="h-7 w-40 text-[12px]"
          />
          <Button type="submit" size="sm" className="h-7" disabled={!draft.trim()}>
            <Plus className="h-3.5 w-3.5" />
            Add
          </Button>
        </form>
      }
    >
      {model.environments.length === 0 ? (
        <SectionEmpty
          title="No environments defined"
          description="Environments let you record where each component runs and which configuration it uses."
          action={
            <div className="flex gap-1.5">
              {SUGGESTED.map((name) => (
                <Button key={name} size="sm" variant="outline" onClick={() => add(name)}>
                  <Plus className="h-3.5 w-3.5" />
                  {name}
                </Button>
              ))}
            </div>
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          <ul className="flex flex-col gap-1.5">
            {model.environments.map((env) => {
              const componentCount = model.components.filter((c) =>
                c.environments.some((e) => e.toLowerCase() === env.name.toLowerCase())
              ).length

              return (
                <li
                  key={env.id}
                  className="flex items-center gap-2.5 rounded-lg border border-border/60 bg-card p-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12.5px] font-medium leading-tight">{env.name}</p>
                    <p className="text-[11px] leading-tight text-muted-foreground">
                      {componentCount} component{componentCount === 1 ? '' : 's'} assigned
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0"
                    onClick={() => dispatch({ type: 'REMOVE_ENVIRONMENT', environmentId: env.id })}
                    aria-label={`Remove ${env.name}`}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </li>
              )
            })}
          </ul>

          {missing.length > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-muted-foreground">Quick add:</span>
              {missing.map((name) => (
                <Button
                  key={name}
                  size="sm"
                  variant="outline"
                  className="h-6 text-[11px]"
                  onClick={() => add(name)}
                >
                  {name}
                </Button>
              ))}
            </div>
          )}
        </div>
      )}
    </SectionShell>
  )
}
