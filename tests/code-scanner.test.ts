import { describe, expect, it } from 'vitest'
import { ProjectAnalyzer, createImportResolver, isCandidateFile, mergeEndpoints } from '../shared/lib/code-scanner/analyzer'
import { detectFrameworksInManifest } from '../shared/lib/code-scanner/detect'
import { joinRoutePaths, routeKey, tagForPath } from '../shared/lib/code-scanner/paths'
import { buildCollectionFromEndpoints } from '../shared/lib/code-scanner/spec-to-collection'
import type { DetectedEndpoint } from '../shared/types/code-scanner'

function analyze(files: Record<string, string>) {
  const analyzer = new ProjectAnalyzer(Object.keys(files))
  for (const [path, content] of Object.entries(files)) analyzer.addFile(path, content)
  return analyzer.finish()
}

function routes(files: Record<string, string>): string[] {
  return analyze(files).endpoints.map((e) => `${e.method} ${e.path}`)
}

function find(endpoints: DetectedEndpoint[], method: string, path: string): DetectedEndpoint {
  const found = endpoints.find((e) => e.method === method && e.path === path)
  if (!found) throw new Error(`Missing ${method} ${path} in ${endpoints.map((e) => `${e.method} ${e.path}`).join(', ')}`)
  return found
}

describe('code scanner paths', () => {
  it('joins prefixes and normalizes slashes', () => {
    expect(joinRoutePaths('/api/', '/users/', ':id?')).toBe('/api/users/:id')
    expect(joinRoutePaths('', '/')).toBe('/')
    expect(joinRoutePaths('/api', '/')).toBe('/api')
  })

  it('treats :id and {id} as the same route', () => {
    expect(routeKey('GET', '/users/:id')).toBe(routeKey('GET', '/users/{userId}/'))
  })

  it('picks a meaningful folder segment', () => {
    expect(tagForPath('/api/v1/users/:id')).toBe('users')
    expect(tagForPath('/')).toBe('root')
  })
})

describe('import resolution', () => {
  const resolve = createImportResolver(['src/app.ts', 'src/routes/index.ts', 'src/routes/users.ts', 'lib/a.js'])

  it('resolves relative, index, .js-to-.ts and @/ alias imports', () => {
    expect(resolve('src/app.ts', './routes')).toBe('src/routes/index.ts')
    expect(resolve('src/app.ts', './routes/users.js')).toBe('src/routes/users.ts')
    expect(resolve('src/routes/index.ts', '@/routes/users')).toBe('src/routes/users.ts')
    expect(resolve('src/app.ts', '../lib/a')).toBe('lib/a.js')
    expect(resolve('src/app.ts', 'express')).toBeNull()
  })

  it('only reads relevant files', () => {
    expect(isCandidateFile('src/app.ts')).toBe(true)
    expect(isCandidateFile('docs/openapi.yaml')).toBe(true)
    expect(isCandidateFile('package.json')).toBe(true)
    expect(isCandidateFile('src/app.test.ts')).toBe(false)
    expect(isCandidateFile('types/index.d.ts')).toBe(false)
    expect(isCandidateFile('README.md')).toBe(false)
  })
})

