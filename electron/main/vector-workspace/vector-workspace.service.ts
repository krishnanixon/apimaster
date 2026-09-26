import { vectorWorkspaceRepository } from '../repositories/vector-workspace.repository'
import { VectorHttpClient } from './vector-http-client'
import type { AppScope } from '@shared/types/scope'
import type {
  CreateVectorConnectionInput,
  UpdateVectorConnectionInput,
  VectorConnection,
  VectorConnectionSecrets,
  VectorConnectionTestResult,
  VectorExplorerNode,
  VectorWorkspaceSettings,
  CreateVectorCollectionInput,
  VectorUpsertInput,
  VectorDeleteInput,
  VectorSearchInput,
  VectorGetInput,
  VectorGetResult,
  VectorTextSearchInput,
  VectorTextUpsertInput,
  VectorCollectionStats,
  VectorSearchResult
} from '@shared/types/vector-workspace'

class VectorWorkspaceService {
  private readonly activeSessions = new Set<string>()

  async listConnections(filter?: {
    scope?: AppScope
    projectId?: string | null
  }): Promise<VectorConnection[]> {
    return vectorWorkspaceRepository.listConnections(filter)
  }

  async getConnection(id: string): Promise<VectorConnection | null> {
    return vectorWorkspaceRepository.getConnection(id)
  }

  async getConnectionSecrets(id: string): Promise<VectorConnectionSecrets> {
    return vectorWorkspaceRepository.getConnectionSecrets(id)
  }

  async createConnection(input: CreateVectorConnectionInput): Promise<VectorConnection> {
    return vectorWorkspaceRepository.createConnection(input)
  }

  async updateConnection(
    id: string,
    input: UpdateVectorConnectionInput
  ): Promise<VectorConnection | null> {
    return vectorWorkspaceRepository.updateConnection(id, input)
  }

  async deleteConnection(id: string): Promise<void> {
    this.activeSessions.delete(id)
    await vectorWorkspaceRepository.deleteConnection(id)
  }

  async duplicateConnection(id: string): Promise<VectorConnection | null> {
    return vectorWorkspaceRepository.duplicateConnection(id)
  }

  private async clientFor(connectionId: string): Promise<VectorHttpClient> {
    const conn = await vectorWorkspaceRepository.getConnection(connectionId)
    if (!conn) throw new Error('Connection not found')
    const secrets = await vectorWorkspaceRepository.getConnectionSecrets(connectionId)
    return new VectorHttpClient({ config: conn.config, secrets })
  }

  private async clientForConfig(input: CreateVectorConnectionInput): Promise<VectorHttpClient> {
    return new VectorHttpClient({ config: input.config, secrets: input.secrets })
  }

  async testConnectionConfig(input: CreateVectorConnectionInput): Promise<VectorConnectionTestResult> {
    const started = Date.now()
    try {
      const client = await this.clientForConfig(input)
      const health = await client.health()
      let version: { version: string; name: string } | null = null
      try {
        version = await client.version()
      } catch {
        /* optional */
      }
      const latencyMs = Date.now() - started
      return {
        success: health.status === 'ok',
        latencyMs,
        serverVersion: version?.version ?? null,
        serverName: version?.name ?? 'LiteChroma',
        message: health.status === 'ok' ? `Healthy (${latencyMs}ms)` : `Status: ${health.status}`
      }
    } catch (e) {
      return {
        success: false,
        latencyMs: Date.now() - started,
        serverVersion: null,
        serverName: null,
        message: e instanceof Error ? e.message : 'Connection test failed'
      }
    }
  }

  async testConnection(id: string): Promise<VectorConnectionTestResult> {
    const conn = await vectorWorkspaceRepository.getConnection(id)
    if (!conn) {
      return {
        success: false,
        latencyMs: 0,
        serverVersion: null,
        serverName: null,
        message: 'Connection not found'
      }
    }
    const secrets = await vectorWorkspaceRepository.getConnectionSecrets(id)
    const result = await this.testConnectionConfig({
      name: conn.name,
      provider: conn.provider,
      scope: conn.scope,
      projectId: conn.projectId,
      config: conn.config,
      secrets
    })
    await vectorWorkspaceRepository.updateHealth(id, {
      health: result.success ? 'healthy' : 'offline',
      latencyMs: result.latencyMs,
      serverVersion: result.serverVersion
    })
    return result
  }

  async connect(id: string): Promise<void> {
    const result = await this.testConnection(id)
    if (!result.success) throw new Error(result.message)
    this.activeSessions.add(id)
    await vectorWorkspaceRepository.updateHealth(id, {
      health: 'healthy',
      latencyMs: result.latencyMs,
      serverVersion: result.serverVersion,
      lastConnectedAt: new Date().toISOString()
    })
  }

  async disconnect(id: string): Promise<void> {
    this.activeSessions.delete(id)
  }

