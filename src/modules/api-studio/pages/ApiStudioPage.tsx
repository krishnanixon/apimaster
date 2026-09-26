import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Group, Panel, Separator } from 'react-resizable-panels'
import { useApiStudioStore } from '../stores/apiStudioStore'
import { useApiStudioShortcuts } from '../hooks/useApiStudioShortcuts'
import { LeftPanel } from '../components/LeftPanel'
import { RequestTabBar } from '../components/RequestTabBar'
import { ApiStudioToolbar } from '../components/ApiStudioToolbar'
import { UrlBar } from '../components/request/UrlBar'
import { RequestBuilder } from '../components/RequestBuilder'
import { ResponseViewer } from '../components/ResponseViewer'
import { SaveRequestDialog } from '../components/SaveRequestDialog'
import { CodeSnippetDialog } from '../components/CodeSnippetDialog'
import { ImportCollectionDialog } from '../components/ImportCollectionDialog'
import { StartScreen } from '../components/StartScreen'
import { readLaunchIntent, SAMPLE_REQUEST_URL } from '../services/launchIntent'
import { createDefaultAuth, createDefaultBody, createEmptyKeyValue, splitUrlAndParams } from '../services/requestBuilder'
import { createDefaultGraphQLConfig } from '../services/graphql/model'
import { consumeWorkspaceLoadMeta } from '../services/workspaceStorage'
import { BootScreen } from '@/shared/components/BootScreen'

function useWorkspaceHydrated(): boolean {
  const [hydrated, setHydrated] = useState(() => useApiStudioStore.persist.hasHydrated())
  useEffect(() => {
    if (useApiStudioStore.persist.hasHydrated()) {
      setHydrated(true)
      return
    }
    return useApiStudioStore.persist.onFinishHydration(() => setHydrated(true))
  }, [])
  return hydrated
}

