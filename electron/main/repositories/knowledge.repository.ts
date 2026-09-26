import { getPrismaClient } from '../database/client'
import { v4 as uuidv4 } from 'uuid'
import type {
  APIEndpoint,
  Assumption,
  BusinessRule,
  DatabaseEntity,
  Decision,
  Integration,
  KnowledgeBundle,
  KnowledgeFeature,
  KnowledgeModule,
  KnowledgeReport,
  KnowledgeRequirement,
  KnowledgeRole,
  KnowledgeSearchResult,
  KnowledgeStats,
  RequirementKnowledge,
  Risk,
  Stakeholder,
  Workflow
} from '@shared/types'

function toIso(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null
}

function serializeDates<T extends { createdAt: Date; updatedAt: Date; deletedAt?: Date | null }>(
  row: T
): Omit<T, 'createdAt' | 'updatedAt' | 'deletedAt'> & {
  createdAt: string
  updatedAt: string
  deletedAt: string | null
} {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: toIso(row.deletedAt ?? null)
  }
}

const notDeleted = { deletedAt: null }

export class KnowledgeRepository {
  async getOrCreateOverview(projectId: string): Promise<RequirementKnowledge> {
    const prisma = getPrismaClient()
    let overview = await prisma.requirementKnowledge.findUnique({ where: { projectId } })
    if (!overview) {
      overview = await prisma.requirementKnowledge.create({
        data: { id: uuidv4(), projectId }
      })
    }
    return {
      ...overview,
      createdAt: overview.createdAt.toISOString(),
      updatedAt: overview.updatedAt.toISOString()
    }
  }

  async updateOverview(
    projectId: string,
    data: Partial<Omit<RequirementKnowledge, 'id' | 'projectId' | 'createdAt' | 'updatedAt'>>
  ): Promise<RequirementKnowledge> {
    const prisma = getPrismaClient()
    await this.getOrCreateOverview(projectId)
    const updated = await prisma.requirementKnowledge.update({
      where: { projectId },
      data
    })
    return {
      ...updated,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString()
    }
  }

  async loadBundle(projectId: string): Promise<KnowledgeBundle> {
    const prisma = getPrismaClient()
    const [
      overview,
      stakeholders,
      roles,
      modules,
      features,
      requirements,
      businessRules,
      workflows,
      entities,
      apiEndpoints,
      integrations,
      reports,
      risks,
      assumptions,
      decisions
    ] = await Promise.all([
      prisma.requirementKnowledge.findUnique({ where: { projectId } }),
      prisma.stakeholder.findMany({ where: { projectId, ...notDeleted }, orderBy: { sortOrder: 'asc' } }),
      prisma.role.findMany({ where: { projectId, ...notDeleted }, orderBy: { sortOrder: 'asc' } }),
      prisma.module.findMany({ where: { projectId, ...notDeleted }, orderBy: { sortOrder: 'asc' } }),
      prisma.feature.findMany({ where: { projectId, ...notDeleted }, orderBy: { sortOrder: 'asc' } }),
      prisma.requirement.findMany({ where: { projectId, ...notDeleted }, orderBy: { sortOrder: 'asc' } }),
      prisma.businessRule.findMany({ where: { projectId, ...notDeleted }, orderBy: { sortOrder: 'asc' } }),
      prisma.workflow.findMany({ where: { projectId, ...notDeleted }, orderBy: { sortOrder: 'asc' } }),
      prisma.entity.findMany({ where: { projectId, ...notDeleted }, orderBy: { sortOrder: 'asc' } }),
      prisma.aPIEndpoint.findMany({ where: { projectId, ...notDeleted }, orderBy: { sortOrder: 'asc' } }),
      prisma.integration.findMany({ where: { projectId, ...notDeleted }, orderBy: { sortOrder: 'asc' } }),
      prisma.report.findMany({ where: { projectId, ...notDeleted }, orderBy: { sortOrder: 'asc' } }),
      prisma.risk.findMany({ where: { projectId, ...notDeleted }, orderBy: { sortOrder: 'asc' } }),
      prisma.assumption.findMany({ where: { projectId, ...notDeleted }, orderBy: { sortOrder: 'asc' } }),
      prisma.decision.findMany({ where: { projectId, ...notDeleted }, orderBy: { sortOrder: 'asc' } })
    ])

    return {
      overview: overview
        ? {
            ...overview,
            createdAt: overview.createdAt.toISOString(),
            updatedAt: overview.updatedAt.toISOString()
          }
        : null,
      stakeholders: stakeholders.map((s) => serializeDates(s)) as Stakeholder[],
      roles: roles.map((r) => serializeDates(r)) as KnowledgeRole[],
      modules: modules.map((m) => serializeDates(m)) as KnowledgeModule[],
      features: features.map((f) => serializeDates(f)) as KnowledgeFeature[],
      requirements: requirements.map((r) => ({
        ...serializeDates(r),
        type: r.type as KnowledgeRequirement['type']
      })),
      businessRules: businessRules.map((b) => serializeDates(b)) as BusinessRule[],
      workflows: workflows.map((w) => serializeDates(w)) as Workflow[],
      entities: entities.map((e) => serializeDates(e)) as DatabaseEntity[],
      apiEndpoints: apiEndpoints.map((a) => serializeDates(a)) as APIEndpoint[],
      integrations: integrations.map((i) => serializeDates(i)) as Integration[],
      reports: reports.map((r) => serializeDates(r)) as KnowledgeReport[],
      risks: risks.map((r) => serializeDates(r)) as Risk[],
      assumptions: assumptions.map((a) => serializeDates(a)) as Assumption[],
      decisions: decisions.map((d) => serializeDates(d)) as Decision[]
    }
  }