  async getExplorer(connectionId: string): Promise<VectorExplorerNode[]> {
    const client = await this.clientFor(connectionId)
    const [names, stats] = await Promise.all([client.listCollections(), client.stats().catch(() => null)])
    const detailsByName = new Map(
      (stats?.details ?? []).map((d) => [d.name, d] as const)
    )

    return names.map((name) => {
      const detail = detailsByName.get(name)
      return {
        id: `collection:${connectionId}:${name}`,
        type: 'collection' as const,
        name,
        connectionId,
        collection: name,
        metadata: detail
          ? {
              dimension: detail.dimension,
              metric: detail.metric,
              index: detail.index,
              count: detail.count
            }
          : undefined
      }
    })
  }

  async getHealth(connectionId: string) {
    return (await this.clientFor(connectionId)).health()
  }

  async getVersion(connectionId: string) {
    return (await this.clientFor(connectionId)).version()
  }

  async getStats(connectionId: string) {
    return (await this.clientFor(connectionId)).stats()
  }

  async listCollections(connectionId: string) {
    return (await this.clientFor(connectionId)).listCollections()
  }

  async createCollection(connectionId: string, input: CreateVectorCollectionInput) {
    return (await this.clientFor(connectionId)).createCollection(input)
  }

  async deleteCollection(connectionId: string, name: string) {
    return (await this.clientFor(connectionId)).deleteCollection(name)
  }

  async renameCollection(connectionId: string, name: string, newName: string) {
    return (await this.clientFor(connectionId)).renameCollection(name, newName)
  }

  async getCollectionStats(
    connectionId: string,
    name: string
  ): Promise<VectorCollectionStats | null> {
    const stats = await this.getStats(connectionId)
    return stats.details.find((d) => d.name === name) ?? null
  }

  async upsertVectors(connectionId: string, input: VectorUpsertInput) {
    return (await this.clientFor(connectionId)).upsertVectors(input)
  }

  async deleteVectors(connectionId: string, input: VectorDeleteInput) {
    return (await this.clientFor(connectionId)).deleteVectors(input)
  }

  async getVector(connectionId: string, collection: string, id: string) {
    return (await this.clientFor(connectionId)).getVector(collection, id)
  }

  async getVectors(connectionId: string, input: VectorGetInput): Promise<VectorGetResult> {
    const result = await (await this.clientFor(connectionId)).getVectors(input)
    return {
      ids: result.ids ?? [],
      metadatas: result.metadatas ?? [],
      documents: result.documents ?? [],
      embeddings: result.embeddings,
      total: typeof result.total === 'number' ? result.total : (result.ids?.length ?? 0)
    }
  }

  async search(connectionId: string, input: VectorSearchInput) {
    return (await this.clientFor(connectionId)).search(input)
  }

  async searchWithText(
    connectionId: string,
    input: VectorTextSearchInput
  ): Promise<VectorSearchResult> {
    const { ragService } = await import('../rag/rag.service')
    const query = input.query.trim()
    if (!query) throw new Error('Query text is required')

    const stats = await this.getCollectionStats(connectionId, input.collection)
    const targetDimension = stats?.dimension
    const { embeddings } = await ragService.embedTextsPublic(
      [query],
      targetDimension ? { targetDimension } : undefined
    )

    return this.search(connectionId, {
      collection: input.collection,
      query_embeddings: embeddings,
      top_k: input.top_k,
      where: input.where,
      score_threshold: input.score_threshold,
      include_metadata: input.include_metadata ?? true,
      include_documents: input.include_documents ?? true,
      include_embeddings: input.include_embeddings ?? false,
      include_distances: input.include_distances ?? true
    })
  }

  async upsertWithText(
    connectionId: string,
    input: VectorTextUpsertInput
  ): Promise<{ status: string; count: number }> {
    const { ragService } = await import('../rag/rag.service')
    if (!input.ids?.length || !input.documents?.length) {
      throw new Error('ids and documents are required')
    }
    if (input.ids.length !== input.documents.length) {
      throw new Error('ids and documents must have the same length')
    }
    if (input.documents.some((d) => !d?.trim())) {
      throw new Error('All documents must be non-empty')
    }

    const stats = await this.getCollectionStats(connectionId, input.collection)
    const targetDimension = stats?.dimension
    const { embeddings } = await ragService.embedTextsPublic(
      input.documents,
      targetDimension ? { targetDimension } : undefined
    )

    return this.upsertVectors(connectionId, {
      collection: input.collection,
      ids: input.ids,
      embeddings,
      documents: input.documents,
      metadatas: input.metadatas
    })
  }

  async backup(connectionId: string, destination: string) {
    return (await this.clientFor(connectionId)).backup(destination)
  }

  async restore(connectionId: string, source: string) {
    return (await this.clientFor(connectionId)).restore(source)
  }

  async getSettings(): Promise<VectorWorkspaceSettings> {
    return vectorWorkspaceRepository.getSettings()
  }

  async saveSettings(
    patch: Partial<VectorWorkspaceSettings>
  ): Promise<VectorWorkspaceSettings> {
    return vectorWorkspaceRepository.saveSettings(patch)
  }
}

export const vectorWorkspaceService = new VectorWorkspaceService()
