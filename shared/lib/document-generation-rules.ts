/** Max stored length for custom document generation rules. */
export const MAX_GENERATION_RULES_CHARS = 8000

export function sanitizeGenerationRules(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value.replace(/\0/g, '').slice(0, MAX_GENERATION_RULES_CHARS)
}

/**
 * Merge workspace (app) and project rules. Empty on both sides means default
 * generation behavior. Project rules win when they conflict with workspace rules.
 */
export function combineGenerationRules(
  appRules?: string | null,
  projectRules?: string | null
): string {
  const app = sanitizeGenerationRules(appRules).trim()
  const project = sanitizeGenerationRules(projectRules).trim()
  if (!app && !project) return ''

  const parts: string[] = []
  if (app) {
    parts.push(
      `Workspace rules (apply to every generated document):\n${app}`
    )
  }
  if (project) {
    parts.push(
      `Project rules (apply to this project. If they conflict with workspace rules, follow the project rules):\n${project}`
    )
  }
  return parts.join('\n\n')
}

export function formatGenerationRulesForPrompt(combined: string): string {
  const rules = combined.trim()
  if (!rules) return ''
  return `Mandatory custom generation rules — follow these throughout the document. They supplement the standard structure; when they specify a convention, naming scheme, tone, or constraint, prefer them over generic defaults.\n\n${rules}`
}
