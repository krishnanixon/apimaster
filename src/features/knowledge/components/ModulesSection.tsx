import { motion, AnimatePresence } from 'framer-motion'
import {
  Boxes,
  ChevronRight,
  Plus,
  Sparkles,
  Trash2,
  Pencil,
  Check,
  X
} from 'lucide-react'
import { useState } from 'react'
import type { KnowledgeFeature, KnowledgeModule } from '@shared/types'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Textarea } from '@/shared/components/ui/textarea'
import { Badge } from '@/shared/components/ui/badge'
import { cn } from '@/shared/lib/utils'

interface ModulesSectionProps {
  modules: KnowledgeModule[]
  features: KnowledgeFeature[]
  onCreateModule: () => void
  onUpdateModule: (id: string, data: Partial<KnowledgeModule>) => void
  onDeleteModule: (id: string) => void
  onCreateFeature: (moduleId: string) => void
  onUpdateFeature: (id: string, data: Partial<KnowledgeFeature>) => void
  onDeleteFeature: (id: string) => void
}

export function ModulesSection({
  modules,
  features,
  onCreateModule,
  onUpdateModule,
  onDeleteModule,
  onCreateFeature,
  onUpdateFeature,
  onDeleteFeature
}: ModulesSectionProps) {
  const [expandedId, setExpandedId] = useState<string | null>(modules[0]?.id ?? null)
  const [editingModuleId, setEditingModuleId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<Partial<KnowledgeModule>>({})

  const startEdit = (mod: KnowledgeModule) => {
    setEditingModuleId(mod.id)
    setEditDraft({
      title: mod.title,
      description: mod.description
    })
  }

  const saveEdit = (id: string) => {
    onUpdateModule(id, editDraft)
    setEditingModuleId(null)
  }

  if (modules.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-muted/40 p-10 text-center">
        <Boxes className="mx-auto h-10 w-10 text-muted-foreground/50" />
        <h3 className="mt-4 text-lg font-semibold">No modules yet</h3>
        <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
          Group your system into areas like Billing, Appointments, or Admin.
        </p>
        <Button className="mt-6 gap-1.5" onClick={onCreateModule}>
          <Plus className="h-4 w-4" />
          Add Module
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {modules.length} modules · {features.length} features
        </p>
        <Button size="sm" onClick={onCreateModule} className="gap-1.5">
          <Plus className="h-3.5 w-3.5" />
          New Module
        </Button>
      </div>

      <div className="grid gap-3">
        {modules.map((mod) => {
          const modFeatures = features.filter((f) => f.moduleId === mod.id)
          const isExpanded = expandedId === mod.id
          const isEditing = editingModuleId === mod.id

          return (
            <motion.div
              key={mod.id}
              layout
              className={cn(
                'overflow-hidden rounded-2xl border transition-shadow',
                isExpanded ? 'border-primary/30 shadow-sm' : 'border-border/60'
              )}
            >
              <div className="flex items-start gap-3 p-4">
                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : mod.id)}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"
                >
                  <Boxes className="h-5 w-5" />
                </button>

                <div className="min-w-0 flex-1">
                  {isEditing ? (
                    <div className="space-y-2">
                      <Input
                        value={editDraft.title ?? ''}
                        onChange={(e) => setEditDraft((d) => ({ ...d, title: e.target.value }))}
                        className="font-medium"
                      />
                      <Textarea
                        value={editDraft.description ?? ''}
                        onChange={(e) => setEditDraft((d) => ({ ...d, description: e.target.value }))}
                        rows={2}
                        placeholder="Short description (optional)"
                        className="resize-none text-sm"
                      />
                    </div>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => setExpandedId(isExpanded ? null : mod.id)}
                        className="flex w-full items-center gap-2 text-left"
                      >
                        <h3 className="truncate text-base font-semibold">{mod.title}</h3>
                        <ChevronRight
                          className={cn(
                            'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
                            isExpanded && 'rotate-90'
                          )}
                        />
                      </button>
                      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                        {mod.description || 'No description'}
                      </p>
                      {modFeatures.length > 0 && (
                        <Badge variant="outline" className="mt-2 text-[10px]">
                          <Sparkles className="mr-1 h-2.5 w-2.5" />
                          {modFeatures.length} features
                        </Badge>
                      )}
                    </>
                  )}
                </div>

                <div className="flex shrink-0 gap-1">
                  {isEditing ? (
                    <>
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => saveEdit(mod.id)}>
                        <Check className="h-4 w-4 text-emerald-500" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditingModuleId(null)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => startEdit(mod)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => onDeleteModule(mod.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              </div>

              <AnimatePresence>
                {isExpanded && !isEditing && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="border-t border-border/60 bg-muted/20"
                  >
                    <div className="p-4 pt-3">
                      <div className="mb-3 flex items-center justify-between">
                        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          Features
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 gap-1 text-xs"
                          onClick={() => onCreateFeature(mod.id)}
                        >
                          <Plus className="h-3 w-3" />
                          Add Feature
                        </Button>
                      </div>

                      {modFeatures.length === 0 ? (
                        <p className="rounded-lg border border-dashed border-border/60 py-6 text-center text-xs text-muted-foreground">
                          No features in this module
                        </p>
                      ) : (
                        <div className="grid gap-2 sm:grid-cols-2">
                          {modFeatures.map((feat) => (
                            <FeatureChip
                              key={feat.id}
                              feature={feat}
                              onUpdate={onUpdateFeature}
                              onDelete={onDeleteFeature}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )
        })}
      </div>

      {features.filter((f) => !f.moduleId).length > 0 && (
        <div className="rounded-xl border border-border/60 p-4">
          <p className="mb-2 text-xs font-medium text-muted-foreground">Unassigned features</p>
          <div className="flex flex-wrap gap-2">
            {features
              .filter((f) => !f.moduleId)
              .map((f) => (
                <FeatureChip key={f.id} feature={f} onUpdate={onUpdateFeature} onDelete={onDeleteFeature} />
              ))}
          </div>
        </div>
      )}
    </div>
  )
}

function FeatureChip({
  feature,
  onUpdate,
  onDelete
}: {
  feature: KnowledgeFeature
  onUpdate: (id: string, data: Partial<KnowledgeFeature>) => void
  onDelete: (id: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(feature.title)

  const save = () => {
    onUpdate(feature.id, { title })
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="col-span-full rounded-lg border border-primary/30 bg-background p-3 space-y-2">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} className="h-8 text-sm" placeholder="Feature name" />
        <div className="flex justify-end gap-1">
          <Button size="sm" variant="ghost" className="h-7" onClick={() => setEditing(false)}>
            Cancel
          </Button>
          <Button size="sm" className="h-7" onClick={save}>
            Save
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="group flex items-start justify-between gap-2 rounded-lg border border-border/50 bg-background/80 px-3 py-2 transition-colors hover:border-border">
      <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setEditing(true)}>
        <p className="truncate text-sm font-medium">{feature.title}</p>
      </button>
      <Button
        size="icon"
        variant="ghost"
        className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100"
        onClick={() => onDelete(feature.id)}
      >
        <Trash2 className="h-3 w-3 text-muted-foreground" />
      </Button>
    </div>
  )
}
