import { describe, expect, it } from 'vitest'
import { ProjectAnalyzer } from '../shared/lib/code-scanner/analyzer'
import { buildCollectionFromEndpoints, isLoginEndpoint, loginTokenScript, VALIDATION_FOLDER } from '../shared/lib/code-scanner/spec-to-collection'
import { validationCases } from '../shared/lib/code-scanner/validation-tests'
import { assessRisks } from '../shared/lib/code-scanner/risks'
import { ScriptRunnerService } from '../electron/main/api-studio/script-runner.service'
import type { DetectedEndpoint } from '../shared/types/code-scanner'
import type { ApiCollection, ApiExecutionResult, ApiRequest } from '../shared/types/api-studio'

function scan(files: Record<string, string>) {
  const analyzer = new ProjectAnalyzer(Object.keys(files))
  for (const [path, content] of Object.entries(files)) analyzer.addFile(path, content)
  return analyzer.finish()
}

function find(endpoints: DetectedEndpoint[], method: string, path: string): DetectedEndpoint {
  const found = endpoints.find((e) => e.method === method && e.path === path)
  if (!found) throw new Error(`${method} ${path} not found in ${endpoints.map((e) => `${e.method} ${e.path}`).join(', ')}`)
  return found
}

function folderPath(collection: ApiCollection, request: ApiRequest): string {
  const names: string[] = []
  for (let f = collection.folders.find((x) => x.id === request.folderId); f; f = collection.folders.find((x) => x.id === f!.parentId)) names.unshift(f.name)
  return names.join(' / ')
}

describe('body rules from code', () => {
  it('reads zod rules: required by default, optional(), formats and limits', () => {
    const result = scan({
      'app.ts': `
        import express from 'express'
        import { z } from 'zod'
        const app = express()
        const CreateUser = z.object({
          email: z.string().email(),
          password: z.string().min(8).max(64),
          age: z.number().int().min(13).optional(),
          role: z.enum(['admin', 'member']).default('member')
        })
        app.post('/users', validate(CreateUser), (req, res) => {})
      `
    })
    const schema = find(result.endpoints, 'POST', '/users').requestBody?.schema
    expect(schema?.required).toEqual(['email', 'password'])
    expect(schema?.properties).toMatchObject({
      email: { type: 'string', format: 'email' },
      password: { type: 'string', minLength: 8, maxLength: 64 },
      age: { type: 'integer', minimum: 13 },
      role: { enum: ['admin', 'member'] }
    })
  })

  it('reads joi rules: optional unless required()', () => {
    const result = scan({
      'app.js': `
        const Joi = require('joi')
        const app = require('express')()
        const schema = Joi.object({ name: Joi.string().min(2).required(), bio: Joi.string().max(200) })
        app.post('/profiles', celebrate({ body: schema }), (req, res) => {})
      `
    })
    const schema = find(result.endpoints, 'POST', '/profiles').requestBody?.schema
    expect(schema?.required).toEqual(['name'])
    expect(schema?.properties?.bio).toEqual({ type: 'string', maxLength: 200 })
  })

  it('reads express-validator chains', () => {
    const result = scan({
      'app.js': `
        const { body } = require('express-validator')
        const app = require('express')()
        app.post('/signup', body('email').isEmail(), body('password').isLength({ min: 6 }), body('nickname').optional().isString(), (req, res) => {})
      `
    })
    const schema = find(result.endpoints, 'POST', '/signup').requestBody?.schema
    expect(schema?.required).toEqual(['email', 'password'])
    expect(schema?.properties?.password).toEqual({ type: 'string', minLength: 6 })
  })

  it('reads class-validator DTOs in NestJS', () => {
    const result = scan({
      'src/users.controller.ts': `
        @Controller('users')
        export class UsersController {
          @Post() create(@Body() dto: CreateUserDto) {}
        }
      `,
      'src/dto.ts': `
        export class CreateUserDto {
          @IsEmail() email: string
          @IsString() @MinLength(8) password: string
          @IsOptional() @IsInt() @Min(0) age?: number
          note: string
        }
      `
    })
    const schema = find(result.endpoints, 'POST', '/users').requestBody?.schema
    expect(schema?.required).toEqual(['email', 'password'])
    expect(schema?.properties?.age).toEqual({ type: 'integer', minimum: 0 })
  })

  it('reads Pydantic models: required without a default, Field limits', () => {
    const result = scan({
      'main.py': `
from fastapi import FastAPI
from pydantic import BaseModel, EmailStr, Field

app = FastAPI()

class SignUp(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8)
    age: int | None = None

@app.post("/signup")
def signup(body: SignUp):
    ...
`
    })
    const schema = find(result.endpoints, 'POST', '/signup').requestBody?.schema
    expect(schema?.required).toEqual(['email', 'password'])
    expect(schema?.properties?.password).toEqual({ type: 'string', minLength: 8 })
  })

  it('reads OpenAPI schemas, following $refs', () => {
    const result = scan({
      'openapi.yaml': `
openapi: 3.0.0
info: { title: T, version: '1' }
paths:
  /pets:
    post:
      requestBody:
        content:
          application/json:
            schema: { $ref: '#/components/schemas/Pet' }
      responses: { '201': { description: ok } }
components:
  schemas:
    Pet:
      type: object
      required: [name]
      properties:
        name: { type: string, maxLength: 30 }
        kind: { type: string, enum: [cat, dog] }
`
    })
    const schema = find(result.endpoints, 'POST', '/pets').requestBody?.schema
    expect(schema).toMatchObject({ required: ['name'], properties: { name: { maxLength: 30 }, kind: { enum: ['cat', 'dog'] } } })
  })
})

