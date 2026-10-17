import { useEffect, useState } from 'react'
import { GitMerge } from 'lucide-react'
import type { MergeItem, MergePlan, MergeStatus } from '@shared/lib/code-scanner/merge-collection'
import { Button } from '@/shared/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog'
import { METHOD_COLORS } from '@/modules/api-studio/types/api.types'
import { cn } from '@/shared/lib/utils'

const GROUPS: Array<{ status: MergeStatus; title: string; hint: string }> = [
  { status: 'added', title: 'New in the code', hint: 'Added to the collection.' },
  { status: 'updated', title: 'Changed in the code', hint: 'Updated; values you filled in are kept.' },
  {
    status: 'conflict',
    title: 'Changed in the code and edited by you',
    hint: 'Unticked keeps your version. Ticked applies the code change, still keeping values you filled in.'
  },
  { status: 'removed', title: 'No longer in the code', hint: 'Unticked keeps the request. Ticked deletes it.' }
]

interface MergeDialogProps {
  collectionName: string | null
  plan: MergePlan | null
  initial: Set<string>
  onCancel: () => void
  onApply: (accepted: Set<string>) => void
}

export function MergeDialog({ collectionName, plan, initial, onCancel, onApply }: MergeDialogProps) {
  const [accepted, setAccepted] = useState<Set<string>>(initial)
  useEffect(() => setAccepted(new Set(initial)), [initial])

  const toggle = (key: string, on: boolean) =>
    setAccepted((current) => {
      const next = new Set(current)
      if (on) next.add(key)
      else next.delete(key)
      return next
    })

  const changes = plan?.items.length ?? 0
  return (
    <Dialog open={Boolean(plan)} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <GitMerge className="h-4 w-4 text-primary" /> Update “{collectionName}” from the code
          </DialogTitle>
          <DialogDescription className="text-xs">
            {changes === 0
              ? 'The collection already matches the code.'
              : `${changes} ${changes === 1 ? 'change' : 'changes'} found.`}
            {plan && plan.unchanged > 0 && ` ${plan.unchanged} unchanged.`}
            {plan && plan.untracked > 0 && ` ${plan.untracked} requests you added yourself are left alone.`}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[55vh] space-y-4 overflow-y-auto pr-1">
          {GROUPS.map(({ status, title, hint }) => {
            const items = plan?.items.filter((i) => i.status === status) ?? []
            if (items.length === 0) return null
            return (
              <section key={status}>
                <div className="mb-1 flex items-baseline justify-between gap-3">
                  <h3 className="text-xs font-semibold">
                    {title} <span className="font-normal text-muted-foreground">({items.length})</span>
                  </h3>
                  <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <input
                      type="checkbox"
                      className="h-3 w-3 accent-primary"
                      checked={items.every((i) => accepted.has(i.key))}
                      onChange={(e) => items.forEach((i) => toggle(i.key, e.target.checked))}
                    />
                    All
                  </label>
                </div>
                <p className="mb-1.5 text-[11px] text-muted-foreground">{hint}</p>
                <ul className="divide-y divide-border rounded-md border border-border">
                  {items.map((item) => (
                    <MergeRow key={item.key} item={item} checked={accepted.has(item.key)} onChange={(on) => toggle(item.key, on)} />
                  ))}
                </ul>
              </section>
            )
          })}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" className="h-8" onClick={onCancel}>
            Cancel
          </Button>
          <Button size="sm" className="h-8" disabled={accepted.size === 0} onClick={() => onApply(accepted)}>
            Apply {accepted.size} {accepted.size === 1 ? 'change' : 'changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function MergeRow({ item, checked, onChange }: { item: MergeItem; checked: boolean; onChange: (on: boolean) => void }) {
  return (
    <li>
      <label className="flex cursor-pointer items-center gap-2.5 px-2.5 py-1.5 hover:bg-accent/40">
        <input type="checkbox" className="h-3.5 w-3.5 accent-primary" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className={cn('w-12 shrink-0 font-mono text-[11px] font-semibold', METHOD_COLORS[item.method])}>{item.method}</span>
        <span className="min-w-0 flex-1 truncate font-mono text-xs" title={item.url}>
          {item.url.replace(/^\{\{baseUrl\}\}/, '')}
        </span>
        <span className="hidden max-w-[12rem] shrink-0 truncate text-[11px] text-muted-foreground sm:inline">{item.name}</span>
      </label>
    </li>
  )
}
