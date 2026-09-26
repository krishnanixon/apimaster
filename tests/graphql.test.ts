import { describe, expect, it } from 'vitest'
import { buildSchema, introspectionFromSchema } from 'graphql'
import { createEmptyRequest, resolveRequest } from '../src/modules/api-studio/services/requestBuilder'
import { prepareRequest } from '../src/modules/api-studio/services/apiClient'
import { applyEnvironmentVariables } from '../src/modules/api-studio/services/environment'
import { exportToPostmanCollection, importPostmanCollection } from '../src/modules/api-studio/services/postman'
import { importCollectionJson } from '../src/modules/api-studio/services/collectionImport'
import {
  blockingGraphQLIssues,
  formatGraphQL,
  inspectGraphQL
} from '../src/modules/api-studio/services/graphql/document'
import { applyRequestType, normalizeStoredRequest } from '../src/modules/api-studio/services/graphql/model'
import { migrateWorkspaceState, WORKSPACE_SCHEMA_VERSION } from '../src/modules/api-studio/services/graphql/migrate'
import { interpretGraphQLResult } from '../src/modules/api-studio/services/graphql/prepare'
import {
  graphQLSchemaStatus,
  introspectionQuery,
  readIntrospectionResult,
  schemaFromIntrospection
} from '../src/modules/api-studio/services/graphql/schema'
import { graphqlSuggestions } from '../src/modules/api-studio/services/graphql/suggestions'
import type { ApiCollection, ApiExecutionResult, ApiRequest } from '../src/modules/api-studio/types/api.types'

const SDL = `
  type Query {
    users(limit: Int!): [User!]!
    user(id: ID!): User
  }
  type User {
    id: ID!
    name: String!
    email: String
  }
`

const schema = buildSchema(SDL)
const introspection = introspectionFromSchema(schema) as unknown as Record<string, unknown>

function graphqlRequest(patch: Partial<ApiRequest> = {}): ApiRequest {
  return {
    ...createEmptyRequest('Users'),
    method: 'POST',
    url: 'https://api.example.com/graphql',
    headers: [
      { id: 'h1', key: 'X-API-Key', value: 'secret', enabled: true },
      { id: 'h2', key: 'X-Debug', value: '1', enabled: false }
    ],
    auth: { type: 'bearer', bearerToken: '{{token}}' },
    requestType: 'graphql',
    graphql: {
      query: 'query GetUsers($limit: Int!) { users(limit: $limit) { id name } }',
      variables: '{\n  "limit": 10\n}',
      operationName: 'GetUsers',
      schema: { introspection, fetchedAt: '2026-01-01T00:00:00.000Z', endpoint: 'https://api.example.com/graphql' }
    },
    ...patch
  }
}

function execution(patch: Partial<ApiExecutionResult> = {}): ApiExecutionResult {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: { 'content-type': 'application/json' },
    data: '{"data":{"user":{"id":"123"}}}',
    isBinary: false,
    contentType: 'application/json',
    timeMs: 12,
    sizeBytes: 30,
    ...patch
  }
}

