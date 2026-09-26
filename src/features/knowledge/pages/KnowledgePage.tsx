import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Search, Loader2, Check, FileText, Sparkles, Boxes } from 'lucide-react'
import { ModulePage, PageContent, PageHeader } from '@/shared/components/layout/ModulePage'
import { Input } from '@/shared/components/ui/input'
import { Spinner } from '@/shared/components/ui/spinner'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/shared/components/ui/card'
import { useKnowledgeStore } from '@/features/knowledge/stores/knowledge.store'
import { useDocumentStore } from '@/features/documents/stores/document.store'
import { useVectorWorkspaceStore } from '@/modules/vector-studio/stores/vectorWorkspace.store'
import type { KnowledgeSection } from '@shared/types'
import type { RagStatus } from '@shared/types/vector-workspace'
import { KnowledgeNav } from '../components/KnowledgeNav'
import { KnowledgeDashboard } from '../components/KnowledgeDashboard'
import { BusinessOverviewSection } from '../components/BusinessOverviewSection'
import { KnowledgeItemList, PriorityBadge } from '../components/KnowledgeItemList'
import { ModulesSection } from '../components/ModulesSection'
import { ExtractKnowledgeDialog } from '../components/ExtractKnowledgeDialog'
import { LoadSampleDataButton } from '../components/LoadSampleDataButton'
import { ENTITY_TYPE_MAP, KNOWLEDGE_NAV } from '../lib/sections'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { formatRelativeTime, cn } from '@/shared/lib/utils'
import { toast } from 'sonner'

