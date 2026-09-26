import { describe, expect, it } from 'vitest'
import type { ApiCollection, ApiFolder, ApiRequest, KeyValuePair, RequestAuth } from '../src/modules/api-studio/types/api.types'
import {
  applyParentInheritance,
  createInheritAuth,
  mergeInheritedHeaders,
  mergeInheritedPreRequestScript,
  resolveInheritedAuth
} from '../src/modules/api-studio/services/inheritance'

function pair(key: string, value: string): KeyValuePair {
  return { id: key, key, value, enabled: true }
}

function request(partial: Partial<ApiRequest> = {}): ApiRequest {
  return {
    id: 'req-1',
    name: 'Get user',
    method: 'GET',
    url: 'https://api.example.com/users',
    headers: [pair('', '')],
    queryParams: [],
    body: { type: 'none', content: '' },
    auth: createInheritAuth(),
    folderId: 'folder-child',
    updatedAt: '',
    ...partial
  }
}

function collection(partial: Partial<ApiCollection> = {}): ApiCollection {
  const folders: ApiFolder[] = [
    {
      id: 'folder-root',
      name: 'Root',
      parentId: null,
      auth: createInheritAuth(),
      headers: [pair('X-Root', 'root')],
      preRequestScript: '// root folder'
    },
    {
      id: 'folder-child',
      name: 'Users',
      parentId: 'folder-root',
      auth: { type: 'bearer', bearerToken: 'folder-token' },
      headers: [pair('X-Folder', 'users'), pair('X-Root', 'override-root')],
      preRequestScript: '// users folder'
    }
  ]
  return {
    id: 'col-1',
    name: 'API',
    description: '',
    folders,
    requests: [],
    auth: { type: 'apiKey', apiKeyName: 'x-api-key', apiKeyValue: 'collection-key' },
    headers: [pair('X-Collection', 'col')],
    preRequestScript: '// collection',
    createdAt: '',
    updatedAt: '',
    ...partial
  }
}

describe('API Studio parent inheritance', () => {
  it('uses nearest folder auth when the request inherits', () => {
    const col = collection()
    const resolved = resolveInheritedAuth(request(), col)
    expect(resolved.source).toBe('folder')
    expect(resolved.sourceName).toBe('Users')
    expect(resolved.auth.type).toBe('bearer')
    expect((resolved.auth as RequestAuth).bearerToken).toBe('folder-token')
  })

  it('falls back to collection auth when folders inherit', () => {
    const col = collection({
      folders: [
        { id: 'folder-root', name: 'Root', parentId: null, auth: createInheritAuth() },
        { id: 'folder-child', name: 'Users', parentId: 'folder-root', auth: createInheritAuth() }
      ]
    })
    const resolved = resolveInheritedAuth(request(), col)
    expect(resolved.source).toBe('collection')
    expect(resolved.auth.type).toBe('apiKey')
  })

  it('lets the request override parent auth', () => {
    const resolved = resolveInheritedAuth(request({ auth: { type: 'none' } }), collection())
    expect(resolved.source).toBe('none')
    expect(resolved.auth.type).toBe('none')
  })

  it('merges headers with child keys winning', () => {
    const merged = mergeInheritedHeaders(request({ headers: [pair('X-Request', 'req')] }), collection())
    const byKey = Object.fromEntries(merged.filter((h) => h.key).map((h) => [h.key, h.value]))
    expect(byKey['X-Collection']).toBe('col')
    expect(byKey['X-Root']).toBe('override-root')
    expect(byKey['X-Folder']).toBe('users')
    expect(byKey['X-Request']).toBe('req')
  })

  it('runs parent scripts before the request script', () => {
    const script = mergeInheritedPreRequestScript(request({ preRequestScript: '// request' }), collection())
    expect(script).toBe('// collection\n\n// root folder\n\n// users folder\n\n// request')
  })

  it('applyParentInheritance produces send-ready auth', () => {
    const effective = applyParentInheritance(request(), collection())
    expect(effective.auth.type).toBe('bearer')
    expect(effective.auth.bearerToken).toBe('folder-token')
  })
})
