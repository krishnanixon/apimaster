import {
  buildVectorBaseUrl,
  type VectorConnectionConfig,
  type VectorConnectionSecrets,
  type CreateVectorCollectionInput,
  type VectorUpsertInput,
  type VectorDeleteInput,
  type VectorSearchInput,
  type VectorSearchResult,
  type VectorRecord,
  type VectorCollectionStats,
  type VectorDbStats,
  type VectorHealthInfo,
  type VectorVersionInfo
} from '@shared/types/vector-workspace'

export class VectorHttpError extends Error {
  constructor(
    message: string,
    public status: number,
    public body?: string
  ) {
    super(message)
    this.name = 'VectorHttpError'
  }
}

export interface VectorHttpClientOptions {
  config: VectorConnectionConfig
  secrets?: VectorConnectionSecrets
}

export class VectorHttpClient {
  private readonly baseUrl: string
  private readonly timeoutMs: number
  private readonly apiKey?: string

  constructor(opts: VectorHttpClientOptions) {
    this.baseUrl = buildVectorBaseUrl(opts.config)
    this.timeoutMs = opts.config.connectionTimeoutMs ?? 10000
    this.apiKey = opts.secrets?.apiKey?.trim() || undefined
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json'
    }
    if (this.apiKey) {
      h['X-Api-Key'] = this.apiKey
      h.Authorization = `Bearer ${this.apiKey}`
    }
    return h
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: this.headers(),
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal
      })
      const text = await res.text()
      let data: unknown = null
      if (text) {
        try {
          data = JSON.parse(text)
        } catch {
          data = text
        }
      }
      if (!res.ok) {
        const detail =
          data && typeof data === 'object' && data !== null && 'detail' in data
            ? String((data as { detail: unknown }).detail)
            : text || res.statusText
        throw new VectorHttpError(detail || `HTTP ${res.status}`, res.status, text)
      }
      return data as T
    } catch (e) {
      if (e instanceof VectorHttpError) throw e
      if (e instanceof Error && e.name === 'AbortError') {
        throw new Error(`Request timed out after ${this.timeoutMs}ms`)
      }
      throw e instanceof Error ? e : new Error(String(e))
    } finally {
      clearTimeout(timer)
    }
  }

  health(): Promise<VectorHealthInfo> {
    return this.request('GET', '/health')
  }

  version(): Promise<VectorVersionInfo> {
    return this.request('GET', '/version')
  }

  stats(): Promise<VectorDbStats> {
    return this.request('GET', '/stats')
  }

  async listCollections(): Promise<string[]> {
    const res = await this.request<{ collections: string[] }>('GET', '/collections')
    return res.collections ?? []
  }

  createCollection(input: CreateVectorCollectionInput): Promise<VectorCollectionStats> {
    return this.request('POST', '/collections', {
      name: input.name,
      dimension: input.dimension,
      metric: input.metric ?? 'cosine',
      index: input.index ?? 'flat'
    })
  }

  deleteCollection(name: string): Promise<{ status: string; name: string }> {
    return this.request('DELETE', `/collections/${encodeURIComponent(name)}`)
  }

  renameCollection(name: string, newName: string): Promise<VectorCollectionStats> {
    return this.request('PATCH', `/collections/${encodeURIComponent(name)}`, { name: newName })
  }

  upsertVectors(input: VectorUpsertInput): Promise<{ status: string; count: number }> {
    return this.request('POST', '/vectors', input)
  }

  deleteVectors(input: VectorDeleteInput): Promise<{ status: string; deleted: number }> {
    return this.request('DELETE', '/vectors', input)
  }

  getVector(collection: string, id: string): Promise<VectorRecord> {
    return this.request(
      'GET',
      `/vectors/${encodeURIComponent(collection)}/${encodeURIComponent(id)}`
    )
  }

  getVectors(input: {
    collection: string
    ids?: string[]
    where?: Record<string, unknown>
    limit?: number
    offset?: number
    include_embeddings?: boolean
  }): Promise<{
    ids: string[]
    metadatas: Array<Record<string, unknown> | null>
    documents: Array<string | null>
    embeddings?: number[][]
    total: number
  }> {
    return this.request('POST', '/vectors/get', {
      limit: 50,
      offset: 0,
      include_embeddings: false,
      ...input
    })
  }

  search(input: VectorSearchInput): Promise<VectorSearchResult> {
    return this.request('POST', '/search', {
      top_k: 10,
      include_metadata: true,
      include_documents: true,
      include_embeddings: false,
      include_distances: true,
      ...input
    })
  }

  backup(destination: string): Promise<{ status: string; destination: string }> {
    return this.request('POST', '/backup', { destination })
  }

  restore(source: string): Promise<{ status: string; source: string }> {
    return this.request('POST', '/restore', { source })
  }
}
