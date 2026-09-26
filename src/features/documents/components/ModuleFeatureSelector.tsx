import { Boxes, Check, Sparkles } from 'lucide-react'
import type { KnowledgeFeature, KnowledgeModule } from '@shared/types'
import { cn } from '@/shared/lib/utils'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { Card, CardContent } from '@/shared/components/ui/card'

interface ModuleFeatureSelectorProps {
  modules: KnowledgeModule[]
  features: KnowledgeFeature[]
  selectedModuleIds: string[]
  selectedFeatureIds: string[]
  onModuleToggle: (id: string) => void
  onFeatureToggle: (id: string) => void
  onSelectAllModules: () => void
  onClearModules: () => void
  onSelectAllFeatures: () => void
  onClearFeatures: () => void
}

export function ModuleFeatureSelector({
  modules,
  features,
  selectedModuleIds,
  selectedFeatureIds,
  onModuleToggle,
  onFeatureToggle,
  onSelectAllModules,
  onClearModules,
  onSelectAllFeatures,
  onClearFeatures
}: ModuleFeatureSelectorProps) {
  const hasKb = modules.length > 0 || features.length > 0

  if (!hasKb) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center py-8 text-center">
          <Boxes className="h-8 w-8 text-muted-foreground/50" />
          <p className="mt-3 max-w-sm text-sm text-muted-foreground">
            No modules or features in Knowledge Base yet. Add them under Knowledge Base, or enter
            modules/features in earlier wizard steps.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {modules.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Boxes className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">Modules in scope</span>
                <Badge variant="secondary" className="text-[10px] font-normal">
                  {selectedModuleIds.length}/{modules.length}
                </Badge>
              </div>
              <div className="flex gap-1">
                <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={onSelectAllModules}>
                  All
                </Button>
                <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={onClearModules}>
                  None
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {modules.map((m) => {
                const selected = selectedModuleIds.includes(m.id)
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => onModuleToggle(m.id)}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-left text-sm transition-all',
                      selected
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border text-muted-foreground hover:bg-accent'
                    )}
                  >
                    {selected && <Check className="h-3 w-3 shrink-0" />}
                    {m.title}
                  </button>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {features.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">Features in scope</span>
                <Badge variant="secondary" className="text-[10px] font-normal">
                  {selectedFeatureIds.length}/{features.length}
                </Badge>
              </div>
              <div className="flex gap-1">
                <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={onSelectAllFeatures}>
                  All
                </Button>
                <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={onClearFeatures}>
                  None
                </Button>
              </div>
            </div>
            <div className="space-y-3">
              {modules.length > 0
                ? modules.map((mod) => {
                    const modFeatures = features.filter((f) => f.moduleId === mod.id)
                    if (modFeatures.length === 0) return null
                    return (
                      <div key={mod.id}>
                        <p className="mb-1.5 text-xs font-medium text-muted-foreground">{mod.title}</p>
                        <div className="flex flex-wrap gap-1.5">
                          {modFeatures.map((f) => {
                            const selected = selectedFeatureIds.includes(f.id)
                            return (
                              <button
                                key={f.id}
                                type="button"
                                onClick={() => onFeatureToggle(f.id)}
                                className={cn(
                                  'inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs transition-all',
                                  selected
                                    ? 'border-primary bg-primary/10 text-primary'
                                    : 'border-border text-muted-foreground hover:bg-accent'
                                )}
                              >
                                {selected && <Check className="h-2.5 w-2.5" />}
                                {f.title}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })
                : null}
              {features.filter((f) => !f.moduleId).length > 0 && (
                <div>
                  <p className="mb-1.5 text-xs font-medium text-muted-foreground">Unassigned</p>
                  <div className="flex flex-wrap gap-1.5">
                    {features
                      .filter((f) => !f.moduleId)
                      .map((f) => {
                        const selected = selectedFeatureIds.includes(f.id)
                        return (
                          <button
                            key={f.id}
                            type="button"
                            onClick={() => onFeatureToggle(f.id)}
                            className={cn(
                              'inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs transition-all',
                              selected
                                ? 'border-primary bg-primary/10 text-primary'
                                : 'border-border text-muted-foreground hover:bg-accent'
                            )}
                          >
                            {selected && <Check className="h-2.5 w-2.5" />}
                            {f.title}
                          </button>
                        )
                      })}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
