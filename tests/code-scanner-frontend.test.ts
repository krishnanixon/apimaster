import { describe, expect, it } from 'vitest'
import { ProjectAnalyzer, isCandidateFile } from '../shared/lib/code-scanner/analyzer'
import { buildCollectionFromEndpoints } from '../shared/lib/code-scanner/spec-to-collection'
import type { DetectedEndpoint } from '../shared/types/code-scanner'

function analyze(files: Record<string, string>) {
  const analyzer = new ProjectAnalyzer(Object.keys(files))
  for (const [path, content] of Object.entries(files)) analyzer.addFile(path, content)
  return analyzer.finish()
}

function calls(endpoints: DetectedEndpoint[]) {
  return endpoints.map((e) => `${e.method} ${e.host ?? ''}${e.path}`)
}

function find(endpoints: DetectedEndpoint[], method: string, path: string): DetectedEndpoint {
  const found = endpoints.find((e) => e.method === method && e.path === path)
  if (!found) throw new Error(`Missing ${method} ${path} in ${calls(endpoints).join(', ')}`)
  return found
}

describe('frontend calls', () => {
  it('reads fetch calls with env base URLs, bodies, headers and query strings', () => {
    const result = analyze({
      '.env.local': 'NEXT_PUBLIC_API_URL=http://localhost:4000/api\nSTRIPE_SECRET_KEY=sk_live_secret',
      'src/lib/users.ts': `
        const API = process.env.NEXT_PUBLIC_API_URL
        export async function getUser(id: string) {
          return fetch(\`\${API}/users/\${id}?expand=\${expand}&fields=name\`)
        }
        export async function createUser(name: string, email: string) {
          return fetch(\`\${API}/users\`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: \`Bearer \${token}\` },
            body: JSON.stringify({ name, email }),
          })
        }
        const logo = fetch('/images/logo.png')
        const dynamic = fetch(url)
      `
    })
    expect(calls(result.endpoints)).toEqual(['POST /api/users', 'GET /api/users/:id'])
    // The env URL's origin becomes {{baseUrl}}; its /api path stays part of each route.
    expect(result.baseUrl).toBe('http://localhost:4000')
    const create = result.endpoints[0]
    expect(create.securityRequired).toBe(true)
    expect(create.requestBody?.example).toEqual({ name: '', email: '' })
    expect(find(result.endpoints, 'GET', '/api/users/:id').parameters.map((p) => p.name)).toEqual(['id', 'expand', 'fields'])
    expect(result.endpoints.every((e) => e.origin === 'frontend')).toBe(true)
  })

  it('keeps the env path prefix and never reads non-URL env values', () => {
    const result = analyze({
      '.env': 'VITE_API_BASE_URL=https://staging.example.com/api/v2\nDATABASE_URL=postgres://secret',
      'src/api.ts': `export const list = () => fetch(\`\${import.meta.env.VITE_API_BASE_URL}/orders\`)`
    })
    expect(calls(result.endpoints)).toEqual(['GET /api/v2/orders'])
    expect(result.endpoints[0].host).toBeUndefined()
    expect(result.baseUrl).toBe('https://staging.example.com')
  })

  it('follows axios instances and wrapper functions across files', () => {
    const result = analyze({
      'src/lib/http.ts': `
        import axios from 'axios'
        export const http = axios.create({ baseURL: process.env.REACT_APP_API_URL ?? 'http://localhost:8000' })
        http.interceptors.request.use((config) => config)
      `,
      'src/lib/request.ts': `
        const BASE = 'http://localhost:8000/api'
        export async function request(path, options = {}) {
          const res = await fetch(\`\${BASE}\${path}\`, { headers: { Authorization: 'Bearer x' }, ...options })
          return res.json()
        }
        export const api = {
          get: (url) => request(url),
          post: (url, body) => request(url, { method: 'POST', body: JSON.stringify(body) }),
          remove: (url) => request(url, { method: 'DELETE' }),
        }
      `,
      'src/features/todos.ts': `
        import { http } from '@/lib/http'
        import { api } from '../lib/request'
        export const loadTodos = () => http.get('/todos', { params: { done: false } })
        export const addTodo = (title: string) => http.post('/todos', { title, done: false })
        export const loadTags = () => api.get('/tags')
        export const saveTag = (name: string) => api.post('/tags', { name, color })
        export const dropTag = (id: string) => api.remove(\`/tags/\${id}\`)
      `
    })
    expect(calls(result.endpoints)).toEqual([
      'GET /api/tags',
      'POST /api/tags',
      'DELETE /api/tags/:id',
      'GET /todos',
      'POST /todos'
    ])
    expect(find(result.endpoints, 'POST', '/api/tags').requestBody?.example).toEqual({ name: '', color: '' })
    expect(find(result.endpoints, 'POST', '/api/tags').securityRequired).toBe(true)
    expect(find(result.endpoints, 'POST', '/todos').requestBody?.example).toEqual({ title: '', done: '' })
    expect(find(result.endpoints, 'GET', '/todos').parameters).toEqual([{ name: 'done', in: 'query', required: false }])
    // Call sites, not the wrapper, are reported.
    expect(find(result.endpoints, 'GET', '/api/tags').callers).toEqual([{ file: 'src/features/todos.ts', line: 6 }])
    expect(result.baseUrl).toBe('http://localhost:8000')
  })

  it('reads SWR keys, RTK Query endpoints and Angular HttpClient calls', () => {
    const result = analyze({
      'src/hooks.ts': `
        import useSWR from 'swr'
        export const useProfile = (id) => useSWR(\`/api/profiles/\${id}\`, fetcher)
        export const useFeed = () => useSWR(['/api/feed', token], fetcher)
      `,
      'src/store/api.ts': `
        import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react'
        export const postsApi = createApi({
          baseQuery: fetchBaseQuery({ baseUrl: '/api/' }),
          endpoints: (builder) => ({
            getPost: builder.query({ query: (id) => \`posts/\${id}\` }),
            addPost: builder.mutation({ query: (body) => ({ url: 'posts', method: 'POST', body }) }),
          }),
        })
      `,
      'src/app/environments/environment.ts': `export const environment = { apiUrl: 'http://localhost:3000/api' }`,
      'src/app/hero.service.ts': `
        import { HttpClient } from '@angular/common/http'
        import { environment } from './environments/environment'
        export class HeroService {
          private heroesUrl = \`\${environment.apiUrl}/heroes\`
          constructor(private http: HttpClient) {}
          getHeroes() { return this.http.get<Hero[]>(this.heroesUrl) }
          addHero(hero: Hero) { return this.http.post<Hero>(this.heroesUrl, { name: hero.name }) }
        }
      `
    })
    expect(calls(result.endpoints)).toEqual([
      'GET /api/feed',
      'GET /api/heroes',
      'POST /api/heroes',
      'POST /api/posts',
      'GET /api/posts/:id',
      'GET /api/profiles/:id'
    ])
    expect(find(result.endpoints, 'POST', '/api/heroes').requestBody?.example).toEqual({ name: '' })
    expect(find(result.endpoints, 'POST', '/api/heroes').framework).toBe('angular')
    expect(find(result.endpoints, 'POST', '/api/posts').framework).toBe('rtk-query')
  })

  it('applies dev-server proxies (Vite rewrite, CRA proxy)', () => {
    const vite = analyze({
      'vite.config.ts': `
        export default defineConfig({
          server: { proxy: { '/api': { target: 'http://localhost:8080', changeOrigin: true, rewrite: (p) => p.replace(/^\\/api/, '') } } },
        })
      `,
      'src/api.ts': `export const me = () => fetch('/api/me')`
    })
    expect(calls(vite.endpoints)).toEqual(['GET /me'])
    expect(vite.baseUrl).toBe('http://localhost:8080')

    const cra = analyze({
      'package.json': JSON.stringify({ proxy: 'http://localhost:5000', dependencies: { react: '18' } }),
      'src/api.js': `export const me = () => fetch('/api/me')`
    })
    expect(calls(cra.endpoints)).toEqual(['GET /api/me'])
    expect(cra.baseUrl).toBe('http://localhost:5000')
  })

  it('marks third-party APIs with their host and keeps them apart from project routes', () => {
    const result = analyze({
      'src/api.ts': `
        export const repos = () => fetch('https://api.github.com/users/octocat/repos')
        export const users = () => fetch('/users')
      `
    })
    expect(calls(result.endpoints)).toEqual(['GET /users', 'GET https://api.github.com/users/octocat/repos'])
  })

  it('reads GraphQL operations and the Apollo endpoint', () => {
    const result = analyze({
      'src/apollo.ts': `
        import { ApolloClient, InMemoryCache } from '@apollo/client'
        export const client = new ApolloClient({ uri: 'http://localhost:4000/gql', cache: new InMemoryCache() })
      `,
      'src/queries.ts': `
        import { gql } from '@apollo/client'
        const USER_FIELDS = gql\`fragment UserFields on User { id name }\`
        export const GET_USER = gql\`
          query GetUser($id: ID!) { user(id: $id) { ...UserFields } }
          \${USER_FIELDS}
        \`
        export const ADD_USER = gql\`mutation AddUser($name: String!) { addUser(name: $name) { id } }\`
      `,
      'src/pages/index.tsx': `
        import { graphql } from 'gatsby'
        export const query = graphql\`query SiteTitle { site { siteMetadata { title } } }\`
      `
    })
    expect(result.endpoints.map((e) => [e.method, e.path, e.graphql?.operationName])).toEqual([
      ['POST', '/gql', 'GetUser'],
      ['POST', '/gql', 'AddUser']
    ])
    expect(result.endpoints[0].graphql?.query).toContain('fragment UserFields on User')
  })

  it('scans <script> blocks of Vue and Svelte components with correct lines', () => {
    expect(isCandidateFile('src/components/UserList.vue')).toBe(true)
    expect(isCandidateFile('.env.development')).toBe(true)
    const result = analyze({
      'src/components/UserList.vue': `<template>
  <ul><li v-for="u in users">{{ u.name }}</li></ul>
</template>
<script setup lang="ts">
import axios from 'axios'
const users = await axios.get<User[]>('/api/users')
</script>`,
      'src/routes/+page.svelte': `<script>
  const load = () => fetch('/api/items', { method: 'DELETE' })
</script>`
    })
    expect(calls(result.endpoints)).toEqual(['DELETE /api/items', 'GET /api/users'])
    expect(find(result.endpoints, 'GET', '/api/users').sources).toEqual([{ file: 'src/components/UserList.vue', line: 6 }])
  })

  it('warns once about requests whose URL is only known at runtime', () => {
    const result = analyze({ 'src/a.ts': `fetch(url); axios(config)` })
    expect(result.warnings.map((w) => w.message)).toEqual([expect.stringContaining('2 requests build their URL at runtime')])
  })
})