describe('validation tests', () => {
  const files = {
    'app.ts': `
      import express from 'express'
      import { z } from 'zod'
      const app = express()
      app.post('/auth/login', validate(z.object({ email: z.string().email(), password: z.string() })), (req, res) => {})
      app.post('/users', requireAuth, validate(z.object({ email: z.string().email(), name: z.string().min(2) })), (req, res) => {})
      app.get('/users', requireAuth, (req, res) => {})
      app.get('/users/:id/posts', requireAuth, (req, res) => {})
      app.post('/users/:id/posts', requireAuth, (req, res) => {})
      app.get('/users/:id/avatar', requireAuth, (req, res) => {})
    `
  }

  it('breaks one rule per case, starting from a body that passes every rule', () => {
    const cases = validationCases(find(scan(files).endpoints, 'POST', '/users'))
    expect(cases.map((c) => c.id)).toEqual(['missing:email', 'missing:name', 'format:email', 'type:name', 'minLength:name'])
    expect(cases.find((c) => c.id === 'missing:email')?.body).toEqual({ name: 'example' })
    expect(cases.find((c) => c.id === 'format:email')?.body).toEqual({ email: 'not-an-email', name: 'example' })
  })

  it('puts validation requests in their own folder, sub-resources in nested folders, login first', () => {
    const result = scan(files)
    const { collection } = buildCollectionFromEndpoints(result.endpoints, {
      name: 'App',
      baseUrl: 'http://localhost:3000',
      auth: result.auth,
      validationTests: true
    })
    const layout = collection.requests.map((r) => `${folderPath(collection, r)} | ${r.method} ${r.url.replace('{{baseUrl}}', '')}`)
    expect(layout.slice(0, 6)).toEqual([
      'auth | POST /auth/login',
      'users | GET /users',
      'users | POST /users',
      'users | GET /users/:id/avatar',
      'users / posts | GET /users/:id/posts',
      'users / posts | POST /users/:id/posts'
    ])
    const validation = collection.requests.filter((r) => folderPath(collection, r).startsWith(VALIDATION_FOLDER))
    expect(validation.map((r) => folderPath(collection, r))).toContain(`${VALIDATION_FOLDER} / users`)
    expect(validation.every((r) => r.scan?.key.includes('#validation:'))).toBe(true)
    expect(collection.requests[0].tests).toContain('pm.environment.set("authToken"')
  })

  it('leaves the folder out unless asked', () => {
    const { collection } = buildCollectionFromEndpoints(scan(files).endpoints, { name: 'App', baseUrl: 'http://localhost:3000' })
    expect(collection.folders.some((f) => f.name === VALIDATION_FOLDER)).toBe(false)
  })
})