describe('express extraction', () => {
  it('finds routes on an app with its listen port', () => {
    const result = analyze({
      'server.js': `
        const express = require('express')
        const app = express()
        const PORT = process.env.PORT || 4000
        app.get('/health', (req, res) => res.send('ok'))
        app.post('/login', (req, res) => {
          const { email, password } = req.body
          res.json({ email })
        })
        app.listen(PORT)
      `
    })
    expect(result.endpoints.map((e) => `${e.method} ${e.path}`)).toEqual(['GET /health', 'POST /login'])
    expect(result.baseUrl).toBe('http://localhost:4000')
    const login = find(result.endpoints, 'POST', '/login')
    expect(login.requestBody?.example).toEqual({ email: '', password: '' })
    expect(login.confidence).toBe('high')
    expect(login.sources).toEqual([{ file: 'server.js', line: 6 }])
  })

  it('does not treat app.get(setting) as a route', () => {
    expect(
      routes({
        'app.js': `const express = require('express'); const app = express(); const env = app.get('env');`
      })
    ).toEqual([])
  })

  it('follows routers mounted from other files (ESM + CommonJS)', () => {
    const result = analyze({
      'src/index.ts': `
        import express from 'express'
        import usersRouter from './routes/users'
        import { requireAuth } from './middleware/auth'
        const app = express()
        app.use(express.json())
        app.use('/api/users', requireAuth, usersRouter)
        app.use('/api/posts', require('./routes/posts'))
      `,
      'src/routes/users.ts': `
        import { Router } from 'express'
        const router = Router()
        router.get('/', listUsers)
        router.get('/:id', (req, res) => { res.json({ id: req.params.id, q: req.query.expand }) })
        function listUsers(req, res) { const page = req.query.page; res.json([]) }
        export default router
      `,
      'src/routes/posts.js': `
        const express = require('express')
        const router = express.Router()
        router.route('/:postId').get(getPost).delete(removePost)
        module.exports = router
      `,
      'src/middleware/auth.ts': `export function requireAuth(req, res, next) { next() }`
    })
    expect(result.endpoints.map((e) => `${e.method} ${e.path}`)).toEqual([
      'GET /api/posts/:postId',
      'DELETE /api/posts/:postId',
      'GET /api/users',
      'GET /api/users/:id'
    ])
    const list = find(result.endpoints, 'GET', '/api/users')
    expect(list.securityRequired).toBe(true)
    expect(list.operationId).toBe('listUsers')
    expect(list.parameters).toContainEqual({ name: 'page', in: 'query', required: false })
    expect(find(result.endpoints, 'GET', '/api/users/:id').parameters).toEqual([
      { name: 'id', in: 'path', required: true },
      { name: 'expand', in: 'query', required: false }
    ])
    expect(find(result.endpoints, 'GET', '/api/posts/:postId').securityRequired).toBe(false)
  })

  it('mounts routers named like auth (authRoutes) instead of treating them as middleware', () => {
    expect(
      routes({
        'app.js': `
          const express = require('express')
          const authRoutes = require('./auth.routes')
          const app = express()
          app.use('/auth', authRoutes)
        `,
        'auth.routes.js': `
          const router = require('express').Router()
          router.post('/login', (req, res) => {})
          module.exports = router
        `
      })
    ).toEqual(['POST /auth/login'])
  })

  it('resolves barrels, nested routers, prefixes from constants and router-wide auth', () => {
    const result = analyze({
      'src/app.ts': `
        import express from 'express'
        import { apiRouter } from './routes'
        const API_PREFIX = '/api/v1'
        const app = express()
        app.use(API_PREFIX, apiRouter)
      `,
      'src/routes/index.ts': `
        import { Router } from 'express'
        import adminRoutes from './admin'
        export const apiRouter = Router()
        apiRouter.use(\`/admin\`, adminRoutes)
      `,
      'src/routes/admin.ts': `
        import { Router } from 'express'
        import { authenticate } from '../auth'
        const router = Router()
        router.use(authenticate)
        router.patch('/settings', (req, res) => { const token = req.headers['x-tenant']; res.end() })
        export default router
      `
    })
    const settings = find(result.endpoints, 'PATCH', '/api/v1/admin/settings')
    expect(settings.securityRequired).toBe(true)
    expect(settings.parameters).toContainEqual({ name: 'x-tenant', in: 'header', required: false })
  })

  it('handles class-based servers and router factories', () => {
    expect(
      routes({
        'src/server.ts': `
          import express, { Application } from 'express'
          import userRoutes from './user.routes'
          import { createOrderRouter } from './orders'
          class Server {
            private app: Application = express()
            constructor() {
              this.app.use('/users', userRoutes)
              this.app.use('/orders', createOrderRouter(db))
            }
          }
        `,
        'src/user.routes.ts': `
          import { Router } from 'express'
          class UserRoutes {
            router = Router()
            constructor() { this.router.get('/me', (req, res) => {}) }
          }
          export default new UserRoutes().router
        `,
        'src/orders.ts': `
          import { Router } from 'express'
          export function createOrderRouter(db) {
            const router = Router()
            router.post('/', (req, res) => {})
            return router
          }
        `
      })
    ).toEqual(['POST /orders', 'GET /users/me'])
  })

  it('handles route modules that receive the app', () => {
    expect(
      routes({
        'index.js': `
          const express = require('express')
          const app = express()
          require('./routes')(app)
        `,
        'routes.js': `
          module.exports = function (app) {
            app.get('/items', (req, res) => {})
          }
        `
      })
    ).toEqual(['GET /items'])
  })

  it('marks unmounted routers as low confidence and warns about unresolvable paths', () => {
    const result = analyze({
      'orphan.ts': `
        import { Router } from 'express'
        import { PATHS } from './paths'
        const router = Router()
        router.get('/lonely', (req, res) => {})
        router.get(PATHS.users, (req, res) => {})
        router.get(/^\\/regex/, (req, res) => {})
      `
    })
    expect(result.endpoints).toHaveLength(1)
    expect(result.endpoints[0].confidence).toBe('low')
    expect(result.warnings.map((w) => w.message)).toEqual([
      expect.stringContaining('Could not resolve the path'),
      expect.stringContaining('regular-expression')
    ])
  })

  it('follows chained routers (Router().use(a).use(b)) and skips optional auth', () => {
    const result = analyze({
      'src/main.ts': `
        import express from 'express'
        import routes from './routes'
        const app = express()
        app.use(routes)
        app.options('*', cors())
      `,
      'src/routes.ts': `
        import { Router } from 'express'
        import tags from './tags'
        const api = Router().use(tags)
        export default Router().use('/api', api)
      `,
      'src/tags.ts': `
        import { Router } from 'express'
        import auth from './auth'
        const router = Router()
        router.get('/tags', auth.optional, (req, res) => {})
        router.post('/tags', auth.required, (req, res) => {})
        export default router
      `
    })
    expect(result.endpoints.map((e) => [e.method, e.path, e.securityRequired, e.confidence])).toEqual([
      ['GET', '/api/tags', false, 'high'],
      ['POST', '/api/tags', true, 'high']
    ])
  })

  it('expands mounts made in a loop over a route table', () => {
    const files = (loop: string) => ({
      'index.js': `
        const express = require('express')
        const authRoute = require('./auth.route')
        const userRoute = require('./user.route')
        const router = express.Router()
        const defaultRoutes = [
          { path: '/auth', route: authRoute },
          { path: '/users', route: userRoute },
        ]
        ${loop}
        const app = express()
        app.use('/v1', router)
      `,
      'auth.route.js': `
        const router = require('express').Router()
        router.post('/login', validate(authValidation.login), authController.login)
        router.post('/verify', auth(), authController.verify)
        module.exports = router
      `,
      'user.route.js': `
        const router = require('express').Router()
        router.route('/:userId').get(auth('getUsers'), userController.getUser)
        module.exports = router
      `
    })
    const expected = [
      ['POST', '/v1/auth/login', false],
      ['POST', '/v1/auth/verify', true],
      ['GET', '/v1/users/:userId', true]
    ]
    const summarize = (f: Record<string, string>) =>
      analyze(f).endpoints.map((e) => [e.method, e.path, e.securityRequired])
    expect(summarize(files('defaultRoutes.forEach((route) => { router.use(route.path, route.route) })'))).toEqual(expected)
    expect(summarize(files('for (const { path, route } of defaultRoutes) router.use(path, route)'))).toEqual(expected)
  })

  it('reports HTTP-client calls as frontend calls, not backend routes', () => {
    const result = analyze({
        'src/api.ts': `
          import axios from 'axios'
          const api = axios.create({ baseURL: '/api' })
          export const getUsers = () => api.get('/users', { params: { page: 1 } })
          export const save = (data) => axios.post('/users', data)
        `
    })
    expect(result.endpoints.map((e) => [e.method, e.path, e.origin, e.framework])).toEqual([
      ['GET', '/api/users', 'frontend', 'axios'],
      ['POST', '/users', 'frontend', 'axios']
    ])
    expect(result.endpoints[0].parameters).toEqual([{ name: 'page', in: 'query', required: false }])
  })
})

