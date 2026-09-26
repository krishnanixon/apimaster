import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/components/ui/tabs'
import { CollectionSidebar } from './CollectionSidebar'
import { HistoryPanel } from './HistoryPanel'
import { EnvironmentPanel } from './EnvironmentPanel'
import { useApiStudioStore } from '../stores/apiStudioStore'

export function LeftPanel() {
  const historyCount = useApiStudioStore((s) => s.history.length)
  const envCount = useApiStudioStore((s) => s.environments.length)

  return (
    <Tabs defaultValue="collections" className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-border/60 px-1">
        <TabsList className="h-8 w-full justify-start gap-0 rounded-none bg-transparent p-0">
          <TabsTrigger
            value="collections"
            className="h-8 flex-1 rounded-none border-b-2 border-transparent px-1.5 py-0 text-[11px] data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none"
          >
            Collections
          </TabsTrigger>
          <TabsTrigger
            value="environments"
            className="h-8 flex-1 rounded-none border-b-2 border-transparent px-1.5 py-0 text-[11px] data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none"
          >
            Envs{envCount > 0 ? ` (${envCount})` : ''}
          </TabsTrigger>
          <TabsTrigger
            value="history"
            className="h-8 flex-1 rounded-none border-b-2 border-transparent px-1.5 py-0 text-[11px] data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none"
          >
            History{historyCount > 0 ? ` (${historyCount})` : ''}
          </TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="collections" className="min-h-0 flex-1">
        <CollectionSidebar />
      </TabsContent>
      <TabsContent value="environments" className="min-h-0 flex-1">
        <EnvironmentPanel />
      </TabsContent>
      <TabsContent value="history" className="min-h-0 flex-1">
        <HistoryPanel embedded />
      </TabsContent>
    </Tabs>
  )
}