export function ApiStudioPage() {
  const [saveDialogOpen, setSaveDialogOpen] = useState(false)
  const [codeDialogOpen, setCodeDialogOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [importTab, setImportTab] = useState<'file' | 'collection' | 'curl'>('file')

  useApiStudioShortcuts({ onSaveAs: () => setSaveDialogOpen(true) })

  const location = useLocation()
  const navigate = useNavigate()
  // Refs survive StrictMode's double effect run, so an intent is never applied twice.
  const handledIntentKey = useRef<string | null>(null)

  const tabs = useApiStudioStore((s) => s.tabs)
  const collections = useApiStudioStore((s) => s.collections)
  const activeTabId = useApiStudioStore((s) => s.activeTabId)
  const openScratchTab = useApiStudioStore((s) => s.openScratchTab)
  const updateDraft = useApiStudioStore((s) => s.updateDraft)
  const sendTabRequest = useApiStudioStore((s) => s.sendTabRequest)
  const cancelTabRequest = useApiStudioStore((s) => s.cancelTabRequest)
  const saveTab = useApiStudioStore((s) => s.saveTab)
  const saveTabAs = useApiStudioStore((s) => s.saveTabAs)
  const connectWebSocket = useApiStudioStore((s) => s.connectWebSocket)
  const disconnectWebSocket = useApiStudioStore((s) => s.disconnectWebSocket)
  const workspaceSplit = useApiStudioStore((s) => s.workspaceSplit)
  const hydrated = useWorkspaceHydrated()

  useEffect(() => {
    if (!hydrated) return
    const meta = consumeWorkspaceLoadMeta()
    if (!meta) return
    if (meta.restored) toast.message('Recovered your workspace from the last good backup.')
    else if (!meta.encrypted && meta.source !== 'none') {
      toast.message('Secure storage is unavailable, so the workspace file is not encrypted.')
    }
  }, [hydrated])

  useEffect(() => {
    if (!hydrated) return
    const intent = readLaunchIntent(location.state)
    if (!intent || handledIntentKey.current === location.key) return
    handledIntentKey.current = location.key
    if (intent === 'new-request') {
      openScratchTab({ name: 'Sample request', url: SAMPLE_REQUEST_URL })
    } else {
      setImportTab('file')
      setImportOpen(true)
    }
    navigate(location.pathname + location.search, { replace: true, state: null })
  }, [hydrated, location, navigate, openScratchTab])

  if (!hydrated) {
    return <BootScreen message="Loading workspace…" />
  }

  const activeTab = tabs.find((t) => t.id === activeTabId)
  const hasActiveTab = Boolean(activeTabId && activeTab)
  const isVertical = workspaceSplit === 'vertical'

  function handleUrlChange(value: string) {
    if (!activeTab) return
    const { request } = activeTab
    if (value.includes('?')) {
      const { base, params } = splitUrlAndParams(value)
      const existingKeys = new Set(request.queryParams.map((p) => p.key))
      const merged = [...request.queryParams.filter((p) => p.key.trim()), ...params.filter((p) => !existingKeys.has(p.key))]
      updateDraft(activeTabId!, { url: base, queryParams: merged.length > 0 ? merged : [createEmptyKeyValue()] })
    } else {
      updateDraft(activeTabId!, { url: value })
    }
  }

  function handleSave() {
    if (!activeTabId) return
    if (activeTab?.collectionId) saveTab(activeTabId)
    else setSaveDialogOpen(true)
  }

  function handleClear() {
    if (!activeTabId || !activeTab) return
    updateDraft(activeTabId, {
      headers: [createEmptyKeyValue()],
      queryParams: [createEmptyKeyValue()],
      pathParams: [],
      body: createDefaultBody(),
      auth: createDefaultAuth(),
      tests: '',
      preRequestScript: '',
      description: '',
      ...(activeTab.request.requestType === 'graphql'
        ? { graphql: { ...(activeTab.request.graphql ?? createDefaultGraphQLConfig()), query: '', variables: '{\n}', operationName: undefined } }
        : {})
    })
  }

  return (
    <div className="api-studio-compact flex h-full min-h-0 flex-col bg-background">
      <Group id="api-studio-layout" orientation="horizontal" className="min-h-0 w-full flex-1">
        <Panel id="api-studio-sidebar" defaultSize="18%" minSize="200px" maxSize="38%" className="min-w-0">
          <div className="api-studio-sidebar h-full min-w-0 overflow-hidden border-r border-border/60 bg-muted/10">
            <LeftPanel />
          </div>
        </Panel>

        <Separator className="w-px shrink-0 bg-border/60 transition-colors hover:bg-primary/40" />

        <Panel id="api-studio-workspace" className="min-w-0">
          <div className="flex h-full min-w-0 flex-col overflow-hidden">
            <RequestTabBar />

            {hasActiveTab && activeTab ? (
              <>
                <ApiStudioToolbar
                  tabId={activeTabId!}
                  onSave={handleSave}
                  onClear={handleClear}
                  onViewCode={() => setCodeDialogOpen(true)}
                />

                <UrlBar
                  method={activeTab.request.method}
                  url={activeTab.request.url}
                  loading={activeTab.loading}
                  isWebSocket={activeTab.request.requestType === 'websocket'}
                  isGraphQL={activeTab.request.requestType === 'graphql'}
                  wsConnected={activeTab.wsConnected}
                  wsConnecting={activeTab.wsConnecting}
                  onMethodChange={(method) => updateDraft(activeTabId!, { method })}
                  onUrlChange={handleUrlChange}
                  onSend={() => void sendTabRequest(activeTabId!)}
                  onCancel={() => void cancelTabRequest(activeTabId!)}
                  onConnect={() => void connectWebSocket(activeTabId!)}
                  onDisconnect={() => disconnectWebSocket(activeTabId!)}
                />

                <Group
                  key={workspaceSplit}
                  id={`api-studio-split-${workspaceSplit}`}
                  orientation={isVertical ? 'vertical' : 'horizontal'}
                  className="min-h-0 flex-1"
                >
                  <Panel
                    id="api-studio-request"
                    defaultSize={isVertical ? '48%' : '50%'}
                    minSize={isVertical ? '140px' : '260px'}
                    className="min-h-0 min-w-0"
                  >
                    <div className="h-full min-h-0 overflow-hidden">
                      <RequestBuilder tabId={activeTabId!} />
                    </div>
                  </Panel>

                  <Separator
                    className={
                      isVertical
                        ? 'h-px shrink-0 bg-border/60 transition-colors hover:bg-primary/40'
                        : 'w-px shrink-0 bg-border/60 transition-colors hover:bg-primary/40'
                    }
                  />

                  <Panel id="api-studio-response" className="min-h-0 min-w-0">
                    <div className="h-full min-h-0 overflow-hidden">
                      <ResponseViewer tabId={activeTabId!} />
                    </div>
                  </Panel>
                </Group>
              </>
            ) : (
              <StartScreen
                onImport={(tab) => {
                  setImportTab(tab)
                  setImportOpen(true)
                }}
              />
            )}
          </div>
        </Panel>
      </Group>

      {activeTab && (
        <>
          <SaveRequestDialog
            open={saveDialogOpen}
            onOpenChange={setSaveDialogOpen}
            requestName={activeTab.request.name}
            onConfirm={(collectionId, folderId, name) => saveTabAs(activeTabId!, collectionId, folderId, name)}
          />
          <CodeSnippetDialog
            open={codeDialogOpen}
            onOpenChange={setCodeDialogOpen}
            request={activeTab.request}
            collection={
              activeTab.collectionId
                ? collections.find((c) => c.id === activeTab.collectionId)
                : undefined
            }
          />
        </>
      )}
      <ImportCollectionDialog open={importOpen} onOpenChange={setImportOpen} defaultTab={importTab} />
    </div>
  )
}
