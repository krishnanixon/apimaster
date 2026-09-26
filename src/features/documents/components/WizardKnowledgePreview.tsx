import { Link } from 'react-router-dom'
import { Boxes, Sparkles, Brain, ExternalLink } from 'lucide-react'
import type { KnowledgeBundle } from '@shared/types'
import { Button } from '@/shared/components/ui/button'
import { Badge } from '@/shared/components/ui/badge'
import { Card, CardContent } from '@/shared/components/ui/card'
import { cn } from '@/shared/lib/utils'

interface WizardKnowledgePreviewProps {
  projectId: string
  bundle: KnowledgeBundle | null
  variant: 'modules' | 'features'
  onSyncText?: (text: string) => void
}

export function WizardKnowledgePreview({
  projectId,
  bundle,
  variant,
  onSyncText
}: WizardKnowledgePreviewProps) {
  const modules = bundle?.modules ?? []
  const features = bundle?.features ?? []

  if (modules.length === 0 && features.length === 0) {
    return (
      <Card className="border-dashed bg-muted/30">
        <CardContent className="flex items-start gap-3 p-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Brain className="h-4 w-4" />
          </span>
          <div className="flex-1">
            <p className="text-sm font-medium">No Knowledge Base data yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Build your knowledge base for richer, more accurate documents.
            </p>
            <Button size="sm" variant="outline" className="mt-3 gap-1.5" asChild>
              <Link to={`/project/${projectId}/knowledge`}>
                Open Knowledge Base
                <ExternalLink className="h-3 w-3" />
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (variant === 'modules') {
    const text = modules.map((m) => m.title).join('\n')
    return (
      <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium">From Knowledge Base</p>
          {onSyncText && (
            <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => onSyncText(text)}>
              Use in wizard
            </Button>
          )}
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {modules.map((m) => {
            const featCount = features.filter((f) => f.moduleId === m.id).length
            return (
              <div
                key={m.id}
                className="flex items-start gap-2 rounded-lg border bg-card p-3 shadow-sm"
              >
                <Boxes className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div className="min-w-0">
                  <p className="text-sm font-medium">{m.title}</p>
                  <p className="line-clamp-2 text-xs text-muted-foreground">{m.description}</p>
                  <Badge variant="outline" className="mt-1.5 text-[10px] font-normal">
                    {featCount} features
                  </Badge>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  const text = features
    .map((f) => {
      const mod = modules.find((m) => m.id === f.moduleId)
      return mod ? `${f.title} (${mod.title})` : f.title
    })
    .join('\n')

  return (
    <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">From Knowledge Base</p>
        {onSyncText && (
          <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => onSyncText(text)}>
            Use in wizard
          </Button>
        )}
      </div>
      {modules.map((mod) => {
        const modFeatures = features.filter((f) => f.moduleId === mod.id)
        if (modFeatures.length === 0) return null
        return (
          <div key={mod.id} className="rounded-lg border bg-card p-3 shadow-sm">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
              <Boxes className="h-3 w-3" />
              {mod.title}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {modFeatures.map((f) => (
                <span
                  key={f.id}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-md border bg-background px-2 py-1 text-xs'
                  )}
                >
                  <Sparkles className="h-2.5 w-2.5 text-primary" />
                  {f.title}
                </span>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
