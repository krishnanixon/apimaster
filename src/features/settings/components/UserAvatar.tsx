import { User } from 'lucide-react'
import { profileInitials } from '@shared/lib/profile'
import { cn } from '@/shared/lib/utils'

/** Stable hue per name so the initials fallback always gets the same color. */
function nameHue(name: string): number {
  let hash = 0
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) | 0
  return Math.abs(hash) % 360
}

export function UserAvatar({
  name,
  src,
  size = 32,
  className
}: {
  name: string
  src?: string | null
  /** Diameter in px */
  size?: number
  className?: string
}) {
  const initials = profileInitials(name)
  const dims = { width: size, height: size }
  const base = cn(
    'relative flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full',
    className
  )

  if (src) {
    return <img src={src} alt={name ? `${name}'s avatar` : 'Avatar'} className={cn(base, 'object-cover')} style={dims} />
  }

  if (!initials) {
    return (
      <span className={cn(base, 'bg-muted text-muted-foreground')} style={dims} aria-hidden>
        <User className="h-1/2 w-1/2" />
      </span>
    )
  }

  const hue = nameHue(name)
  return (
    <span
      className={cn(base, 'font-semibold text-white')}
      style={{
        ...dims,
        fontSize: Math.max(10, Math.round(size * 0.38)),
        background: `linear-gradient(135deg, hsl(${hue} 70% 55%), hsl(${(hue + 40) % 360} 70% 42%))`
      }}
      aria-label={name}
    >
      {initials}
    </span>
  )
}
