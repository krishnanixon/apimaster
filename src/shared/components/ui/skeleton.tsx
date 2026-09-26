import { cn } from '@/shared/lib/utils'

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('animate-pulse rounded-md bg-muted', className)} {...props} />
}

export function SkeletonCard() {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-soft">
      <Skeleton className="mb-4 h-9 w-9 rounded-lg" />
      <Skeleton className="mb-2 h-4 w-2/3" />
      <Skeleton className="h-3 w-1/2" />
      <Skeleton className="mt-4 h-3 w-1/3" />
    </div>
  )
}
