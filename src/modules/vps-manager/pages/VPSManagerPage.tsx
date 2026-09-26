import { useEffect } from 'react'
import { ModulePage, PageContent, PageHeader } from '@/shared/components/layout/ModulePage'
import { VPSDashboard } from '../components/VPSDashboard'
import { ServerWorkspace } from '../components/ServerWorkspace'
import { useVPSStore } from '../stores/vps.store'

export function VPSManagerPage() {
  const { servers, selectedServerId, selectServer, loadServers, subscribeToEvents } = useVPSStore()
  const selectedServer = servers.find((s) => s.id === selectedServerId)

  useEffect(() => {
    void loadServers()
    const unsub = subscribeToEvents()
    return unsub
  }, [loadServers, subscribeToEvents])

  return (
    <ModulePage>
      <PageHeader
        title="VPS Manager"
        description="Manage Linux and Windows servers: monitor resources, deploy projects, browse files, and run commands."
        fluid={!!selectedServer}
      />
      <PageContent fullBleed={!!selectedServer} fluid={!!selectedServer}>
        {selectedServer ? (
          <div className="flex h-full min-h-0 flex-col page-gutter page-stack">
            <ServerWorkspace
              key={selectedServer.id}
              server={selectedServer}
              onBack={() => selectServer(null)}
            />
          </div>
        ) : (
          <VPSDashboard onSelectServer={selectServer} />
        )}
      </PageContent>
    </ModulePage>
  )
}