export function KnowledgePage() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const [section, setSection] = useState<KnowledgeSection>('overview')
  const [searchQuery, setSearchQuery] = useState('')
  const [isIndexingRag, setIsIndexingRag] = useState(false)
  const [ragStatus, setRagStatus] = useState<RagStatus | null>(null)

  const ragIndex = useVectorWorkspaceStore((s) => s.ragIndex)
  const loadRagStatus = useVectorWorkspaceStore((s) => s.ragStatus)

  const {
    bundle,
    stats,
    suggestions,
    searchResults,
    isLoading,
    isSaving,
    isExtracting,
    loadKnowledge,
    updateOverview,
    createItem,
    updateItem,
    deleteItem,
    extractKnowledge,
    search,
    seedSampleData,
    isSeeding
  } = useKnowledgeStore()

  const { documents } = useDocumentStore()

  useEffect(() => {
    if (projectId) loadKnowledge(projectId)
  }, [projectId, loadKnowledge])

  useEffect(() => {
    if (!projectId) return
    void loadRagStatus(projectId).then((status) => {
      if (status) setRagStatus(status)
    })
  }, [projectId, loadRagStatus, bundle?.overview?.updatedAt, stats?.modules, stats?.requirements])

  useEffect(() => {
    if (projectId && searchQuery) {
      const t = setTimeout(() => search(projectId, searchQuery), 300)
      return () => clearTimeout(t)
    }
  }, [projectId, searchQuery, search])

  if (!projectId) return null

  const entityType = ENTITY_TYPE_MAP[section]
  const activeNav = KNOWLEDGE_NAV.find((n) => n.id === section)

  const handleIndexRag = async () => {
    setIsIndexingRag(true)
    try {
      const data = await ragIndex(projectId)
      if (!data) return
      // Also refresh project training corpus so chatbots see both KB + training docs
      const train = await window.electronAPI.ragTraining.index('PROJECT', projectId)
      if (train.success && train.data) {
        toast.message(
          `Training corpus: ${train.data.documentCount} docs / ${train.data.chunkCount} chunks`
        )
      }
      const status = await loadRagStatus(projectId)
      if (status) setRagStatus(status)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'RAG indexing failed')
    } finally {
      setIsIndexingRag(false)
    }
  }

  const ragBadge = (() => {
    if (!ragStatus) return null
    if (!ragStatus.enabled) {
      return (
        <Badge variant="outline" className="text-[10px] font-normal text-muted-foreground">
          RAG off
        </Badge>
      )
    }
    if (ragStatus.lastError) {
      return (
        <Badge variant="outline" className="border-amber-500/40 text-[10px] font-normal text-amber-700 dark:text-amber-400">
          RAG error
        </Badge>
      )
    }
    if (!ragStatus.indexed) {
      return (
        <Badge variant="outline" className="text-[10px] font-normal text-muted-foreground">
          Not indexed
        </Badge>
      )
    }
    if (ragStatus.stale) {
      return (
        <Badge variant="outline" className="border-amber-500/40 text-[10px] font-normal text-amber-700 dark:text-amber-400">
          Stale · {ragStatus.vectorCount} vectors
        </Badge>
      )
    }
    return (
      <Badge
        variant="outline"
        className="border-emerald-500/30 text-[10px] font-normal text-emerald-700 dark:text-emerald-400"
      >
        Indexed · {ragStatus.vectorCount}
      </Badge>
    )
  })()

  const handleCreate = async () => {
    const defaults: Record<string, Record<string, unknown>> = {
      stakeholder: { name: 'New Stakeholder' },
      module: { title: 'New Module' },
      feature: { title: 'New Feature' },
      requirement: { title: 'New Requirement', type: section === 'nfr' ? 'non_functional' : 'functional' },
      role: { name: 'New Role' },
      businessRule: { title: 'New Rule' },
      workflow: { title: 'New Workflow' },
      entity: { name: 'New Entity' },
      apiEndpoint: { method: 'GET', path: '/api/new' },
      integration: { name: 'New Integration' },
      report: { title: 'New Report' },
      risk: { title: 'New Risk' },
      assumption: { title: 'New Assumption' },
      decision: { title: 'New Decision' }
    }
    if (entityType && defaults[entityType]) {
      await createItem(entityType, projectId, defaults[entityType])
    }
  }

  const renderSection = () => {
    if (!bundle) return null

    switch (section) {
      case 'overview':
      case 'business':
        return (
          <div className="grid gap-3 lg:grid-cols-5">
            <div className="lg:col-span-3">
              <KnowledgeDashboard
                stats={stats}
                suggestions={suggestions}
                onNavigate={(s) => setSection(s as KnowledgeSection)}
                onSeedSample={async (force) => {
                  const r = await seedSampleData(projectId, force)
                  if (r && !r.skipped) toast.success(r.message)
                  return r
                }}
                isSeeding={isSeeding}
                hasExistingData={(stats?.modules ?? 0) > 0}
              />
            </div>
            <div className="lg:col-span-2">
              <Card className="h-full">
                <CardHeader className="p-3.5 pb-2">
                  <CardTitle className="text-sm">Project basics</CardTitle>
                  <CardDescription className="text-xs">Auto-saved — used as AI context</CardDescription>
                </CardHeader>
                <CardContent className="p-3.5 pt-0">
                  <BusinessOverviewSection
                    overview={bundle.overview}
                    projectId={projectId}
                    onSave={(data) => updateOverview(projectId, data)}
                  />
                </CardContent>
              </Card>
            </div>
          </div>
        )

      case 'stakeholders':
        return (
          <SectionShell title="Stakeholders" description="People involved in the project">
            <KnowledgeItemList
              items={bundle.stakeholders}
              titleKey="name"
              fields={[
                { key: 'name', label: 'Name' },
                { key: 'role', label: 'Role' },
                { key: 'responsibilities', label: 'Responsibilities', type: 'textarea' },
                { key: 'contactNotes', label: 'Contact Notes', type: 'textarea' }
              ]}
              onCreate={handleCreate}
              onUpdate={(id, d) => updateItem('stakeholder', id, d)}
              onDelete={(id) => deleteItem('stakeholder', id)}
            />
          </SectionShell>
        )

      case 'roles':
        return (
          <SectionShell title="User Roles" description="Roles, permissions, and access">
            <KnowledgeItemList
              items={bundle.roles}
              titleKey="name"
              fields={[
                { key: 'name', label: 'Role Name' },
                { key: 'description', label: 'Description', type: 'textarea' },
                { key: 'permissions', label: 'Permissions (comma-separated)' },
                { key: 'restrictions', label: 'Restrictions', type: 'textarea' }
              ]}
              onCreate={handleCreate}
              onUpdate={(id, d) => updateItem('role', id, d)}
              onDelete={(id) => deleteItem('role', id)}
            />
          </SectionShell>
        )

      case 'modules':
        return (
          <SectionShell
            title="Modules"
            description="Main areas of your system — add features under each module"
          >
            <ModulesSection
              modules={bundle.modules}
              features={bundle.features}
              onCreateModule={handleCreate}
              onUpdateModule={(id, d) => updateItem('module', id, d)}
              onDeleteModule={(id) => deleteItem('module', id)}
              onCreateFeature={async (moduleId) => {
                await createItem('feature', projectId, {
                  title: 'New Feature',
                  moduleId
                })
              }}
              onUpdateFeature={(id, d) => updateItem('feature', id, d)}
              onDeleteFeature={(id) => deleteItem('feature', id)}
            />
          </SectionShell>
        )

      case 'features':
        return (
          <SectionShell
            title="All Features"
            description="Flat list of features — edit module assignment in the Modules view"
          >
            <KnowledgeItemList
              items={bundle.features}
              titleKey="title"
              fields={[
                { key: 'title', label: 'Title' },
                { key: 'description', label: 'Description', type: 'textarea' },
                {
                  key: 'complexity',
                  label: 'Complexity',
                  type: 'select',
                  options: ['low', 'medium', 'high']
                },
                {
                  key: 'priority',
                  label: 'Priority',
                  type: 'select',
                  options: ['high', 'medium', 'low']
                },
                {
                  key: 'status',
                  label: 'Status',
                  type: 'select',
                  options: ['planned', 'in_progress', 'completed']
                }
              ]}
              renderBadge={(item) => <PriorityBadge value={item.priority} />}
              onCreate={handleCreate}
              onUpdate={(id, d) => updateItem('feature', id, d)}
              onDelete={(id) => deleteItem('feature', id)}
            />
          </SectionShell>
        )

      case 'requirements':
        return (
          <SectionShell title="Requirements" description="Key things the system must do">
            <KnowledgeItemList
              items={bundle.requirements}
              titleKey="title"
              fields={[
                { key: 'title', label: 'Requirement' },
                { key: 'description', label: 'Details (optional)', type: 'textarea' }
              ]}
              onCreate={handleCreate}
              onUpdate={(id, d) => updateItem('requirement', id, d)}
              onDelete={(id) => deleteItem('requirement', id)}
            />
          </SectionShell>
        )

      case 'nfr':
        return (
          <SectionShell title="Non-Functional Requirements" description="Performance, security, scalability, etc.">
            <KnowledgeItemList
              items={bundle.requirements.filter((r) => r.type === 'non_functional')}
              titleKey="title"
              fields={[
                { key: 'title', label: 'Title' },
                { key: 'nfrCategory', label: 'Category (security, performance, etc.)' },
                { key: 'description', label: 'Description', type: 'textarea' },
                {
                  key: 'priority',
                  label: 'Priority',
                  type: 'select',
                  options: ['high', 'medium', 'low']
                }
              ]}
              onCreate={async () => {
                await createItem('requirement', projectId, {
                  title: 'New NFR',
                  type: 'non_functional'
                })
              }}
              onUpdate={(id, d) => updateItem('requirement', id, d)}
              onDelete={(id) => deleteItem('requirement', id)}
            />
          </SectionShell>
        )

      case 'business-rules':
        return (
          <SectionShell title="Business Rules" description="Rules that govern system behavior">
            <KnowledgeItemList
              items={bundle.businessRules}
              titleKey="title"
              fields={[
                { key: 'title', label: 'Rule' },
                { key: 'description', label: 'Description', type: 'textarea' }
              ]}
              onCreate={handleCreate}
              onUpdate={(id, d) => updateItem('businessRule', id, d)}
              onDelete={(id) => deleteItem('businessRule', id)}
            />
          </SectionShell>
        )

      case 'workflows':
        return (
          <SectionShell title="Workflows" description="Process flows and user journeys">
            <KnowledgeItemList
              items={bundle.workflows}
              titleKey="title"
              fields={[
                { key: 'title', label: 'Workflow Name' },
                { key: 'description', label: 'Steps / Description', type: 'textarea' }
              ]}
              onCreate={handleCreate}
              onUpdate={(id, d) => updateItem('workflow', id, d)}
              onDelete={(id) => deleteItem('workflow', id)}
            />
          </SectionShell>
        )

      case 'database':
        return (
          <SectionShell title="Database Entities" description="Data models and relationships">
            <KnowledgeItemList
              items={bundle.entities}
              titleKey="name"
              fields={[
                { key: 'name', label: 'Entity Name' },
                { key: 'fields', label: 'Fields (comma-separated)' },
                { key: 'relationships', label: 'Relationships', type: 'textarea' },
                { key: 'notes', label: 'Notes', type: 'textarea' }
              ]}
              onCreate={handleCreate}
              onUpdate={(id, d) => updateItem('entity', id, d)}
              onDelete={(id) => deleteItem('entity', id)}
            />
          </SectionShell>
        )

      case 'apis':
        return (
          <SectionShell title="API Endpoints" description="REST API specifications">
            <KnowledgeItemList
              items={bundle.apiEndpoints}
              titleKey="path"
              fields={[
                {
                  key: 'method',
                  label: 'Method',
                  type: 'select',
                  options: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
                },
                { key: 'path', label: 'Path' },
                { key: 'description', label: 'Description', type: 'textarea' },
                { key: 'authentication', label: 'Authentication' },
                { key: 'validation', label: 'Validation', type: 'textarea' }
              ]}
              renderBadge={(item) => (
                <Badge variant="secondary" className="font-mono text-[10px]">
                  {item.method}
                </Badge>
              )}
              onCreate={handleCreate}
              onUpdate={(id, d) => updateItem('apiEndpoint', id, d)}
              onDelete={(id) => deleteItem('apiEndpoint', id)}
            />
          </SectionShell>
        )

      case 'integrations':
        return (
          <SectionShell title="Integrations" description="Third-party services and connectors">
            <KnowledgeItemList
              items={bundle.integrations}
              titleKey="name"
              fields={[
                { key: 'name', label: 'Name' },
                { key: 'type', label: 'Type' },
                { key: 'description', label: 'Description', type: 'textarea' }
              ]}
              onCreate={handleCreate}
              onUpdate={(id, d) => updateItem('integration', id, d)}
              onDelete={(id) => deleteItem('integration', id)}
            />
          </SectionShell>
        )

      case 'reports':
        return (
          <SectionShell title="Reports" description="Available reports and analytics">
            <KnowledgeItemList
              items={bundle.reports}
              titleKey="title"
              fields={[
                { key: 'title', label: 'Report Name' },
                { key: 'description', label: 'Description', type: 'textarea' }
              ]}
              onCreate={handleCreate}
              onUpdate={(id, d) => updateItem('report', id, d)}
              onDelete={(id) => deleteItem('report', id)}
            />
          </SectionShell>
        )

      case 'risks':
        return (
          <SectionShell title="Risks" description="Project risks and mitigations">
            <KnowledgeItemList
              items={bundle.risks}
              titleKey="title"
              fields={[
                { key: 'title', label: 'Risk' },
                { key: 'description', label: 'Description', type: 'textarea' },
                {
                  key: 'severity',
                  label: 'Severity',
                  type: 'select',
                  options: ['low', 'medium', 'high']
                },
                { key: 'mitigation', label: 'Mitigation', type: 'textarea' }
              ]}
              onCreate={handleCreate}
              onUpdate={(id, d) => updateItem('risk', id, d)}
              onDelete={(id) => deleteItem('risk', id)}
            />
          </SectionShell>
        )

      case 'assumptions':
        return (
          <SectionShell title="Assumptions" description="Project assumptions and constraints">
            <KnowledgeItemList
              items={bundle.assumptions}
              titleKey="title"
              fields={[
                { key: 'title', label: 'Assumption' },
                { key: 'description', label: 'Description', type: 'textarea' }
              ]}
              onCreate={handleCreate}
              onUpdate={(id, d) => updateItem('assumption', id, d)}
              onDelete={(id) => deleteItem('assumption', id)}
            />
          </SectionShell>
        )

      case 'decisions':
        return (
          <SectionShell title="Decisions" description="Architectural and design decisions">
            <KnowledgeItemList
              items={bundle.decisions}
              titleKey="title"
              fields={[
                { key: 'title', label: 'Decision Topic' },
                { key: 'decision', label: 'Decision' },
                { key: 'reason', label: 'Reason', type: 'textarea' },
                { key: 'category', label: 'Category' }
              ]}
              onCreate={handleCreate}
              onUpdate={(id, d) => updateItem('decision', id, d)}
              onDelete={(id) => deleteItem('decision', id)}
            />
          </SectionShell>
        )

      case 'documents':
        return (
          <SectionShell
            title="Project documents"
            description="Specs in this project — open the Documents module to author or generate"
          >
            {documents.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-8 text-center">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <p className="mt-3 text-sm font-medium">No documents in this project</p>
                  <p className="mt-1 max-w-sm text-xs text-muted-foreground">
                    Documents stay scoped to the selected project.
                  </p>
                  <div className="mt-3 flex items-center gap-2">
                    <Button className="h-8 gap-1.5" size="sm" onClick={() => navigate(`/project/${projectId}/generate`)}>
                      <Sparkles className="h-3.5 w-3.5" />
                      Generate
                    </Button>
                    <Button className="h-8 gap-1.5" variant="outline" size="sm" onClick={() => navigate(`/project/${projectId}/documents`)}>
                      <FileText className="h-3.5 w-3.5" />
                      Open documents
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-1.5">
                {documents.slice(0, 8).map((doc) => (
                  <button
                    key={doc.id}
                    onClick={() => navigate(`/project/${projectId}/editor/${doc.id}`)}
                    className="flex w-full items-center justify-between gap-3 rounded-lg border bg-card px-3 py-2 text-left shadow-sm transition-colors hover:bg-accent/50"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                        <FileText className="h-3.5 w-3.5" />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{doc.title}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {doc.type.replace(/_/g, ' ')} · {formatRelativeTime(doc.updatedAt)}
                        </p>
                      </div>
                    </div>
                    <Badge variant="outline" className="shrink-0 capitalize text-[10px]">
                      {doc.style}
                    </Badge>
                  </button>
                ))}
                <div className="flex items-center gap-2 pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5"
                    onClick={() => navigate(`/project/${projectId}/documents`)}
                  >
                    <FileText className="h-3.5 w-3.5" />
                    All documents
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5"
                    onClick={() => navigate(`/project/${projectId}/generate`)}
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    Generate
                  </Button>
                </div>
              </div>
            )}
          </SectionShell>
        )

      default:
        return null
    }
  }

  return (
    <ModulePage>
      <PageHeader
        title="Knowledge"
        description="Project context for AI, documents, and generation"
        fluid
        actions={
          <>
            <span
              className={cn(
                'flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px]',
                isSaving
                  ? 'border-border text-muted-foreground'
                  : 'border-emerald-500/30 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400'
              )}
            >
              {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
              {isSaving ? 'Saving' : bundle ? 'Saved' : ''}
            </span>
            <ExtractKnowledgeDialog
              projectId={projectId}
              onExtract={(text) => extractKnowledge(projectId, text)}
              isExtracting={isExtracting}
            />
            {ragBadge}
            <Button
              variant="outline"
              size="sm"
              className="h-7"
              disabled={isIndexingRag}
              onClick={() => void handleIndexRag()}
            >
              {isIndexingRag ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Boxes className="h-3.5 w-3.5" />}
              {ragStatus?.indexed ? 'Re-index' : 'Index RAG'}
            </Button>
            <LoadSampleDataButton
              hasExistingData={(stats?.modules ?? 0) > 0}
              isSeeding={isSeeding}
              onSeed={(force) => seedSampleData(projectId, force)}
            />
          </>
        }
      />

      <PageContent fullBleed className="min-h-0 flex-1 flex-row overflow-hidden p-0">
        <KnowledgeNav
          active={section}
          onSelect={setSection}
          stats={{
            modules: stats?.modules ?? 0,
            requirements: stats?.requirements ?? 0,
            documents: documents.length
          }}
        />

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-background">
          <div className="shrink-0 border-b border-border px-4 py-2">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                {activeNav && section !== 'overview' && (
                  <h2 className="truncate text-sm font-semibold">{activeNav.label}</h2>
                )}
              </div>
              <div className="relative w-full max-w-xs">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search knowledge..."
                  className="h-8 pl-8 text-sm"
                />
              </div>
            </div>

            {searchResults.length > 0 && (
              <div className="mt-3 overflow-hidden rounded-lg border bg-popover shadow-md">
                {searchResults.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => {
                      setSection(r.section)
                      setSearchQuery('')
                    }}
                    className="flex w-full items-center justify-between gap-3 border-b px-4 py-2.5 text-left text-sm last:border-b-0 hover:bg-accent"
                  >
                    <span className="font-medium">{r.title}</span>
                    <span className="truncate text-xs text-muted-foreground">{r.snippet}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-4">
            {isLoading ? (
              <div className="flex h-full min-h-[200px] items-center justify-center">
                <Spinner size="lg" />
              </div>
            ) : (
              renderSection()
            )}
          </div>
        </div>
      </PageContent>
    </ModulePage>
  )
}

function SectionShell({
  title,
  description,
  children
}: {
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <div className="mx-auto max-w-3xl space-y-3">
      <div>
        <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
      {children}
    </div>
  )
}
