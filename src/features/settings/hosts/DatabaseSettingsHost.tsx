import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Database, ExternalLink } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { DbWorkspaceSettingsPanel } from '@/modules/database-studio/components/settings/DbWorkspaceSettingsPanel'
import { ConnectionManagerPanel } from '@/modules/database-studio/components/connections/ConnectionManagerPanel'
import { useDbWorkspaceStore } from '@/modules/database-studio/stores/dbWorkspace.store'
import {
  SettingsGroup,
  SettingsNote,
  SettingsSection
} from '@/features/settings/components/SettingsSection'

export function DatabaseWorkspaceSettingsPanel() {
  const loadSettings = useDbWorkspaceStore((s) => s.loadSettings)
  const loadConnections = useDbWorkspaceStore((s) => s.loadConnections)

  useEffect(() => {
    void loadSettings()
    void loadConnections()
  }, [loadSettings, loadConnections])

  return (
    <SettingsSection>
      <div className="space-y-6">
        <SettingsNote
          icon={Database}
          title="Database Workbench"
          action={
            <Button variant="outline" size="sm" asChild>
              <Link to="/database-studio">
                Open workspace
                <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
              </Link>
            </Button>
          }
        >
          Manage global database connections and workspace defaults here. Open the full IDE for
          querying, schema exploration, and AI analysis.
        </SettingsNote>

        <SettingsGroup
          title="Workspace defaults"
          description="Query limits, editor behavior, grid density, and AI options for Database Workbench."
        >
          <DbWorkspaceSettingsPanel />
        </SettingsGroup>

        <SettingsGroup
          title="Connections"
          description="Create and manage global or project-scoped database connections. Credentials are encrypted locally."
        >
          <ConnectionManagerPanel />
        </SettingsGroup>
      </div>
    </SettingsSection>
  )
}