  async getStats(projectId: string): Promise<KnowledgeStats> {
    const bundle = await this.loadBundle(projectId)
    const functional = bundle.requirements.filter((r) => r.type === 'functional').length
    const nfr = bundle.requirements.filter((r) => r.type === 'non_functional').length

    const checks = [
      bundle.overview?.projectSummary ? 1 : 0,
      bundle.modules.length > 0 ? 1 : 0,
      bundle.requirements.length > 0 ? 1 : 0
    ]
    const completionPercent = Math.round((checks.reduce((a, b) => a + b, 0) / checks.length) * 100)

    return {
      modules: bundle.modules.length,
      features: bundle.features.length,
      requirements: bundle.requirements.length,
      functionalRequirements: functional,
      nonFunctionalRequirements: nfr,
      apiEndpoints: bundle.apiEndpoints.length,
      entities: bundle.entities.length,
      reports: bundle.reports.length,
      risks: bundle.risks.length,
      roles: bundle.roles.length,
      businessRules: bundle.businessRules.length,
      completionPercent
    }
  }

  async search(projectId: string, query: string): Promise<KnowledgeSearchResult[]> {
    const q = query.toLowerCase()
    const bundle = await this.loadBundle(projectId)
    const results: KnowledgeSearchResult[] = []

    const add = (
      entityType: string,
      entityId: string,
      title: string,
      text: string,
      section: KnowledgeSearchResult['section']
    ) => {
      if (title.toLowerCase().includes(q) || text.toLowerCase().includes(q)) {
        const idx = text.toLowerCase().indexOf(q)
        const snippet =
          idx >= 0
            ? text.slice(Math.max(0, idx - 30), idx + query.length + 30)
            : text.slice(0, 80)
        results.push({ id: `${entityType}-${entityId}`, entityType, entityId, title, snippet, section })
      }
    }

    for (const m of bundle.modules) add('module', m.id, m.title, m.description, 'modules')
    for (const f of bundle.features) add('feature', f.id, f.title, f.description, 'features')
    for (const r of bundle.requirements)
      add('requirement', r.id, r.code ? `${r.code}: ${r.title}` : r.title, r.description, 'requirements')
    for (const a of bundle.apiEndpoints)
      add('api', a.id, `${a.method} ${a.path}`, a.description, 'apis')
    for (const e of bundle.entities) add('entity', e.id, e.name, e.notes, 'database')
    for (const b of bundle.businessRules) add('business_rule', b.id, b.title, b.description, 'business-rules')
    for (const r of bundle.reports) add('report', r.id, r.title, r.description, 'reports')
    for (const r of bundle.risks) add('risk', r.id, r.title, r.description, 'risks')

    return results.slice(0, 50)
  }

  // Generic CRUD helpers
  private async nextSortOrder(model: string, projectId: string): Promise<number> {
    const prisma = getPrismaClient() as Record<string, { count: (args: unknown) => Promise<number> }>
    const count = await prisma[model].count({ where: { projectId, ...notDeleted } })
    return count
  }

