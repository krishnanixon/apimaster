import { cn } from '@/shared/lib/utils'

export function CodeDiffView({
  diff,
  className,
  maxHeightClass = 'max-h-64'
}: {
  diff: string
  className?: string
  maxHeightClass?: string
}) {
  if (!diff.trim()) {
    return <p className="px-3 py-2 text-xs text-muted-foreground">No textual diff.</p>
  }
  return (
    <pre className={cn('overflow-auto px-3 py-2 font-mono text-[11px] leading-4', maxHeightClass, className)}>
      {diff.split('\n').map((line, index) => (
        <div
          key={`${index}-${line.slice(0, 24)}`}
          className={cn(
            line.startsWith('+') && !line.startsWith('+++') && 'bg-emerald-500/10 text-emerald-300',
            line.startsWith('-') && !line.startsWith('---') && 'bg-red-500/10 text-red-300',
            line.startsWith('@@') && 'text-sky-300'
          )}
        >
          {line || ' '}
        </div>
      ))}
    </pre>
  )
}
