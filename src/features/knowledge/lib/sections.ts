import type { KnowledgeSection } from '@shared/types'
import { LayoutDashboard, Boxes, ListChecks, FileText } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export interface NavItem {
  id: KnowledgeSection
  label: string
  icon: LucideIcon
  description?: string
}

/** Simplified nav — basics, modules, requirements, documents only */
export const KNOWLEDGE_NAV: NavItem[] = [
  {
    id: 'overview',
    label: 'Basics',
    icon: LayoutDashboard,
    description: 'Summary, scope, and goals'
  },
  {
    id: 'modules',
    label: 'Modules',
    icon: Boxes,
    description: 'System areas and features'
  },
  {
    id: 'requirements',
    label: 'Requirements',
    icon: ListChecks,
    description: 'Functional requirements'
  },
  {
    id: 'documents',
    label: 'Documents',
    icon: FileText,
    description: 'Specs for this project'
  }
]

export const ENTITY_TYPE_MAP: Record<string, string> = {
  stakeholders: 'stakeholder',
  roles: 'role',
  modules: 'module',
  features: 'feature',
  requirements: 'requirement',
  nfr: 'requirement',
  'business-rules': 'businessRule',
  workflows: 'workflow',
  database: 'entity',
  apis: 'apiEndpoint',
  integrations: 'integration',
  reports: 'report',
  risks: 'risk',
  assumptions: 'assumption',
  decisions: 'decision'
}
