import { Sparkles } from 'lucide-react'
import { ARCH_SYSTEM_TYPES } from '@shared/lib/architecture-catalog'
import { Button } from '@/shared/components/ui/button'
import { Textarea } from '@/shared/components/ui/textarea'
import { useArchitectureEditorStore } from '../stores/architecture-editor.store'
import { SectionShell } from './SectionShell'

/**
 * The requirements text is the primary input for AI generation, so it lives on
 * the model rather than in a transient prompt box.
 */
export function RequirementsSection() {
  const { model, dispatch, setActiveSection } = useArchitectureEditorStore()

  return (
    <SectionShell
      title="Requirements"
      description="What the system must do — this is what AI generation reads from"
      actions={
        <Button size="sm" variant="outline" className="h-7" onClick={() => setActiveSection('ai-architect')}>
          <Sparkles className="h-3.5 w-3.5" />
          AI Architect
        </Button>
      }
    >
      <div className="flex max-w-3xl flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            System type
          </span>
          <select
            value={model.metadata.systemType}
            onChange={(e) =>
              dispatch({ type: 'UPDATE_METADATA', patch: { systemType: e.target.value } })
            }
            className="ui-control-sm w-full max-w-xs rounded-md border border-input bg-background text-[12px]"
          >
            {ARCH_SYSTEM_TYPES.map((type) => (
              <option key={type.id} value={type.id}>
                {type.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Summary
          </span>
          <Textarea
            value={model.metadata.description}
            onChange={(e) =>
              dispatch({ type: 'UPDATE_METADATA', patch: { description: e.target.value } })
            }
            rows={3}
            placeholder="One paragraph describing what this system is."
            className="resize-none text-[12px]"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Requirements
          </span>
          <Textarea
            value={model.metadata.requirements}
            onChange={(e) =>
              dispatch({ type: 'UPDATE_METADATA', patch: { requirements: e.target.value } })
            }
            rows={14}
            placeholder={
              'Describe the system in plain language. For example:\n\n' +
              'Build a healthcare platform with a Super Admin web app, a Care Partner mobile app, ' +
              'a Patient mobile app, a backend API, a PostgreSQL database, payments, notifications and video calling.'
            }
            className="resize-none text-[12px] leading-relaxed"
          />
          <span className="text-[11px] text-muted-foreground">
            The more concrete this is, the better the generated architecture will be.
          </span>
        </label>
      </div>
    </SectionShell>
  )
}