describe('backend ↔ frontend cross-check', () => {
  const files = {
    'server/app.js': `
      const express = require('express')
      const app = express()
      app.get('/api/users', (req, res) => {})
      app.post('/api/users', (req, res) => { const { name } = req.body })
      app.delete('/api/users/:id', (req, res) => {})
      app.listen(4000)
    `,
    'client/src/api.ts': `
      import { config } from './config'
      export const list = () => fetch(\`\${config.apiUrl}/users\`)
      export const create = (name: string) => fetch('/api/users', { method: 'POST', body: JSON.stringify({ name, role }) })
      export const archive = (id: string) => fetch(\`/api/users/\${id}/archive\`, { method: 'POST' })
    `
  }

  it('merges calls into routes and flags calls without a route and routes nobody calls', () => {
    const result = analyze(files)
    expect(result.endpoints.map((e) => `${e.method} ${e.path} ${e.crossCheck}`)).toEqual([
      'GET /api/users called',
      'POST /api/users called',
      'DELETE /api/users/:id not-called',
      'POST /api/users/:id/archive no-backend'
    ])
    const create = find(result.endpoints, 'POST', '/api/users')
    expect(create.origin).toBe('backend')
    expect(create.sources.map((s) => s.file)).toEqual(['server/app.js', 'client/src/api.ts'])
    expect(create.callers).toEqual([{ file: 'client/src/api.ts', line: 4 }])
    // Backend body wins, frontend-only fields are kept as parameters would be; the route is the backend's.
    expect(create.requestBody?.example).toEqual({ name: '' })
    expect(result.baseUrl).toBe('http://localhost:4000')
  })

  it('lines up a call with an unresolved base (`${config.apiUrl}/users`) with the only matching route', () => {
    const list = find(analyze(files).endpoints, 'GET', '/api/users')
    expect(list.callers?.map((c) => c.line)).toEqual([3])
  })
})

describe('collection building for frontend calls', () => {
  it('builds GraphQL requests and keeps third-party hosts', () => {
    const { endpoints } = analyze({
      'src/q.ts': `
        const Q = gql\`query Me { me { id } }\`
        export const repos = () => fetch('https://api.github.com/user/repos')
      `
    })
    const { collection } = buildCollectionFromEndpoints(endpoints, { name: 'App', baseUrl: 'http://localhost:3000' })
    const gqlRequest = collection.requests.find((r) => r.requestType === 'graphql')!
    expect(gqlRequest).toMatchObject({ name: 'Me', method: 'POST', url: '{{baseUrl}}/graphql' })
    expect(gqlRequest.graphql).toEqual({ query: 'query Me { me { id } }', variables: '{\n}', operationName: 'Me' })
    const external = collection.requests.find((r) => r.url.startsWith('https://'))!
    expect(external.url).toBe('https://api.github.com/user/repos')
    expect(collection.folders.map((f) => f.name).sort()).toEqual(['api.github.com', 'graphql'])
  })
})
