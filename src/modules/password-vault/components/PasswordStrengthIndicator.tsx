import { cn } from '@/shared/lib/utils'
import { strengthColor } from '../stores/vault.store'

interface PasswordStrengthIndicatorProps {
  score: number
  className?: string
}

export function PasswordStrengthIndicator({ score, className }: PasswordStrengthIndicatorProps) {
  const max = 10
  const pct = Math.min(100, (score / max) * 100)
  const label =
    score <= 2 ? 'Weak' : score <= 4 ? 'Fair' : score <= 6 ? 'Good' : score <= 8 ? 'Strong' : 'Excellent'

  return (
    <div className={cn('space-y-1', className)}>
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Strength</span>
        <span className="font-medium">{label}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={cn('h-full rounded-full transition-all', strengthColor(score))}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
