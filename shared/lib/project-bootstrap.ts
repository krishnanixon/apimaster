import type { Project } from '@shared/types'

/** System prompt injected for all AI chat in a project workspace. */
export function buildProjectSystemPrompt(project: Pick<Project, 'name' | 'description' | 'companyName'>): string {
  const company = project.companyName || project.name
  const desc = project.description?.trim() || `A requirements workspace for ${project.name}.`

  return `You are the AI assistant for the project "${project.name}" (${company}).

Project context:
${desc}

Your role:
- Answer questions about this specific project only — requirements, architecture, risks, user stories, APIs, and documentation.
- Use the project knowledge base as the source of truth. Do not ask the user to re-enter information already captured there.
- When suggesting next steps, link ideas to modules, features, and documents in this workspace.
- Be concise, professional, and actionable for business analysts and product teams.`
}

export function buildKnowledgeOverviewFromProject(
  project: Pick<Project, 'name' | 'description'>
): {
  projectSummary: string
  scope: string
  targetUsers: string
  goals: string
} {
  const desc = project.description?.trim()
  const summary = desc || `${project.name} — requirements project.`

  return {
    projectSummary: summary,
    scope: `Core features and requirements for ${project.name}.`,
    targetUsers: '',
    goals: JSON.stringify([`Define requirements for ${project.name}`])
  }
}

export function buildProjectChatPrompts(project: Pick<Project, 'name' | 'description'>): string[] {
  const name = project.name
  const base = [
    `What are the key requirements for ${name}?`,
    `Summarize the current scope and goals for ${name}`,
    `What modules and features should we define for ${name}?`,
    `Identify risks and assumptions for ${name}`,
    `Suggest functional requirements for the core workflow in ${name}`
  ]
  if (project.description?.trim()) {
    base.unshift(`Based on our project description, what should we prioritize first?`)
  }
  return base.slice(0, 6)
}
