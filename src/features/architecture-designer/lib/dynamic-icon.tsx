import * as LucideIcons from 'lucide-react'

function isIconComponent(value: unknown): value is React.ComponentType<{ className?: string }> {
  return (
    typeof value === 'function' ||
    (typeof value === 'object' && value !== null && '$$typeof' in (value as object))
  )
}

/** Renders a Lucide icon looked up by the string name stored in the catalog. */
export function DynamicIcon({ name, className }: { name?: string; className?: string }) {
  if (!name) return null
  const Icon = (LucideIcons as unknown as Record<string, unknown>)[name]
  if (!isIconComponent(Icon)) return null
  return <Icon className={className} />
}
