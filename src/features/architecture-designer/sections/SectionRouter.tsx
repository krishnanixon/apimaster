import type { ArchSectionId } from '@shared/types/architecture'
import { ArchitectureCanvas } from '../components/ArchitectureCanvas'
import { OverviewSection } from './OverviewSection'
import { RequirementsSection } from './RequirementsSection'
import { AIArchitectSection } from './AIArchitectSection'
import { ComponentsSection } from './ComponentsSection'
import { ApiSection } from './ApiSection'
import { SecuritySection } from './SecuritySection'
import { EnvironmentsSection } from './EnvironmentsSection'
import { DocumentationSection } from './DocumentationSection'
import { UpcomingSection } from './UpcomingSection'

export function SectionRouter({
  section,
  onNavigate
}: {
  section: ArchSectionId
  onNavigate: (section: ArchSectionId) => void
}) {
  switch (section) {
    case 'overview':
      return <OverviewSection onNavigate={onNavigate} />

    case 'requirements':
      return <RequirementsSection />

    case 'ai-architect':
      return <AIArchitectSection onNavigate={onNavigate} />

    case 'architecture':
      return (
        <ArchitectureCanvas
          title="Diagram"
          description="Select a module to edit · double-click to add · drag between modules to connect"
        />
      )

    case 'components':
      return (
        <ComponentsSection
          title="Components"
          description="Filter by type or search from the toolbar"
          emptyTitle="No components yet"
          emptyDescription="Add the applications, services, stores and integrations that make up your system."
        />
      )

    case 'services':
      return (
        <ComponentsSection
          title="Services"
          description="Backend services, workers and gateways"
          categories={['backend']}
          emptyTitle="No services yet"
          emptyDescription="Add API gateways, microservices, workers or schedulers to describe your backend."
        />
      )

    case 'database':
      return (
        <ComponentsSection
          title="Database"
          description="Stores, caches and indexes"
          categories={['database']}
          emptyTitle="No data stores yet"
          emptyDescription="Add the databases, caches and object stores your system persists data in."
        />
      )

    case 'integrations':
      return (
        <ComponentsSection
          title="Integrations"
          description="Third-party services this system depends on"
          categories={['integration', 'ai']}
          emptyTitle="No integrations yet"
          emptyDescription="Add payment gateways, email providers, identity providers or AI services."
        />
      )

    case 'api':
      return <ApiSection />

    case 'security':
      return <SecuritySection />

    case 'environments':
      return <EnvironmentsSection />

    case 'data-flow':
      return (
        <ArchitectureCanvas
          view="data-flow"
          title="Data Flow"
          description="How data moves through the system — click a module or drag between them to connect"
        />
      )

    case 'infrastructure':
      return (
        <ComponentsSection
          title="Infrastructure"
          description="Hosting, networking and orchestration"
          categories={['infrastructure']}
          emptyTitle="No infrastructure yet"
          emptyDescription="Add servers, load balancers, container platforms or cloud providers."
        />
      )

    case 'deployment':
      return (
        <ArchitectureCanvas
          view="deployment"
          title="Deployment"
          description="What runs where — add hosts and services, then connect them"
          addCategories={['infrastructure', 'backend', 'application']}
        />
      )

    case 'validation':
      return (
        <UpcomingSection
          title="Validation"
          description="Issues and architecture health score"
          detail="AI validation checks for circular dependencies, single points of failure, missing authentication and scalability risks. It arrives with the validation phase. The Security section already surfaces unencrypted links and missing authentication."
        />
      )

    case 'documentation':
      return <DocumentationSection />

    case 'versions':
      return (
        <UpcomingSection
          title="Versions"
          description="History and visual diff"
          detail="Version snapshots and architecture diff arrive with the versioning phase. Undo and redo already cover the current session."
        />
      )

    default:
      return null
  }
}