describe('GraphQL request model', () => {
  it('creates a GraphQL request without dropping REST fields', () => {
    const rest = createEmptyRequest('List')
    rest.method = 'GET'
    rest.url = 'https://api.example.com/users'
    rest.body = { type: 'json', content: '{"a":1}' }
    const patch = applyRequestType(rest, 'graphql')
    const next = { ...rest, ...patch }
    expect(next.requestType).toBe('graphql')
    expect(next.method).toBe('GET')
    expect(next.url).toBe('https://api.example.com/users')
    expect(next.body).toEqual({ type: 'json', content: '{"a":1}' })
    expect(next.graphql?.query).toBe('')
    expect(next.headers.some((header) => header.key === 'Content-Type' && header.value === 'application/json')).toBe(true)

    const back = { ...next, ...applyRequestType(next, 'http') }
    expect(back.requestType).toBe('http')
    expect(back.method).toBe('GET')
    expect(back.body.content).toBe('{"a":1}')
    expect(back.graphql?.query).toBe('')
  })

  it('serializes and restores a GraphQL request', () => {
    const request = graphqlRequest()
    const restored = normalizeStoredRequest(JSON.parse(JSON.stringify(request)) as ApiRequest)
    expect(restored.requestType).toBe('graphql')
    expect(restored.graphql?.query).toContain('GetUsers')
    expect(restored.graphql?.variables).toContain('10')
    expect(restored.graphql?.operationName).toBe('GetUsers')
    expect(restored.graphql?.schema?.introspection).toBeTruthy()
    expect(restored.auth.bearerToken).toBe('{{token}}')
  })

  it('migrates legacy REST requests without changing them', () => {
    const rest = createEmptyRequest('Legacy')
    delete (rest as { requestType?: string }).requestType
    const persisted = {
      collections: [{ requests: [rest] }],
      tabs: [{ request: { ...rest, id: 'tab-request' } }],
      history: [{ request: rest }]
    }
    const migrated = migrateWorkspaceState(persisted, 1)
    const saved = migrated.collections?.[0].requests?.[0]
    expect(saved?.requestType).toBe('http')
    expect(saved?.method).toBe(rest.method)
    expect(saved?.url).toBe(rest.url)
    expect(saved?.body).toEqual(rest.body)
    expect(saved?.graphql).toBeUndefined()
    expect(migrateWorkspaceState(migrated, WORKSPACE_SCHEMA_VERSION)).toBe(migrated)
    expect(migrateWorkspaceState(migrated, 1).collections?.[0].requests?.[0]).toMatchObject({
      requestType: 'http',
      url: rest.url,
      body: rest.body
    })
  })
})

describe('GraphQL execution', () => {
  it('sends query, variables, operation name, headers, and auth', () => {
    const resolved = prepareRequest(graphqlRequest(), { variables: { token: 'abc' } })
    expect(resolved.method).toBe('POST')
    expect(resolved.url).toBe('https://api.example.com/graphql')
    expect(resolved.headers.Authorization).toBe('Bearer abc')
    expect(resolved.headers['X-API-Key']).toBe('secret')
    expect(resolved.headers['X-Debug']).toBeUndefined()
    const body = JSON.parse(resolved.body.content) as { query: string; variables: { limit: number }; operationName?: string }
    expect(body.query).toContain('GetUsers')
    expect(body.variables).toEqual({ limit: 10 })
    expect(body.operationName).toBe('GetUsers')
  })

  it('omits operationName for a single anonymous operation', () => {
    const resolved = resolveRequest(
      graphqlRequest({
        graphql: { query: 'query { __typename }', variables: '' }
      })
    )
    const body = JSON.parse(resolved.body.content) as { operationName?: string; variables: object }
    expect(body.operationName).toBeUndefined()
    expect(body.variables).toEqual({})
  })

  it('interpolates the endpoint and variable values', () => {
    const request = graphqlRequest({
      url: '{{baseUrl}}/graphql',
      graphql: {
        query: 'query GetUser($id: ID!) { user(id: $id) { id } }',
        variables: '{ "id": "{{userId}}" }',
        operationName: 'GetUser'
      }
    })
    const substituted = applyEnvironmentVariables(request, { baseUrl: 'https://api.example.com', userId: '123' })
    const resolved = resolveRequest(substituted)
    expect(resolved.url).toBe('https://api.example.com/graphql')
    expect(JSON.parse(resolved.body.content).variables).toEqual({ id: '123' })
  })

  it('rejects a missing operation and invalid variables before sending', () => {
    expect(() =>
      resolveRequest(
        graphqlRequest({
          graphql: {
            query: 'query GetUsers { users(limit: 1) { id } } query GetPosts { __typename }',
            variables: '{',
            operationName: 'Missing'
          }
        })
      )
    ).toThrow(/Select an operation|not valid JSON/)
  })

  it('keeps REST execution unchanged', () => {
    const rest = createEmptyRequest('Users')
    rest.method = 'POST'
    rest.url = 'https://api.example.com/users'
    rest.body = { type: 'json', content: '{"a":1}' }
    rest.auth = { type: 'bearer', bearerToken: 'tok' }
    const resolved = resolveRequest(rest)
    expect(resolved.method).toBe('POST')
    expect(resolved.body).toEqual({ type: 'json', content: '{"a":1}' })
    expect(resolved.headers.Authorization).toBe('Bearer tok')

    const get = resolveRequest({ ...rest, method: 'GET' })
    expect(get.method).toBe('GET')
    expect(get.body.type).toBe('none')
  })

  it('separates HTTP status from GraphQL errors', () => {
    const ok = interpretGraphQLResult(execution())
    expect(ok.ok).toBe(true)
    expect(ok.graphql?.hasErrors).toBe(false)
    expect(ok.graphql?.data).toEqual({ user: { id: '123' } })

    const gqlError = interpretGraphQLResult(
      execution({
        data: JSON.stringify({ data: null, errors: [{ message: 'Unauthorized', path: ['user'] }] })
      })
    )
    expect(gqlError.status).toBe(200)
    expect(gqlError.ok).toBe(false)
    expect(gqlError.graphql?.hasErrors).toBe(true)
    expect(gqlError.graphql?.errors[0]?.message).toBe('Unauthorized')
    expect(gqlError.error).toContain('Unauthorized')

    const httpError = interpretGraphQLResult(execution({ ok: false, status: 401, statusText: 'Unauthorized', data: '' }))
    expect(httpError.status).toBe(401)
    expect(httpError.graphql?.hasErrors).toBe(false)
    expect(httpError.graphql?.hint).toMatch(/401/)
  })

  it('rewrites transport failures without a stack trace', () => {
    const result = interpretGraphQLResult(
      execution({ ok: false, status: 0, data: '', error: 'timeout of 30000ms exceeded' })
    )
    expect(result.error).toMatch(/timed out/i)
    expect(result.error).not.toMatch(/\n\s+at /)
  })
})