  async createStakeholder(projectId: string, data: Partial<Stakeholder>): Promise<Stakeholder> {
    const prisma = getPrismaClient()
    const row = await prisma.stakeholder.create({
      data: {
        id: uuidv4(),
        projectId,
        name: data.name ?? 'New Stakeholder',
        role: data.role ?? '',
        responsibilities: data.responsibilities ?? '',
        contactNotes: data.contactNotes ?? '',
        sortOrder: data.sortOrder ?? (await this.nextSortOrder('stakeholder', projectId)),
        notes: data.notes ?? ''
      }
    })
    return serializeDates(row) as Stakeholder
  }

  async updateStakeholder(id: string, data: Partial<Stakeholder>): Promise<Stakeholder | null> {
    const prisma = getPrismaClient()
    try {
      const row = await prisma.stakeholder.update({ where: { id }, data })
      return serializeDates(row) as Stakeholder
    } catch {
      return null
    }
  }

  async deleteStakeholder(id: string): Promise<boolean> {
    const prisma = getPrismaClient()
    try {
      await prisma.stakeholder.update({ where: { id }, data: { deletedAt: new Date() } })
      return true
    } catch {
      return false
    }
  }

  async createModule(projectId: string, data: Partial<KnowledgeModule>): Promise<KnowledgeModule> {
    const prisma = getPrismaClient()
    const row = await prisma.module.create({
      data: {
        id: uuidv4(),
        projectId,
        title: data.title ?? 'New Module',
        description: data.description ?? '',
        priority: data.priority ?? 'medium',
        status: data.status ?? 'planned',
        sortOrder: data.sortOrder ?? (await this.nextSortOrder('module', projectId)),
        notes: data.notes ?? ''
      }
    })
    return serializeDates(row) as KnowledgeModule
  }

  async updateModule(id: string, data: Partial<KnowledgeModule>): Promise<KnowledgeModule | null> {
    const prisma = getPrismaClient()
    try {
      const row = await prisma.module.update({ where: { id }, data })
      return serializeDates(row) as KnowledgeModule
    } catch {
      return null
    }
  }

  async deleteModule(id: string): Promise<boolean> {
    const prisma = getPrismaClient()
    try {
      await prisma.module.update({ where: { id }, data: { deletedAt: new Date() } })
      return true
    } catch {
      return false
    }
  }

  async createFeature(projectId: string, data: Partial<KnowledgeFeature>): Promise<KnowledgeFeature> {
    const prisma = getPrismaClient()
    const row = await prisma.feature.create({
      data: {
        id: uuidv4(),
        projectId,
        moduleId: data.moduleId ?? null,
        title: data.title ?? 'New Feature',
        description: data.description ?? '',
        complexity: data.complexity ?? 'medium',
        priority: data.priority ?? 'medium',
        status: data.status ?? 'planned',
        sortOrder: data.sortOrder ?? (await this.nextSortOrder('feature', projectId)),
        notes: data.notes ?? ''
      }
    })
    return serializeDates(row) as KnowledgeFeature
  }

  async updateFeature(id: string, data: Partial<KnowledgeFeature>): Promise<KnowledgeFeature | null> {
    const prisma = getPrismaClient()
    try {
      const row = await prisma.feature.update({ where: { id }, data })
      return serializeDates(row) as KnowledgeFeature
    } catch {
      return null
    }
  }

  async deleteFeature(id: string): Promise<boolean> {
    const prisma = getPrismaClient()
    try {
      await prisma.feature.update({ where: { id }, data: { deletedAt: new Date() } })
      return true
    } catch {
      return false
    }
  }

  async createRequirement(
    projectId: string,
    data: Partial<KnowledgeRequirement>
  ): Promise<KnowledgeRequirement> {
    const prisma = getPrismaClient()
    const count = await prisma.requirement.count({ where: { projectId, ...notDeleted } })
    const row = await prisma.requirement.create({
      data: {
        id: uuidv4(),
        projectId,
        code: data.code ?? `REQ-${String(count + 1).padStart(3, '0')}`,
        title: data.title ?? 'New Requirement',
        description: data.description ?? '',
        type: data.type ?? 'functional',
        moduleId: data.moduleId ?? null,
        featureId: data.featureId ?? null,
        priority: data.priority ?? 'medium',
        acceptanceCriteria: data.acceptanceCriteria ?? '[]',
        dependencies: data.dependencies ?? '[]',
        tags: data.tags ?? '[]',
        status: data.status ?? 'draft',
        nfrCategory: data.nfrCategory ?? '',
        sortOrder: data.sortOrder ?? count,
        notes: data.notes ?? ''
      }
    })
    return { ...serializeDates(row), type: row.type as KnowledgeRequirement['type'] }
  }

