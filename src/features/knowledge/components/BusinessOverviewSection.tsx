import { useEffect, useState, useCallback } from 'react'
import type { RequirementKnowledge } from '@shared/types'
import { Textarea } from '@/shared/components/ui/textarea'
import { Input } from '@/shared/components/ui/input'
import { useDebouncedSave } from '../hooks/useDebouncedSave'

interface BusinessOverviewSectionProps {
  overview: RequirementKnowledge | null
  projectId: string
  onSave: (data: Partial<RequirementKnowledge>) => Promise<void>
}

export function BusinessOverviewSection({
  overview,
  onSave
}: BusinessOverviewSectionProps) {
  const [form, setForm] = useState({
    projectSummary: '',
    targetUsers: '',
    scope: '',
    goals: ''
  })

  useEffect(() => {
    if (overview) {
      setForm({
        projectSummary: overview.projectSummary,
        targetUsers: overview.targetUsers,
        scope: overview.scope,
        goals: formatJsonLines(overview.goals)
      })
    }
  }, [overview])

  const handleSave = useCallback(
    async (data: typeof form) => {
      await onSave({
        projectSummary: data.projectSummary,
        targetUsers: data.targetUsers,
        scope: data.scope,
        goals: JSON.stringify(
          data.goals.split('\n').map((l) => l.trim()).filter(Boolean)
        )
      })
    },
    [onSave]
  )

  useDebouncedSave(form, handleSave, 1000, !!overview)

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <label className="text-sm font-medium">What is this project about?</label>
        <Textarea
          value={form.projectSummary}
          onChange={(e) => setForm((f) => ({ ...f, projectSummary: e.target.value }))}
          placeholder="Brief summary in 1–2 sentences"
          className="min-h-[80px] resize-none"
          rows={3}
        />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium">Who will use it?</label>
        <Input
          value={form.targetUsers}
          onChange={(e) => setForm((f) => ({ ...f, targetUsers: e.target.value }))}
          placeholder="e.g. clinic staff, patients, admins"
        />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium">What&apos;s in scope?</label>
        <Textarea
          value={form.scope}
          onChange={(e) => setForm((f) => ({ ...f, scope: e.target.value }))}
          placeholder="Main areas or features to cover"
          className="min-h-[72px] resize-none"
          rows={2}
        />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium">Key goals</label>
        <p className="text-xs text-muted-foreground">One per line, optional</p>
        <Textarea
          value={form.goals}
          onChange={(e) => setForm((f) => ({ ...f, goals: e.target.value }))}
          placeholder={'Define requirements\nLaunch MVP'}
          className="min-h-[72px] resize-none"
          rows={3}
        />
      </div>
    </div>
  )
}

function formatJsonLines(json: string): string {
  try {
    const arr = JSON.parse(json)
    return Array.isArray(arr) ? arr.join('\n') : json
  } catch {
    return json
  }
}