describe('fastify extraction', () => {
  it('finds shorthand routes, route objects and register prefixes', () => {
    const result = analyze({
      'src/server.ts': `
        import Fastify from 'fastify'
        import userRoutes from './users'
        const app = Fastify({ logger: true })
        app.register(userRoutes, { prefix: '/users' })
        app.register(async (instance) => {
          instance.get('/ping', async () => 'pong')
        }, { prefix: '/v1' })
        app.listen({ port: 8080 })
      `,
      'src/users.ts': `
        import type { FastifyInstance } from 'fastify'
        export default async function (fastify: FastifyInstance) {
          fastify.get('/:id', async (request) => request.params)
          fastify.route({
            method: ['POST', 'PUT'],
            url: '/',
            preHandler: [fastify.authenticate],
            handler: async (request) => { const { name } = request.body; return { name } }
          })
        }
      `
    })
    expect(result.endpoints.map((e) => `${e.method} ${e.path}`)).toEqual([
      'POST /users',
      'PUT /users',
      'GET /users/:id',
      'GET /v1/ping'
    ])
    expect(result.baseUrl).toBe('http://localhost:8080')
    const create = find(result.endpoints, 'POST', '/users')
    expect(create.framework).toBe('fastify')
    expect(create.securityRequired).toBe(true)
    expect(create.requestBody?.example).toEqual({ name: '' })
  })

  it('applies autoload autoPrefix and plugin-wide auth hooks', () => {
    const result = analyze({
      'routes/admin.js': `
        export const autoPrefix = '/_app'
        export default async function admin (fastify, opts) {
          fastify.addHook('onRequest', authorize)
          fastify.get('/redirects', async (req) => { const { from, size } = req.query })
        }
      `,
      'routes/status.js': `
        export default async function status (fastify) {
          fastify.get('/status', async () => ({ ok: true }))
        }
      `
    })
    expect(result.endpoints.map((e) => [e.method, e.path, e.securityRequired])).toEqual([
      ['GET', '/_app/redirects', true],
      ['GET', '/status', false]
    ])
    expect(find(result.endpoints, 'GET', '/_app/redirects').parameters.map((p) => p.name)).toEqual(['from', 'size'])
  })
})

