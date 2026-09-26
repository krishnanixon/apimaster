import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Boxes, ExternalLink } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { VectorWorkspaceSettingsPanel } from '@/modules/vector-studio/components/settings/VectorWorkspaceSettingsPanel'
import { VectorConnectionManagerPanel } from '@/modules/vector-studio/components/connections/VectorConnectionManagerPanel'
import { useVectorWorkspaceStore } from '@/modules/vector-studio/stores/vectorWorkspace.store'
import {
  SettingsGroup,
  SettingsNote,
  SettingsSection
} from '@/features/settings/components/SettingsSection'

export function VectorWorkspaceSettingsPanelHost() {
  const loadSettings = useVectorWorkspaceStore((s) => s.loadSettings)
  const loadConnections = useVectorWorkspaceStore((s) => s.loadConnections)

  useEffect(() => {
    void loadSettings()
    void loadConnections()
  }, [loadSettings, loadConnections])

  return (
    <SettingsSection>
      <div className="space-y-6">
        <SettingsNote
          icon={Boxes}
          title="Vector Studio"
          action={
            <Button variant="outline" size="sm" asChild>
              <Link to="/vector-studio">
                Open workspace
                <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
              </Link>
            </Button>
          }
        >
          Manage LiteChroma connections, search defaults, and RAG for project AI. Start the vector
          server from <code className="text-[10px]">chroma-light-db</code> (
          <code className="text-[10px]">python server.py</code>), then index a project from
          Knowledge → Index for RAG.
        </SettingsNote>

        <SettingsGroup
          title="Workspace defaults"
          description="Default dimension, metric, top-k, and include flags for search and new collections."
        >
          <VectorWorkspaceSettingsPanel />
        </SettingsGroup>

        <SettingsGroup
          title="Connections"
          description="Host, port, and optional API key for LiteChroma HTTP servers. Credentials are encrypted locally."
        >
          <VectorConnectionManagerPanel />
        </SettingsGroup>
      </div>
    </SettingsSection>
  )
}