  async updateRequirement(
    id: string,
    data: Partial<KnowledgeRequirement>
  ): Promise<KnowledgeRequirement | null> {
    const prisma = getPrismaClient()
    try {
      const row = await prisma.requirement.update({ where: { id }, data })
      return { ...serializeDates(row), type: row.type as KnowledgeRequirement['type'] }
    } catch {
      return null
    }
  }

  async getRequirement(id: string): Promise<KnowledgeRequirement | null> {
    const prisma = getPrismaClient()
    const row = await prisma.requirement.findUnique({ where: { id } })
    if (!row || row.deletedAt) return null
    return { ...serializeDates(row), type: row.type as KnowledgeRequirement['type'] }
  }

  async deleteRequirement(id: string): Promise<boolean> {
    const prisma = getPrismaClient()
    try {
      await prisma.requirement.update({ where: { id }, data: { deletedAt: new Date() } })
      return true
    } catch {
      return false
    }
  }

  async createRole(projectId: string, data: Partial<KnowledgeRole>): Promise<KnowledgeRole> {
    const prisma = getPrismaClient()
    const row = await prisma.role.create({
      data: {
        id: uuidv4(),
        projectId,
        name: data.name ?? 'New Role',
        description: data.description ?? '',
        permissions: data.permissions ?? '[]',
        modules: data.modules ?? '[]',
        restrictions: data.restrictions ?? '[]',
        sortOrder: data.sortOrder ?? (await this.nextSortOrder('role', projectId)),
        notes: data.notes ?? ''
      }
    })
    return serializeDates(row) as KnowledgeRole
  }

  async updateRole(id: string, data: Partial<KnowledgeRole>): Promise<KnowledgeRole | null> {
    const prisma = getPrismaClient()
    try {
      const row = await prisma.role.update({ where: { id }, data })
      return serializeDates(row) as KnowledgeRole
    } catch {
      return null
    }
  }

  async deleteRole(id: string): Promise<boolean> {
    const prisma = getPrismaClient()
    try {
      await prisma.role.update({ where: { id }, data: { deletedAt: new Date() } })
      return true
    } catch {
      return false
    }
  }

  async createBusinessRule(projectId: string, data: Partial<BusinessRule>): Promise<BusinessRule> {
    const prisma = getPrismaClient()
    const row = await prisma.businessRule.create({
      data: {
        id: uuidv4(),
        projectId,
        title: data.title ?? 'New Rule',
        description: data.description ?? '',
        moduleId: data.moduleId ?? null,
        sortOrder: data.sortOrder ?? (await this.nextSortOrder('businessRule', projectId)),
        notes: data.notes ?? ''
      }
    })
    return serializeDates(row) as BusinessRule
  }

  async updateBusinessRule(id: string, data: Partial<BusinessRule>): Promise<BusinessRule | null> {
    const prisma = getPrismaClient()
    try {
      const row = await prisma.businessRule.update({ where: { id }, data })
      return serializeDates(row) as BusinessRule
    } catch {
      return null
    }
  }

  async deleteBusinessRule(id: string): Promise<boolean> {
    const prisma = getPrismaClient()
    try {
      await prisma.businessRule.update({ where: { id }, data: { deletedAt: new Date() } })
      return true
    } catch {
      return false
    }
  }

  async createWorkflow(projectId: string, data: Partial<Workflow>): Promise<Workflow> {
    const prisma = getPrismaClient()
    const row = await prisma.workflow.create({
      data: {
        id: uuidv4(),
        projectId,
        title: data.title ?? 'New Workflow',
        description: data.description ?? '',
        flowData: data.flowData ?? '[]',
        moduleId: data.moduleId ?? null,
        sortOrder: data.sortOrder ?? (await this.nextSortOrder('workflow', projectId)),
        notes: data.notes ?? ''
      }
    })
    return serializeDates(row) as Workflow
  }

  async updateWorkflow(id: string, data: Partial<Workflow>): Promise<Workflow | null> {
    const prisma = getPrismaClient()
    try {
      const row = await prisma.workflow.update({ where: { id }, data })
      return serializeDates(row) as Workflow
    } catch {
      return null
    }
  }

  async deleteWorkflow(id: string): Promise<boolean> {
    const prisma = getPrismaClient()
    try {
      await prisma.workflow.update({ where: { id }, data: { deletedAt: new Date() } })
      return true
    } catch {
      return false
    }
  }