describe('openapi extraction and merging', () => {
  const openapiYaml = `
openapi: 3.0.0
info:
  title: Shop
  version: 1.0.0
servers:
  - url: /api
paths:
  /users/{id}:
    get:
      summary: Get a user
      operationId: getUser
      parameters:
        - name: id
          in: path
          required: true
      responses:
        '200':
          description: OK
`

  it('reads YAML specs and prefixes relative servers', () => {
    const result = analyze({ 'docs/openapi.yaml': openapiYaml })
    expect(result.endpoints).toHaveLength(1)
    expect(result.endpoints[0]).toMatchObject({
      method: 'GET',
      path: '/api/users/{id}',
      summary: 'Get a user',
      origin: 'openapi',
      sources: [{ file: 'docs/openapi.yaml', line: 9 }]
    })
  })

  it('merges a spec entry with the code route that implements it', () => {
    const result = analyze({
      'docs/openapi.yaml': openapiYaml,
      'app.js': `
        const app = require('express')()
        app.get('/api/users/:id', requireAuth, (req, res) => {})
      `
    })
    expect(result.endpoints).toHaveLength(1)
    const merged = result.endpoints[0]
    expect(merged.summary).toBe('Get a user')
    expect(merged.securityRequired).toBe(true)
    expect(merged.framework).toBe('openapi, express')
    expect(merged.sources.map((s) => s.file)).toEqual(['docs/openapi.yaml', 'app.js'])
  })

  it('ignores JSON files that are not API descriptions', () => {
    expect(analyze({ 'api-docs.json': '{"hello": "world"}' }).endpoints).toEqual([])
  })

  it('merges duplicates of the same route', () => {
    const base = {
      parameters: [],
      responses: [],
      securityRequired: false,
      tags: [],
      origin: 'backend' as const,
      framework: 'express'
    }
    const merged = mergeEndpoints([
      { ...base, id: 'a', method: 'GET', path: '/x/:id', confidence: 'low', sources: [{ file: 'a.ts', line: 1 }] },
      { ...base, id: 'b', method: 'GET', path: '/x/{id}', confidence: 'high', sources: [{ file: 'b.ts', line: 2 }] }
    ])
    expect(merged).toHaveLength(1)
    expect(merged[0].confidence).toBe('high')
    expect(merged[0].sources).toHaveLength(2)
  })
})

