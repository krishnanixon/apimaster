import { useState } from 'react'
import { Plus, Trash2, ChevronRight } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Textarea } from '@/shared/components/ui/textarea'
import { Badge } from '@/shared/components/ui/badge'
import { cn } from '@/shared/lib/utils'
import { motion, AnimatePresence } from 'framer-motion'

export interface ItemField {
  key: string
  label: string
  type?: 'text' | 'textarea' | 'select'
  options?: string[]
  placeholder?: string
}

interface KnowledgeItemListProps<T extends { id: string }> {
  items: T[]
  fields: ItemField[]
  titleKey: keyof T
  onCreate: () => void
  onUpdate: (id: string, data: Partial<T>) => void
  onDelete: (id: string) => void
  emptyLabel?: string
  renderBadge?: (item: T) => React.ReactNode
}

export function KnowledgeItemList<T extends { id: string }>({
  items,
  fields,
  titleKey,
  onCreate,
  onUpdate,
  onDelete,
  emptyLabel = 'No items yet',
  renderBadge
}: KnowledgeItemListProps<T>) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Badge variant="secondary" className="font-normal">
          {items.length} {items.length === 1 ? 'item' : 'items'}
        </Badge>
        <Button size="sm" onClick={onCreate} className="gap-1.5">
          <Plus className="h-3.5 w-3.5" />
          Add
        </Button>
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-muted/30 px-6 py-10 text-center">
          <p className="text-sm text-muted-foreground">{emptyLabel}</p>
          <Button size="sm" variant="outline" className="mt-4 gap-1.5" onClick={onCreate}>
            <Plus className="h-3.5 w-3.5" />
            Create first item
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <AnimatePresence>
            {items.map((item) => {
              const isExpanded = expandedId === item.id
              return (
                <motion.div
                  key={item.id}
                  layout
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  className={cn(
                    'overflow-hidden rounded-lg border bg-card shadow-sm transition-shadow',
                    isExpanded && 'ring-1 ring-ring/20'
                  )}
                >
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : item.id)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-accent/30"
                  >
                    <ChevronRight
                      className={cn(
                        'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
                        isExpanded && 'rotate-90'
                      )}
                    />
                    <span className="flex-1 truncate font-medium">
                      {String(item[titleKey] ?? 'Untitled')}
                    </span>
                    {renderBadge?.(item)}
                  </button>

                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      className="border-t bg-muted/20 px-4 py-4"
                    >
                      <div className="space-y-3">
                        {fields.map((field) => (
                          <div key={field.key}>
                            <label className="mb-1 block text-xs font-medium text-muted-foreground">
                              {field.label}
                            </label>
                            {field.type === 'textarea' ? (
                              <Textarea
                                value={String((item as Record<string, unknown>)[field.key] ?? '')}
                                onChange={(e) =>
                                  onUpdate(item.id, { [field.key]: e.target.value } as Partial<T>)
                                }
                                placeholder={field.placeholder}
                                className="min-h-[80px] resize-none text-sm"
                              />
                            ) : field.type === 'select' && field.options ? (
                              <select
                                value={String((item as Record<string, unknown>)[field.key] ?? '')}
                                onChange={(e) =>
                                  onUpdate(item.id, { [field.key]: e.target.value } as Partial<T>)
                                }
                                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                              >
                                {field.options.map((opt) => (
                                  <option key={opt} value={opt}>
                                    {opt}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <Input
                                value={String((item as Record<string, unknown>)[field.key] ?? '')}
                                onChange={(e) =>
                                  onUpdate(item.id, { [field.key]: e.target.value } as Partial<T>)
                                }
                                placeholder={field.placeholder}
                                className="text-sm"
                              />
                            )}
                          </div>
                        ))}
                        <div className="flex justify-end pt-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive hover:text-destructive"
                            onClick={() => onDelete(item.id)}
                          >
                            <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                            Delete
                          </Button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </motion.div>
              )
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}

export function PriorityBadge({ value }: { value: string }) {
  const colors: Record<string, string> = {
    high: 'bg-red-500/10 text-red-600 dark:text-red-400',
    medium: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    low: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
  }
  return (
    <Badge variant="secondary" className={cn('text-[10px] capitalize', colors[value] ?? '')}>
      {value}
    </Badge>
  )
}