  async createEntity(projectId: string, data: Partial<DatabaseEntity>): Promise<DatabaseEntity> {
    const prisma = getPrismaClient()
    const row = await prisma.entity.create({
      data: {
        id: uuidv4(),
        projectId,
        name: data.name ?? 'New Entity',
        fields: data.fields ?? '[]',
        relationships: data.relationships ?? '[]',
        indexes: data.indexes ?? '[]',
        sortOrder: data.sortOrder ?? (await this.nextSortOrder('entity', projectId)),
        notes: data.notes ?? ''
      }
    })
    return serializeDates(row) as DatabaseEntity
  }

  async updateEntity(id: string, data: Partial<DatabaseEntity>): Promise<DatabaseEntity | null> {
    const prisma = getPrismaClient()
    try {
      const row = await prisma.entity.update({ where: { id }, data })
      return serializeDates(row) as DatabaseEntity
    } catch {
      return null
    }
  }

  async deleteEntity(id: string): Promise<boolean> {
    const prisma = getPrismaClient()
    try {
      await prisma.entity.update({ where: { id }, data: { deletedAt: new Date() } })
      return true
    } catch {
      return false
    }
  }

  async createAPIEndpoint(projectId: string, data: Partial<APIEndpoint>): Promise<APIEndpoint> {
    const prisma = getPrismaClient()
    const row = await prisma.aPIEndpoint.create({
      data: {
        id: uuidv4(),
        projectId,
        method: data.method ?? 'GET',
        path: data.path ?? '/api/new',
        description: data.description ?? '',
        request: data.request ?? '{}',
        response: data.response ?? '{}',
        authentication: data.authentication ?? '',
        validation: data.validation ?? '',
        sortOrder: data.sortOrder ?? (await this.nextSortOrder('aPIEndpoint', projectId)),
        notes: data.notes ?? ''
      }
    })
    return serializeDates(row) as APIEndpoint
  }

  async updateAPIEndpoint(id: string, data: Partial<APIEndpoint>): Promise<APIEndpoint | null> {
    const prisma = getPrismaClient()
    try {
      const row = await prisma.aPIEndpoint.update({ where: { id }, data })
      return serializeDates(row) as APIEndpoint
    } catch {
      return null
    }
  }

  async deleteAPIEndpoint(id: string): Promise<boolean> {
    const prisma = getPrismaClient()
    try {
      await prisma.aPIEndpoint.update({ where: { id }, data: { deletedAt: new Date() } })
      return true
    } catch {
      return false
    }
  }

  async createIntegration(projectId: string, data: Partial<Integration>): Promise<Integration> {
    const prisma = getPrismaClient()
    const row = await prisma.integration.create({
      data: {
        id: uuidv4(),
        projectId,
        name: data.name ?? 'New Integration',
        description: data.description ?? '',
        type: data.type ?? '',
        config: data.config ?? '{}',
        sortOrder: data.sortOrder ?? (await this.nextSortOrder('integration', projectId)),
        notes: data.notes ?? ''
      }
    })
    return serializeDates(row) as Integration
  }

  async updateIntegration(id: string, data: Partial<Integration>): Promise<Integration | null> {
    const prisma = getPrismaClient()
    try {
      const row = await prisma.integration.update({ where: { id }, data })
      return serializeDates(row) as Integration
    } catch {
      return null
    }
  }

  async deleteIntegration(id: string): Promise<boolean> {
    const prisma = getPrismaClient()
    try {
      await prisma.integration.update({ where: { id }, data: { deletedAt: new Date() } })
      return true
    } catch {
      return false
    }
  }

  async createReport(projectId: string, data: Partial<KnowledgeReport>): Promise<KnowledgeReport> {
    const prisma = getPrismaClient()
    const row = await prisma.report.create({
      data: {
        id: uuidv4(),
        projectId,
        title: data.title ?? 'New Report',
        description: data.description ?? '',
        moduleId: data.moduleId ?? null,
        sortOrder: data.sortOrder ?? (await this.nextSortOrder('report', projectId)),
        notes: data.notes ?? ''
      }
    })
    return serializeDates(row) as KnowledgeReport
  }

  async updateReport(id: string, data: Partial<KnowledgeReport>): Promise<KnowledgeReport | null> {
    const prisma = getPrismaClient()
    try {
      const row = await prisma.report.update({ where: { id }, data })
      return serializeDates(row) as KnowledgeReport
    } catch {
      return null
    }
  }

  async deleteReport(id: string): Promise<boolean> {
    const prisma = getPrismaClient()
    try {
      await prisma.report.update({ where: { id }, data: { deletedAt: new Date() } })
      return true
    } catch {
      return false
    }
  }

