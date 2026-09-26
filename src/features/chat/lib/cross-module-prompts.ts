import type { Project } from '@shared/types'

/** Cross-module suggested prompts linking chat to flows, docs, and knowledge. */
export function buildCrossModuleChatPrompts(project: Pick<Project, 'name'>): string[] {
  const name = project.name
  return [
    `Review our flow diagrams and suggest missing steps for ${name}`,
    `Compare requirements documents with our knowledge base — what's missing?`,
    `Generate a process flow outline for the core workflow in ${name}`,
    `Check ${name} flows against requirements for gaps`,
    `Draft a requirements document section from our latest discussion`,
    `Analyze attached flow for bottlenecks and automation opportunities`
  ]
}

export const GLOBAL_ASSISTANT_PROMPTS = [
  'Help me debug this error and suggest a fix',
  'Review this architecture approach and suggest improvements',
  'What should I set up first in a new full-stack project?',
  'Explain how to connect API Studio with my backend workflow',
  'Draft a technical plan for a microservices migration'
]

export function buildGlobalPromptsWithProject(projectName: string): string[] {
  return [
    `Summarize everything in the ${projectName} knowledge base`,
    `What documents in ${projectName} need updating?`,
    `Check ${projectName} flows against requirements for gaps`,
    `Suggest API endpoints for ${projectName} based on knowledge`,
    ...buildCrossModuleChatPrompts({ name: projectName }).slice(0, 3)
  ]
}
