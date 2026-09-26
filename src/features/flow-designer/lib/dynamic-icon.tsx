import * as LucideIcons from 'lucide-react'

/** Renders a Lucide icon looked up by its string name (as stored in node/library data). */
export function DynamicIcon({ name, className }: { name?: string; className?: string }) {
  if (!name) return null
  const Icon = (LucideIcons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[name]
  if (!Icon) return null
  return <Icon className={className} />
}
