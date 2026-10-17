import { useMemo } from 'react'
import { Tabs, TabsContent } from '@/shared/components/ui/tabs'
import { EmptyState } from '@/shared/components/ui/empty-state'
import { Webhook } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { useApiStudioStore } from '../stores/apiStudioStore'
import { ParamsTab } from './request/ParamsTab'
import { HeadersTab } from './request/HeadersTab'
import { BodyTab } from './request/BodyTab'
import { AuthTab } from './request/AuthTab'
import { PreRequestTab } from './request/PreRequestTab'
import { TestsTab } from './request/TestsTab'
import { NotesTab } from './request/NotesTab'
import { SettingsTab } from './request/SettingsTab'
import { WebSocketPanel } from './request/WebSocketPanel'
import { GraphQLQueryEditor } from './request/GraphQLQueryEditor'
import { GraphQLVariablesEditor } from './request/GraphQLVariablesEditor'
import { AIAssistMenu } from './AIAssistMenu'
import { useApiStudioAi } from '../hooks/useApiStudioAi'
import {
  describeInheritParent,
  isAuthConfigured,
  listInheritedHeaders,
  parentPreRequestScripts,
  resolveInheritedAuth
} from '../services/inheritance'
import type { ApiCollection, ApiRequest, RequestTab } from '../types/api.types'
import { inspectGraphQL } from '../services/graphql/document'
import { createDefaultGraphQLConfig } from '../services/graphql/model'
import { graphQLSchemaStatus, schemaFromIntrospection } from '../services/graphql/schema'

const HTTP_TABS: { id: RequestTab; label: string }[] = [
  { id: 'params', label: 'Params' },
  { id: 'auth', label: 'Auth' },
  { id: 'headers', label: 'Headers' },
  { id: 'body', label: 'Body' },
  { id: 'notes', label: 'Notes' },
  { id: 'pre-request', label: 'Scripts' },
  { id: 'tests', label: 'Tests' },
  { id: 'settings', label: 'Settings' }
]

const GRAPHQL_TABS: { id: RequestTab; label: string }[] = [
  { id: 'query', label: 'Query' },
  { id: 'variables', label: 'Variables' },
  { id: 'auth', label: 'Auth' },
  { id: 'headers', label: 'Headers' },
  { id: 'notes', label: 'Notes' },
  { id: 'pre-request', label: 'Scripts' },
  { id: 'tests', label: 'Tests' },
  { id: 'settings', label: 'Settings' }
]

function enabledCount(pairs: { enabled: boolean; key: string }[]): number {
  return pairs.filter((p) => p.enabled && p.key.trim()).length
}

function tabBadge(
  request: ApiRequest,
  tab: RequestTab,
  collection?: ApiCollection
): string | null {
  switch (tab) {
    case 'params': {
      const n = enabledCount(request.queryParams) + enabledCount(request.pathParams ?? [])
      return n > 0 ? String(n) : null
    }
    case 'headers': {
      const n = enabledCount(request.headers) + listInheritedHeaders(request, collection).length
      return n > 0 ? String(n) : null
    }
    case 'body':
      return request.body.type !== 'none' ? '●' : null
    case 'query':
      return request.graphql?.query.trim() ? '●' : null
    case 'variables':
      return request.graphql?.variables.trim() && request.graphql.variables.trim() !== '{}' ? '●' : null
    case 'notes':
      return request.description?.trim() ? '●' : null
    case 'auth': {
      if (request.auth.type === 'inherit') {
        return isAuthConfigured(resolveInheritedAuth(request, collection).auth) ? '●' : null
      }
      return request.auth.type !== 'none' ? '●' : null
    }
    case 'pre-request':
      return request.preRequestScript?.trim() || parentPreRequestScripts(request, collection).length > 0
        ? '●'
        : null
    case 'tests':
      return request.tests?.trim() ? '●' : null
    default:
      return null
  }
}

