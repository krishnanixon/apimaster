import { describe, expect, it } from 'vitest'
import { ProjectAnalyzer } from '../shared/lib/code-scanner/analyzer'
import type { DetectedEndpoint } from '../shared/types/code-scanner'

function analyze(files: Record<string, string>) {
  const analyzer = new ProjectAnalyzer(Object.keys(files))
  for (const [path, content] of Object.entries(files)) analyzer.addFile(path, content)
  return analyzer.finish()
}

function find(endpoints: DetectedEndpoint[], method: string, path: string): DetectedEndpoint {
  const found = endpoints.find((e) => e.method === method && e.path === path)
  if (!found) throw new Error(`Missing ${method} ${path} in ${endpoints.map((e) => `${e.method} ${e.path}`).join(', ')}`)
  return found
}

const query = (e: DetectedEndpoint) => e.parameters.filter((p) => p.in === 'query').map((p) => p.name)

describe('request bodies from validation schemas', () => {
  it('reads Fastify JSON Schema route options (inline, constant and route objects)', () => {
    const { endpoints } = analyze({
      'app.js': `
        const fastify = require('fastify')()
        const createSchema = {
          body: { type: 'object', required: ['name'], properties: { name: { type: 'string' }, qty: { type: 'integer', minimum: 1 }, kind: { enum: ['a', 'b'] } } },
          querystring: { type: 'object', properties: { dryRun: { type: 'boolean' } } }
        }
        fastify.post('/items', { schema: createSchema }, async (req) => req.body)
        fastify.put('/items/:id', { schema: { body: { type: 'object', properties: { email: { type: 'string', format: 'email' } } } } }, async () => {})
        fastify.route({ method: 'PATCH', url: '/items/:id', schema: { body: { type: 'object', properties: { done: { type: 'boolean' } } } }, handler: async () => {} })
      `
    })
    const create = find(endpoints, 'POST', '/items')
    expect(create.requestBody?.example).toEqual({ name: '', qty: 1, kind: 'a' })
    expect(query(create)).toEqual(['dryRun'])
    expect(find(endpoints, 'PUT', '/items/:id').requestBody?.example).toEqual({ email: 'user@example.com' })
    expect(find(endpoints, 'PATCH', '/items/:id').requestBody?.example).toEqual({ done: false })
  })

  it('reads TypeBox schemas in Fastify', () => {
    const { endpoints } = analyze({
      'app.ts': `
        import Fastify from 'fastify'
        import { Type } from '@sinclair/typebox'
        const app = Fastify()
        const User = Type.Object({ name: Type.String(), age: Type.Optional(Type.Integer({ minimum: 0 })), tags: Type.Array(Type.String()), role: Type.Union([Type.Literal('admin'), Type.Literal('user')]) })
        app.post('/users', { schema: { body: User } }, async () => {})
      `
    })
    expect(find(endpoints, 'POST', '/users').requestBody?.example).toEqual({ name: '', age: 0, tags: [''], role: 'admin' })
  })

  it('reads zod schemas passed to validation middleware and parsed in handlers, across files', () => {
    const { endpoints } = analyze({
      'src/schemas.ts': `
        import { z } from 'zod'
        const Base = z.object({ title: z.string().min(1) })
        export const CreateTodo = Base.extend({ done: z.boolean().default(false), dueAt: z.string().datetime().optional(), owner: z.string().email() })
        export const ListQuery = z.object({ page: z.coerce.number().int(), search: z.string().optional() })
      `,
      'src/app.ts': `
        import express from 'express'
        import { z } from 'zod'
        import { CreateTodo, ListQuery } from './schemas'
        import { validate } from './middleware'
        const app = express()
        const UpdateTodo = z.object({ title: z.string(), priority: z.enum(['low', 'high']) }).partial()
        app.post('/todos', validate(CreateTodo), (req, res) => res.json(req.body))
        app.get('/todos', validateQuery(ListQuery), (req, res) => {})
        app.patch('/todos/:id', (req, res) => { const data = UpdateTodo.parse(req.body); res.json(data) })
      `
    })
    expect(find(endpoints, 'POST', '/todos').requestBody?.example).toEqual({
      title: '',
      done: false,
      dueAt: '2024-01-01T00:00:00.000Z',
      owner: 'user@example.com'
    })
    expect(query(find(endpoints, 'GET', '/todos'))).toEqual(['page', 'search'])
    expect(find(endpoints, 'PATCH', '/todos/:id').requestBody?.example).toEqual({ title: '', priority: 'low' })
  })

  it('reads joi schemas in celebrate and yup schemas validated in handlers', () => {
    const { endpoints } = analyze({
      'app.js': `
        const express = require('express')
        const Joi = require('joi')
        const { celebrate, Segments } = require('celebrate')
        const yup = require('yup')
        const app = express()
        app.post('/signup', celebrate({
          [Segments.BODY]: Joi.object().keys({ email: Joi.string().email().required(), password: Joi.string().min(8), plan: Joi.string().valid('free', 'pro') }),
          [Segments.QUERY]: Joi.object({ ref: Joi.string() })
        }), (req, res) => {})
        const profile = yup.object({ bio: yup.string(), age: yup.number().positive() })
        app.put('/profile', async (req, res) => { await profile.validate(req.body) })
      `
    })
    const signup = find(endpoints, 'POST', '/signup')
    expect(signup.requestBody?.example).toEqual({ email: 'user@example.com', password: '', plan: 'free' })
    expect(query(signup)).toEqual(['ref'])
    expect(find(endpoints, 'PUT', '/profile').requestBody?.example).toEqual({ bio: '', age: 1 })
  })

  it('reads { body, query } schema groups from CommonJS modules', () => {
    const { endpoints } = analyze({
      'src/validations/auth.validation.js': `
        const Joi = require('joi')
        const register = { body: Joi.object().keys({ email: Joi.string().required().email(), name: Joi.string() }) }
        const list = { query: Joi.object().keys({ page: Joi.number(), sortBy: Joi.string() }) }
        module.exports = { register, list }
      `,
      'src/routes/auth.route.js': `
        const express = require('express')
        const validate = require('../middlewares/validate')
        const authValidation = require('../validations/auth.validation')
        const router = express.Router()
        router.post('/register', validate(authValidation.register), (req, res) => {})
        router.get('/users', validate(authValidation.list), (req, res) => {})
        module.exports = router
      `
    })
    expect(find(endpoints, 'POST', '/register').requestBody?.example).toEqual({ email: 'user@example.com', name: '' })
    expect(query(find(endpoints, 'GET', '/users'))).toEqual(['page', 'sortBy'])
  })

  it('reads express-validator chains', () => {
    const { endpoints } = analyze({
      'app.js': `
        const express = require('express')
        const { body, query } = require('express-validator')
        const app = express()
        app.post('/login', [body('email').isEmail().normalizeEmail(), body('password').isLength({ min: 8 })], (req, res) => {})
        app.get('/search', query('q').notEmpty(), (req, res) => {})
      `
    })
    expect(find(endpoints, 'POST', '/login').requestBody?.example).toEqual({ email: 'user@example.com', password: '' })
    expect(query(find(endpoints, 'GET', '/search'))).toEqual(['q'])
  })

  it('ignores ordinary middleware arguments', () => {
    const { endpoints } = analyze({
      'app.js': `
        const express = require('express')
        const app = express()
        const limits = { windowMs: 1000, type: 'ip' }
        app.post('/ping', rateLimit(limits), passport.authenticate('jwt', { session: false }), (req, res) => {})
      `
    })
    expect(find(endpoints, 'POST', '/ping').requestBody).toBeUndefined()
  })
})