describe('GraphQL schema', () => {
  it('uses the standard introspection query and caches a usable schema', () => {
    expect(introspectionQuery()).toContain('__schema')
    const built = schemaFromIntrospection(introspection)
    expect(built?.getType('User')).toBeTruthy()
    expect(graphQLSchemaStatus('https://api.example.com/graphql', { introspection, endpoint: 'https://api.example.com/graphql' }, false)).toBe('available')
    expect(graphQLSchemaStatus('https://api.example.com/graphql', { introspection, endpoint: 'https://old.example/graphql' }, false)).toBe('outdated')
    expect(graphQLSchemaStatus('https://api.example.com/graphql', undefined, true)).toBe('loading')
    expect(graphQLSchemaStatus('https://api.example.com/graphql', { error: 'nope' }, false)).toBe('unavailable')
  })

  it('refreshes from a valid introspection response and rejects an invalid one', () => {
    const read = readIntrospectionResult(execution({ data: JSON.stringify({ data: introspection }) }))
    expect(schemaFromIntrospection(read.introspection)?.getQueryType()).toBeTruthy()

    const invalid = readIntrospectionResult(execution({ data: '{"data":{"ok":true}}' }))
    expect(invalid.introspection).toBeUndefined()
    expect(invalid.error).toBeTruthy()

    const failed = readIntrospectionResult(execution({ ok: false, status: 500, data: 'nope' }))
    expect(failed.error).toMatch(/not return JSON|500/)
  })
})