export function RequestBuilder({ tabId }: { tabId: string }) {
  const tab = useApiStudioStore((s) => s.tabs.find((t) => t.id === tabId))
  const collections = useApiStudioStore((s) => s.collections)
  const updateDraft = useApiStudioStore((s) => s.updateDraft)
  const setRequestView = useApiStudioStore((s) => s.setRequestView)
  const runTabTests = useApiStudioStore((s) => s.runTabTests)
  const fetchGraphQLSchema = useApiStudioStore((s) => s.fetchGraphQLSchema)
  const formatGraphQLQuery = useApiStudioStore((s) => s.formatGraphQLQuery)
  const sendWebSocketMessage = useApiStudioStore((s) => s.sendWebSocketMessage)
  const clearWebSocketMessages = useApiStudioStore((s) => s.clearWebSocketMessages)
  const connectWebSocket = useApiStudioStore((s) => s.connectWebSocket)
  const disconnectWebSocket = useApiStudioStore((s) => s.disconnectWebSocket)
  const ai = useApiStudioAi(tabId)
  const request = tab?.request
  const isGraphQL = request?.requestType === 'graphql'
  const graphqlConfig = request?.graphql ?? createDefaultGraphQLConfig()
  const graphqlSchema = useMemo(
    () => (isGraphQL ? schemaFromIntrospection(graphqlConfig.schema?.introspection) : null),
    [graphqlConfig.schema?.introspection, isGraphQL]
  )
  const graphqlInspection = useMemo(
    () =>
      inspectGraphQL({
        query: graphqlConfig.query,
        variablesText: graphqlConfig.variables,
        operationName: graphqlConfig.operationName,
        schema: graphqlSchema
      }),
    [graphqlConfig.operationName, graphqlConfig.query, graphqlConfig.variables, graphqlSchema]
  )

  if (!tab || !request) {
    return (
      <div className="flex h-full items-center justify-center">
        <EmptyState icon={<Webhook className="h-5 w-5" />} title="No request open" description="Select or create a request." />
      </div>
    )
  }

  const isWebSocket = request.requestType === 'websocket'
  const schemaStatus = graphQLSchemaStatus(request.url, graphqlConfig.schema, tab.graphqlSchemaLoading)
  const subTabs = isGraphQL ? GRAPHQL_TABS : HTTP_TABS
  const requestView =
    isGraphQL && (tab.requestView === 'params' || tab.requestView === 'body')
      ? 'query'
      : !isGraphQL && (tab.requestView === 'query' || tab.requestView === 'variables')
        ? 'params'
        : tab.requestView
  const collection = tab.collectionId ? collections.find((c) => c.id === tab.collectionId) : undefined
  const inherit =
    collection != null
      ? {
          parentLabel: describeInheritParent(request, collection),
          resolved: resolveInheritedAuth(request, collection).auth
        }
      : null
  const inheritedHeaders = listInheritedHeaders(request, collection)
  const parentScripts = parentPreRequestScripts(request, collection)

  if (isWebSocket) {
    return (
      <WebSocketPanel
        url={request.url}
        connected={tab.wsConnected}
        connecting={tab.wsConnecting}
        messages={tab.wsMessages}
        onConnect={() => void connectWebSocket(tabId)}
        onDisconnect={() => disconnectWebSocket(tabId)}
        onSend={(message) => sendWebSocketMessage(tabId, message)}
        onClear={() => clearWebSocketMessages(tabId)}
      />
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Tabs
        value={requestView}
        onValueChange={(v) => setRequestView(tabId, v as RequestTab)}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border/60 px-1">
          <div className="flex min-w-0 flex-1 items-center overflow-x-auto">
            {subTabs.map((st) => {
              const badge = tabBadge(request, st.id, collection)
              const active = requestView === st.id
              return (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => setRequestView(tabId, st.id)}
                  className={cn(
                    'flex shrink-0 items-center gap-1 border-b-2 px-2.5 py-2 text-xs transition-colors',
                    active
                      ? 'border-foreground text-foreground'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  )}
                >
                  {st.label}
                  {badge && (
                    <span
                      className={cn(
                        'text-[10px]',
                        badge === '●' ? 'text-emerald-500' : 'text-muted-foreground'
                      )}
                    >
                      {badge !== '●' ? badge : '●'}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
          <div className="shrink-0 px-1">
            <AIAssistMenu tabId={tabId} compact />
          </div>
        </div>

        <div className="relative min-h-0 flex-1 overflow-hidden">
          {isGraphQL && (
            <>
              <TabsContent value="query" className="absolute inset-0 mt-0 flex flex-col overflow-hidden data-[state=inactive]:hidden">
                <GraphQLQueryEditor
                  query={graphqlConfig.query}
                  operationName={graphqlConfig.operationName}
                  inspection={graphqlInspection}
                  schema={graphqlSchema}
                  schemaStatus={schemaStatus}
                  schemaDetail={graphqlConfig.schema?.error}
                  schemaLoading={tab.graphqlSchemaLoading}
                  onQuery={(query) => updateDraft(tabId, { graphql: { ...graphqlConfig, query } })}
                  onOperationName={(operationName) => updateDraft(tabId, { graphql: { ...graphqlConfig, operationName } })}
                  onFormat={() => formatGraphQLQuery(tabId)}
                  onFetchSchema={() => void fetchGraphQLSchema(tabId)}
                />
              </TabsContent>
              <TabsContent value="variables" className="absolute inset-0 mt-0 flex flex-col overflow-hidden data-[state=inactive]:hidden">
                <GraphQLVariablesEditor
                  value={graphqlConfig.variables}
                  inspection={graphqlInspection}
                  onChange={(variables) => updateDraft(tabId, { graphql: { ...graphqlConfig, variables } })}
                />
              </TabsContent>
            </>
          )}
          <TabsContent value="params" className="absolute inset-0 mt-0 overflow-y-auto data-[state=inactive]:hidden">
            <ParamsTab
              params={request.queryParams}
              pathParams={request.pathParams ?? []}
              onChange={(queryParams) => updateDraft(tabId, { queryParams })}
              onPathParamsChange={(pathParams) => updateDraft(tabId, { pathParams })}
              secretToggle={Boolean(collection?.folder?.path)}
            />
          </TabsContent>
          <TabsContent value="headers" className="absolute inset-0 mt-0 overflow-y-auto data-[state=inactive]:hidden">
            <HeadersTab
              headers={request.headers}
              onChange={(headers) => updateDraft(tabId, { headers })}
              inheritedHeaders={inheritedHeaders}
              secretToggle={Boolean(collection?.folder?.path)}
            />
          </TabsContent>
          <TabsContent
            value="body"
            className="absolute inset-0 mt-0 flex flex-col overflow-hidden data-[state=inactive]:hidden"
          >
            <BodyTab
              body={request.body}
              onChange={(body) => updateDraft(tabId, { body })}
              fillingAI={ai.busy}
              onFillWithAI={() => ai.fillBody()}
            />
          </TabsContent>
          <TabsContent
            value="notes"
            className="absolute inset-0 mt-0 flex flex-col overflow-hidden data-[state=inactive]:hidden"
          >
            <NotesTab
              request={request}
              description={request.description ?? ''}
              onChange={(description) => updateDraft(tabId, { description })}
              onGenerateWithAI={() => ai.describeNotes()}
            />
          </TabsContent>
          <TabsContent value="auth" className="absolute inset-0 mt-0 overflow-y-auto data-[state=inactive]:hidden">
            <AuthTab
              auth={request.auth}
              onChange={(auth) => updateDraft(tabId, { auth })}
              inherit={inherit}
            />
          </TabsContent>
          <TabsContent
            value="pre-request"
            className="absolute inset-0 mt-0 flex flex-col overflow-hidden data-[state=inactive]:hidden"
          >
            <PreRequestTab
              script={request.preRequestScript ?? ''}
              onChange={(preRequestScript) => updateDraft(tabId, { preRequestScript })}
              onGenerateWithAI={() => ai.fillScript()}
              parentScripts={parentScripts}
            />
          </TabsContent>
          <TabsContent
            value="tests"
            className="absolute inset-0 mt-0 flex flex-col overflow-hidden data-[state=inactive]:hidden"
          >
            <TestsTab
              script={request.tests ?? ''}
              onChange={(tests) => updateDraft(tabId, { tests })}
              testResults={tab.testResults}
              hasResponse={Boolean(tab.response)}
              onRunTests={() => runTabTests(tabId)}
              onGenerateWithAI={() => ai.generateTests()}
            />
          </TabsContent>
          <TabsContent value="settings" className="absolute inset-0 mt-0 overflow-y-auto data-[state=inactive]:hidden">
            <SettingsTab
              timeoutMs={request.timeoutMs ?? 30_000}
              onChange={(timeoutMs) => updateDraft(tabId, { timeoutMs })}
            />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  )
}