describe('login token script', () => {
  const runner = new ScriptRunnerService()
  const response = (status: number, data: unknown, headers: Record<string, string> = {}): ApiExecutionResult =>
    ({ ok: status < 400, status, statusText: '', headers, data: JSON.stringify(data), timeMs: 1, sizeBytes: 1 }) as ApiExecutionResult
  const request = { method: 'POST', url: '/login' } as ApiRequest

  it('recognizes common sign-in routes', () => {
    const endpoint = (method: string, path: string) => ({ method, path }) as DetectedEndpoint
    expect(isLoginEndpoint(endpoint('POST', '/api/users/login'))).toBe(true)
    expect(isLoginEndpoint(endpoint('POST', '/api/v1/login/access-token'))).toBe(true)
    expect(isLoginEndpoint(endpoint('POST', '/auth/token'))).toBe(true)
    expect(isLoginEndpoint(endpoint('POST', '/auth/logout'))).toBe(false)
    expect(isLoginEndpoint(endpoint('GET', '/auth/login'))).toBe(false)
    expect(isLoginEndpoint(endpoint('POST', '/users'))).toBe(false)
  })

  it('saves a token found in the body', async () => {
    const run = await runner.runTests({ script: loginTokenScript(), request, response: response(200, { user: { token: 'abc' } }), variables: { authToken: '' } })
    expect(run.results).toEqual([{ name: 'login returns a token', passed: true }])
    expect(run.variables?.authToken).toBe('abc')
  })

  it('falls back to the Authorization response header', async () => {
    const run = await runner.runTests({ script: loginTokenScript(), request, response: response(200, {}, { authorization: 'Bearer xyz' }), variables: {} })
    expect(run.variables?.authToken).toBe('xyz')
  })

  it('fails clearly when the login is rejected', async () => {
    const run = await runner.runTests({ script: loginTokenScript(), request, response: response(401, { error: 'bad' }), variables: { authToken: 'old' } })
    expect(run.results[0].passed).toBe(false)
    expect(run.variables?.authToken).toBe('old')
  })
})

describe('review findings', () => {
  const result = scan({
    'app.js': `
      const app = require('express')()
      app.post('/auth/login', (req, res) => { const { email } = req.body })
      app.get('/users', requireAuth, (req, res) => {})
      app.delete('/users/:id', (req, res) => {})
      app.post('/comments', (req, res) => { const { text } = req.body })
      app.get('/admin/stats', (req, res) => {})
      app.get('/accounts/:id', (req, res) => {})
      app.get('/health', (req, res) => {})
    `
  })
  const risks = assessRisks(result.endpoints)
  const idsFor = (method: string, path: string) => (risks.get(find(result.endpoints, method, path).id) ?? []).map((f) => f.id)

  it('flags open writes, admin routes and personal data by id when other routes are protected', () => {
    expect(idsFor('DELETE', '/users/:id')).toEqual(['open-write'])
    expect(idsFor('POST', '/comments')).toEqual(['open-write', 'unvalidated-body'])
    expect(idsFor('GET', '/admin/stats')).toEqual(['open-admin'])
    expect(idsFor('GET', '/accounts/:id')).toEqual(['open-sensitive-read'])
  })

  it('leaves sign-in, health checks and protected routes alone', () => {
    expect(idsFor('POST', '/auth/login')).toEqual(['unvalidated-body'])
    expect(idsFor('GET', '/health')).toEqual([])
    expect(idsFor('GET', '/users')).toEqual([])
  })

  it('skips open-route checks when no route is protected (auth lives elsewhere)', () => {
    const open = scan({ 'app.js': `const app = require('express')()\napp.delete('/users/:id', (req, res) => {})` })
    expect(assessRisks(open.endpoints).size).toBe(0)
  })
})
