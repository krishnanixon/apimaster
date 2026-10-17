import type { ReactNode } from 'react'
import { Copy, X } from 'lucide-react'
import { toast } from 'sonner'
import type { DetectedEndpoint } from '@shared/types/code-scanner'
import { diffToMarkdown, isEmptyDiff, type ScanDiff } from '@shared/lib/code-scanner/scan-diff'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { Card } from '@/shared/components/ui/card'
import { METHOD_COLORS } from '@/modules/api-studio/types/api.types'
import { cn } from '@/shared/lib/utils'

function EndpointLabel({ endpoint }: { endpoint: DetectedEndpoint }) {
  const method = endpoint.graphql ? 'GQL' : endpoint.method
  return (
    <span className="font-mono text-xs">
      <span className={cn('mr-2 font-semibold', METHOD_COLORS[method])}>{method}</span>
      {endpoint.path}
    </span>
  )
}

/** API changes between two scans, with breaking changes called out and a Markdown copy for PRs. */
export function ScanDiffPanel({
  title,
  diff,
  actions,
  onClose
}: {
  title: string
  diff: ScanDiff
  actions?: ReactNode
  onClose: () => void
}) {
  const copy = () => {
    void navigator.clipboard.writeText(diffToMarkdown(diff, title)).then(
      () => toast.success('Copied the changelog as Markdown'),
      () => toast.error('Could not copy to the clipboard')
    )
  }
  return (
    <Card className="space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-medium">{title}</p>
        {isEmptyDiff(diff) ? (
          <Badge variant="outline">No API changes</Badge>
        ) : (
          <>
            {diff.breakingCount > 0 && (
              <Badge variant="destructive">
                {diff.breakingCount} breaking {diff.breakingCount === 1 ? 'change' : 'changes'}
              </Badge>
            )}
            <span className="text-xs text-muted-foreground">
              {diff.added.length} added · {diff.removed.length} removed · {diff.changed.length} changed
            </span>
          </>
        )}
        <div className="ml-auto flex items-center gap-1">
          {actions}
          {!isEmptyDiff(diff) && (
            <Button size="sm" variant="ghost" onClick={copy} title="Copy as Markdown, e.g. for a pull request description">
              <Copy className="h-3.5 w-3.5" /> Copy
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={onClose} aria-label="Close">
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      {!isEmptyDiff(diff) && (
        <ul className="max-h-72 space-y-2 overflow-auto text-xs">
          {diff.removed.map((e) => (
            <li key={`r-${e.id}`} className="flex items-center gap-2">
              <Badge variant="destructive" className="text-[10px]">
                Removed
              </Badge>
              <EndpointLabel endpoint={e} />
            </li>
          ))}
          {diff.added.map((e) => (
            <li key={`a-${e.id}`} className="flex items-center gap-2">
              <Badge variant="success" className="text-[10px]">
                Added
              </Badge>
              <EndpointLabel endpoint={e} />
            </li>
          ))}
          {diff.changed.map(({ endpoint, changes }) => (
            <li key={`c-${endpoint.id}`} className="space-y-1">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-[10px]">
                  Changed
                </Badge>
                <EndpointLabel endpoint={endpoint} />
              </div>
              <ul className="ml-[4.5rem] space-y-0.5 text-muted-foreground">
                {changes.map((c, i) => (
                  <li key={i} className={cn(c.breaking && 'text-destructive')}>
                    {c.breaking ? 'Breaking: ' : ''}
                    {c.text.replace(/`/g, '')}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