describe('GraphQL validation', () => {
  it('accepts a valid query and fragment', () => {
    const inspection = inspectGraphQL({
      query: 'fragment UserFields on User { id name email } query Users { users(limit: 1) { ...UserFields } }',
      variablesText: '',
      schema
    })
    expect(blockingGraphQLIssues(inspection)).toEqual([])
  })

  it('reports an unknown field, a missing argument, and a missing variable', () => {
    const unknown = inspectGraphQL({ query: 'query { usr }', variablesText: '', schema })
    expect(unknown.validationErrors[0]).toMatch(/Cannot query field "usr"/)

    const missingArg = inspectGraphQL({ query: 'query { user { id } }', variablesText: '', schema })
    expect(missingArg.validationErrors[0]).toMatch(/argument "id" of type "ID!" is required/)

    const missingVar = inspectGraphQL({
      query: 'query GetUser($id: ID!, $includeEmail: Boolean = true) { user(id: $id) { id } }',
      variablesText: '{ "includeEmail": true }',
      schema
    })
    expect(missingVar.variableErrors[0]).toMatch(/\$id/)
    expect(missingVar.variables.find((variable) => variable.name === 'includeEmail')?.required).toBe(false)
  })

  it('does not require schema validation when introspection is unavailable', () => {
    const inspection = inspectGraphQL({
      query: 'query { usr }',
      variablesText: '{}',
      schema: null
    })
    expect(inspection.validationErrors).toEqual([])
    expect(blockingGraphQLIssues(inspection)).toEqual([])
  })

  it('formats a query only when asked', () => {
    expect(formatGraphQL('query GetUser($id:ID!){user(id:$id){id name email}}')).toBe(
      'query GetUser($id: ID!) {\n  user(id: $id) {\n    id\n    name\n    email\n  }\n}\n'
    )
    expect(() => formatGraphQL('# keep me\nquery { __typename }')).toThrow(/comments/)
  })
})

describe('GraphQL autocomplete', () => {
  it('suggests root fields and nested fields when a schema is loaded', () => {
    const root = 'query { us'
    const rootSuggestions = graphqlSuggestions(schema, root, root.length)
    expect(rootSuggestions.map((item) => item.label)).toEqual(expect.arrayContaining(['users', 'user']))
    expect(rootSuggestions.find((item) => item.label === 'users')?.detail).toBe('[User!]!')

    const nested = 'query {\n  user(id: "1") {\n    '
    const cursor = nested.lastIndexOf('    ') + 4
    const fields = graphqlSuggestions(schema, nested, cursor)
    expect(fields.map((item) => item.label)).toEqual(expect.arrayContaining(['id', 'name', 'email']))
    expect(fields.find((item) => item.label === 'name')?.detail).toBe('String!')
  })

  it('suggests arguments, enums, fragments, and stays empty without a schema', () => {
    const withEnum = buildSchema('enum Role { ADMIN MEMBER } type Query { user(id: ID!, role: Role): User } type User { id: ID! }')
    const args = 'query { user('
    expect(graphqlSuggestions(withEnum, args, args.length).map((item) => item.label)).toEqual(expect.arrayContaining(['id', 'role']))
    const role = 'query { user(role: '
    expect(graphqlSuggestions(withEnum, role, role.length).map((item) => item.label)).toEqual(expect.arrayContaining(['ADMIN', 'MEMBER']))

    const fragments = 'fragment UserFields on User { id } query { user(id: "1") { ... '
    expect(graphqlSuggestions(schema, fragments, fragments.length).map((item) => item.label)).toContain('UserFields')
    expect(graphqlSuggestions(null, 'query { us', 10)).toEqual([])
  })
})

describe('GraphQL import and export', () => {
  it('keeps GraphQL fields in APIMaster JSON and Postman graphql mode', () => {
    const request = graphqlRequest()
    const collection: ApiCollection = {
      id: 'col',
      name: 'Demo',
      description: '',
      folders: [],
      requests: [request],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z'
    }
    const native = importCollectionJson(JSON.stringify(collection))
    expect(native.collection.requests[0]?.requestType).toBe('graphql')
    expect(native.collection.requests[0]?.graphql?.query).toContain('GetUsers')
    expect(native.collection.requests[0]?.graphql?.schema?.endpoint).toBe('https://api.example.com/graphql')

    const postman = importPostmanCollection(exportToPostmanCollection(collection))
    const imported = postman.collection.requests[0]
    expect(imported?.requestType).toBe('graphql')
    expect(imported?.method).toBe('POST')
    expect(imported?.graphql?.query).toContain('GetUsers')
    expect(imported?.graphql?.variables).toContain('10')
    expect(imported?.graphql?.operationName).toBe('GetUsers')
    expect(imported?.url).toBe('https://api.example.com/graphql')
  })
})