describe('framework detection', () => {
  it('reads package.json and other manifests', () => {
    const pkg = JSON.stringify({ dependencies: { express: '^4' }, devDependencies: { '@nestjs/core': '^10' } })
    expect(detectFrameworksInManifest('package.json', pkg).map((f) => [f.id, f.supported])).toEqual([
      ['express', true],
      ['nestjs', true]
    ])
    expect(detectFrameworksInManifest('api/requirements.txt', 'FastAPI==0.110\nuvicorn').map((f) => f.id)).toEqual([
      'fastapi'
    ])
    expect(detectFrameworksInManifest('requirements.txt', 'flask-cors').map((f) => f.id)).toEqual([])
  })
})

describe('collection building without variables', () => {
  it('writes the base URL into requests and leaves the token empty', () => {
    const { endpoints } = analyze({ 'app.js': `const app = require('express')(); app.get('/a', requireAuth, (q, s) => {})` })
    const { collection } = buildCollectionFromEndpoints(endpoints, { name: 'x', baseUrl: 'http://localhost:4000/', useVariables: false })
    expect(collection.requests[0].url).toBe('http://localhost:4000/a')
    expect(collection.auth).toEqual({ type: 'bearer', bearerToken: '' })
  })
})

describe('collection building', () => {
  it('builds folders, {{baseUrl}} URLs, params, bodies and bearer auth', () => {
    const { endpoints } = analyze({
      'app.js': `
        const express = require('express')
        const app = express()
        app.get('/users/:id', (req, res) => {})
        app.post('/users', requireAuth, (req, res) => { const { name } = req.body })
        app.get('/health', (req, res) => {})
      `
    })
    const { collection, environmentVariables } = buildCollectionFromEndpoints(endpoints, {
      name: 'My API',
      baseUrl: 'http://localhost:3000/'
    })
    expect(collection.folders.map((f) => f.name).sort()).toEqual(['health', 'users'])
    expect(collection.auth).toEqual({ type: 'bearer', bearerToken: '{{authToken}}' })
    const create = collection.requests.find((r) => r.method === 'POST')!
    expect(create.url).toBe('{{baseUrl}}/users')
    expect(create.body).toEqual({ type: 'json', content: '{\n  "name": ""\n}' })
    expect(create.auth.type).toBe('inherit')
    const get = collection.requests.find((r) => r.url === '{{baseUrl}}/users/:id')!
    expect(get.pathParams?.map((p) => p.key)).toEqual(['id'])
    expect(get.auth.type).toBe('none')
    expect(get.description).toContain('app.js:4')
    expect(environmentVariables).toEqual([
      { key: 'baseUrl', value: 'http://localhost:3000' },
      { key: 'authToken', value: '' }
    ])
  })
})