  async createRisk(projectId: string, data: Partial<Risk>): Promise<Risk> {
    const prisma = getPrismaClient()
    const row = await prisma.risk.create({
      data: {
        id: uuidv4(),
        projectId,
        title: data.title ?? 'New Risk',
        description: data.description ?? '',
        severity: data.severity ?? 'medium',
        likelihood: data.likelihood ?? 'medium',
        mitigation: data.mitigation ?? '',
        sortOrder: data.sortOrder ?? (await this.nextSortOrder('risk', projectId)),
        notes: data.notes ?? ''
      }
    })
    return serializeDates(row) as Risk
  }

  async updateRisk(id: string, data: Partial<Risk>): Promise<Risk | null> {
    const prisma = getPrismaClient()
    try {
      const row = await prisma.risk.update({ where: { id }, data })
      return serializeDates(row) as Risk
    } catch {
      return null
    }
  }

  async deleteRisk(id: string): Promise<boolean> {
    const prisma = getPrismaClient()
    try {
      await prisma.risk.update({ where: { id }, data: { deletedAt: new Date() } })
      return true
    } catch {
      return false
    }
  }

  async createAssumption(projectId: string, data: Partial<Assumption>): Promise<Assumption> {
    const prisma = getPrismaClient()
    const row = await prisma.assumption.create({
      data: {
        id: uuidv4(),
        projectId,
        title: data.title ?? 'New Assumption',
        description: data.description ?? '',
        sortOrder: data.sortOrder ?? (await this.nextSortOrder('assumption', projectId)),
        notes: data.notes ?? ''
      }
    })
    return serializeDates(row) as Assumption
  }

  async updateAssumption(id: string, data: Partial<Assumption>): Promise<Assumption | null> {
    const prisma = getPrismaClient()
    try {
      const row = await prisma.assumption.update({ where: { id }, data })
      return serializeDates(row) as Assumption
    } catch {
      return null
    }
  }

  async deleteAssumption(id: string): Promise<boolean> {
    const prisma = getPrismaClient()
    try {
      await prisma.assumption.update({ where: { id }, data: { deletedAt: new Date() } })
      return true
    } catch {
      return false
    }
  }

  async createDecision(projectId: string, data: Partial<Decision>): Promise<Decision> {
    const prisma = getPrismaClient()
    const row = await prisma.decision.create({
      data: {
        id: uuidv4(),
        projectId,
        title: data.title ?? 'New Decision',
        decision: data.decision ?? '',
        reason: data.reason ?? '',
        category: data.category ?? '',
        sortOrder: data.sortOrder ?? (await this.nextSortOrder('decision', projectId)),
        notes: data.notes ?? ''
      }
    })
    return serializeDates(row) as Decision
  }

  async updateDecision(id: string, data: Partial<Decision>): Promise<Decision | null> {
    const prisma = getPrismaClient()
    try {
      const row = await prisma.decision.update({ where: { id }, data })
      return serializeDates(row) as Decision
    } catch {
      return null
    }
  }

  async deleteDecision(id: string): Promise<boolean> {
    const prisma = getPrismaClient()
    try {
      await prisma.decision.update({ where: { id }, data: { deletedAt: new Date() } })
      return true
    } catch {
      return false
    }
  }

  async bulkImport(projectId: string, data: Partial<KnowledgeBundle>): Promise<void> {
    if (data.modules) {
      for (const m of data.modules) {
        await this.createModule(projectId, m)
      }
    }
    if (data.features) {
      for (const f of data.features) {
        await this.createFeature(projectId, f)
      }
    }
    if (data.requirements) {
      for (const r of data.requirements) {
        await this.createRequirement(projectId, r)
      }
    }
    if (data.roles) {
      for (const r of data.roles) {
        await this.createRole(projectId, r)
      }
    }
    if (data.apiEndpoints) {
      for (const a of data.apiEndpoints) {
        await this.createAPIEndpoint(projectId, a)
      }
    }
    if (data.entities) {
      for (const e of data.entities) {
        await this.createEntity(projectId, e)
      }
    }
    if (data.businessRules) {
      for (const b of data.businessRules) {
        await this.createBusinessRule(projectId, b)
      }
    }
    if (data.risks) {
      for (const r of data.risks) {
        await this.createRisk(projectId, r)
      }
    }
    if (data.assumptions) {
      for (const a of data.assumptions) {
        await this.createAssumption(projectId, a)
      }
    }
  }
}

export const knowledgeRepository = new KnowledgeRepository()
