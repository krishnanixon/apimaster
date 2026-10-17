import { describe, expect, it } from 'vitest'
import { ProjectAnalyzer } from '../shared/lib/code-scanner/analyzer'
import { buildCollectionFromEndpoints } from '../shared/lib/code-scanner/spec-to-collection'

function analyze(files: Record<string, string>) {
  const analyzer = new ProjectAnalyzer(Object.keys(files))
  for (const [path, content] of Object.entries(files)) analyzer.addFile(path, content)
  return analyzer.finish()
}

function collection(files: Record<string, string>) {
  const result = analyze(files)
  return { result, ...buildCollectionFromEndpoints(result.endpoints, { name: 'x', baseUrl: 'http://localhost:3000', auth: result.auth }) }
}

describe('auth scheme detection', () => {
  it('turns an API key header the handler checks into API-key auth, not a header to fill in', () => {
    const { result, collection: c, environmentVariables } = collection({
      'app.js': `
        const app = require('express')()
        app.get('/data', (req, res) => { if (req.headers['x-api-key'] !== process.env.KEY) return res.sendStatus(401) })
        app.get('/health', (req, res) => res.send('ok'))
      `
    })
    expect(result.auth).toEqual({ type: 'apiKey', name: 'x-api-key', in: 'header' })
    const data = result.endpoints.find((e) => e.path === '/data')!
    expect(data.securityRequired).toBe(true)
    expect(data.parameters).toEqual([])
    expect(c.auth).toEqual({ type: 'apiKey', apiKeyName: 'x-api-key', apiKeyValue: '{{apiKey}}', apiKeyLocation: 'header' })
    expect(environmentVariables.map((v) => v.key)).toEqual(['baseUrl', 'apiKey'])
    expect(c.requests.find((r) => r.url.endsWith('/health'))!.auth.type).toBe('none')
  })

  it('detects Basic auth middleware', () => {
    const { result, collection: c, environmentVariables } = collection({
      'app.js': `
        const express = require('express')
        const basicAuth = require('express-basic-auth')
        const app = express()
        app.get('/admin', basicAuth({ users: { admin: 'x' } }), (req, res) => {})
      `
    })
    expect(result.auth).toEqual({ type: 'basic' })
    expect(c.auth).toEqual({ type: 'basic', basicUsername: '{{username}}', basicPassword: '{{password}}' })
    expect(environmentVariables.map((v) => v.key)).toEqual(['baseUrl', 'username', 'password'])
  })

  it('uses the `Token` prefix when the code expects `Authorization: Token <jwt>`', () => {
    const { result, collection: c } = collection({
      'src/auth.ts': `
        const getTokenFromHeaders = (req) => {
          if (req.headers.authorization && req.headers.authorization.split(' ')[0] === 'Token') return req.headers.authorization.split(' ')[1]
          if (req.headers.authorization && req.headers.authorization.split(' ')[0] === 'Bearer') return req.headers.authorization.split(' ')[1]
        }
      `,
      'src/app.ts': `
        import express from 'express'
        const app = express()
        app.get('/user', auth.required, (req, res) => {})
      `
    })
    expect(result.auth).toEqual({ type: 'bearer', prefix: 'Token' })
    expect(c.auth).toEqual({ type: 'apiKey', apiKeyName: 'Authorization', apiKeyValue: 'Token {{authToken}}', apiKeyLocation: 'header' })
  })

  it('reads a prefix configured in settings (flask-jwt-extended, DRF JWT)', () => {
    const flask = analyze({
      'conduit/settings.py': `class Config:\n    JWT_HEADER_TYPE = 'Token'`,
      'conduit/views.py': `bp = Blueprint('x', __name__)\n@bp.get('/api/user')\n@jwt_required\ndef me(): ...`
    })
    expect(flask.auth).toEqual({ type: 'bearer', prefix: 'Token' })
    const drf = analyze({
      'settings.py': `JWT_AUTH = {'JWT_AUTH_HEADER_PREFIX': 'JWT'}\nROOT_URLCONF = 'urls'`,
      'urls.py': `from . import views\nurlpatterns = [path('me/', views.me)]`,
      'views.py': `@api_view(['GET'])\n@permission_classes([IsAuthenticated])\ndef me(request): ...`
    })
    expect(drf.auth).toEqual({ type: 'bearer', prefix: 'JWT' })
  })

  it('prefers the scheme an OpenAPI document declares', () => {
    const { result } = collection({
      'openapi.json': JSON.stringify({
        openapi: '3.0.0',
        info: {},
        security: [{ key: [] }],
        components: { securitySchemes: { key: { type: 'apiKey', in: 'query', name: 'api_key' } } },
        paths: { '/pets': { get: {} } }
      })
    })
    expect(result.auth).toEqual({ type: 'apiKey', name: 'api_key', in: 'query' })
  })

  it('reads FastAPI APIKeyHeader and keeps Bearer for JWT projects', () => {
    expect(
      analyze({
        'app/deps.py': `api_key_header = APIKeyHeader(name="X-API-Key")\ndef get_api_key(key: str = Security(api_key_header)): ...`,
        'app/main.py': `app = FastAPI()\n@app.get("/items", dependencies=[Depends(get_api_key)])\ndef items(): ...`
      }).auth
    ).toEqual({ type: 'apiKey', name: 'X-API-Key', in: 'header' })

    expect(
      analyze({
        'src/users.controller.ts': `@Controller('users') @UseGuards(JwtAuthGuard) export class Users { @Get() list() {} }`
      }).auth
    ).toEqual({ type: 'bearer' })
  })

  it('sets no auth when nothing is protected', () => {
    const { result, collection: c } = collection({ 'app.js': `const app = require('express')(); app.get('/a', (q, s) => {})` })
    expect(result.auth).toBeUndefined()
    expect(c.auth).toEqual({ type: 'none' })
  })
})
