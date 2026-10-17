import { describe, expect, it } from 'vitest'
import { ProjectAnalyzer, isCandidateFile } from '../shared/lib/code-scanner/analyzer'
import { nextRouteLocation } from '../shared/lib/code-scanner/extractors/nextjs'
import { logicalLines, parseCall, pyString, scanPython } from '../shared/lib/code-scanner/extractors/python/source'
import type { DetectedEndpoint } from '../shared/types/code-scanner'

function analyze(files: Record<string, string>) {
  const analyzer = new ProjectAnalyzer(Object.keys(files))
  for (const [path, content] of Object.entries(files)) analyzer.addFile(path, content)
  return analyzer.finish()
}

function summary(endpoints: DetectedEndpoint[]) {
  return endpoints.map((e) => `${e.method} ${e.path}${e.securityRequired ? ' [auth]' : ''}`)
}

function find(endpoints: DetectedEndpoint[], method: string, path: string): DetectedEndpoint {
  const found = endpoints.find((e) => e.method === method && e.path === path)
  if (!found) throw new Error(`Missing ${method} ${path} in ${summary(endpoints).join(', ')}`)
  return found
}

describe('NestJS', () => {
  const files = {
    'src/main.ts': `
      import { NestFactory } from '@nestjs/core'
      import { VersioningType } from '@nestjs/common'
      async function bootstrap() {
        const app = await NestFactory.create(AppModule)
        app.setGlobalPrefix('api')
        app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' })
        await app.listen(process.env.PORT ?? 4000)
      }
    `,
    'src/app.module.ts': `
      @Module({ providers: [{ provide: APP_GUARD, useClass: JwtAuthGuard }] })
      export class AppModule {}
    `,
    'src/users/users.controller.ts': `
      import { Body, Controller, Delete, Get, Param, Post, Query, Headers, Version } from '@nestjs/common'
      import { CreateUserDto, UpdateUserDto, ListUsersQuery } from './dto'
      @Controller('users')
      export class UsersController {
        @Public()
        @Post()
        @ApiOperation({ summary: 'Register a user' })
        create(@Body() dto: CreateUserDto) {}

        @Get()
        findAll(@Query() query: ListUsersQuery, @Headers('x-tenant') tenant: string) {}

        @Get(':id')
        @Version('2')
        findOne(@Param('id') id: string) {}

        @Patch(':id')
        update(@Param('id') id: string, @Body() dto: UpdateUserDto) {}

        @Delete([':id', ':id/hard'])
        remove(@Param('id') id: string) {}
      }
    `,
    'src/users/dto.ts': `
      export class CreateUserDto {
        @IsEmail() email: string
        @ApiProperty({ example: 'Ada' }) name: string
        age?: number
        roles: string[]
        address: AddressDto
      }
      export class AddressDto { city: string }
      export class UpdateUserDto extends PartialType(OmitType(CreateUserDto, ['email'] as const)) {}
      export class ListUsersQuery { page?: number; search?: string }
    `
  }

  it('joins global prefix, URI version, controller and method paths', () => {
    const result = analyze(files)
    expect(summary(result.endpoints)).toEqual([
      'GET /api/v1/users [auth]',
      'POST /api/v1/users',
      'PATCH /api/v1/users/:id [auth]',
      'DELETE /api/v1/users/:id [auth]',
      'DELETE /api/v1/users/:id/hard [auth]',
      'GET /api/v2/users/:id [auth]'
    ])
    expect(result.baseUrl).toBe('http://localhost:4000')
  })

  it('builds bodies from DTO classes and query params from query DTOs', () => {
    const { endpoints } = analyze(files)
    const create = find(endpoints, 'POST', '/api/v1/users')
    expect(create.summary).toBe('Register a user')
    expect(create.requestBody?.example).toEqual({
      email: 'user@example.com',
      name: 'Ada',
      age: 0,
      roles: [],
      address: { city: '' }
    })
    const list = find(endpoints, 'GET', '/api/v1/users')
    expect(list.parameters.map((p) => `${p.in}:${p.name}`)).toEqual(['query:page', 'query:search', 'header:x-tenant'])
  })

  it('handles OmitType on a PartialType base', () => {
    // OmitType(CreateUserDto, ['email']) nested inside PartialType is resolved through the inner call.
    const update = find(analyze(files).endpoints, 'PATCH', '/api/v1/users/:id')
    expect(update.requestBody?.example).toEqual({ name: 'Ada', age: 0, roles: [], address: { city: '' } })
  })

  it('reads guards on controllers without a global guard', () => {
    const result = analyze({
      'src/cats.controller.ts': `
        @Controller({ path: 'cats' })
        @UseGuards(AuthGuard('jwt'))
        export class CatsController {
          @Get() list() {}
          @Public() @Get('count') count() {}
        }
        @Controller()
        export class HealthController {
          @Get('health') @UseGuards(ThrottlerGuard) health() {}
        }
      `
    })
    expect(summary(result.endpoints)).toEqual(['GET /cats [auth]', 'GET /cats/count', 'GET /health'])
  })
})

describe('Next.js', () => {
  it('maps route files to paths', () => {
    expect(nextRouteLocation('app/api/users/[id]/route.ts')?.path).toBe('/api/users/:id')
    expect(nextRouteLocation('src/app/(admin)/api/[...slug]/route.js')?.path).toBe('/api/:slug')
    expect(nextRouteLocation('apps/web/app/route.ts')?.path).toBe('/')
    expect(nextRouteLocation('pages/api/users/index.ts')?.path).toBe('/api/users')
    expect(nextRouteLocation('src/pages/api/posts/[pid].ts')?.path).toBe('/api/posts/:pid')
    expect(nextRouteLocation('app/_lib/route.ts')).toBeNull()
    expect(nextRouteLocation('myapp/route.ts')).toBeNull()
  })

  it('reads App Router handlers, their inputs and auth', () => {
    const result = analyze({
      'next.config.mjs': `export default { basePath: '/docs' }`,
      'app/api/posts/route.ts': `
        import { NextResponse } from 'next/server'
        export async function GET(request: Request) {
          const { searchParams } = new URL(request.url)
          const page = searchParams.get('page')
          return NextResponse.json([])
        }
        export async function POST(req: NextRequest) {
          const session = await getServerSession(authOptions)
          const { title, content } = await req.json()
          const key = req.headers.get('x-idempotency-key')
        }
      `,
      'app/api/posts/[id]/route.ts': `
        const handler = async (req: Request, { params }) => Response.json({})
        export { handler as GET, handler as DELETE }
      `
    })
    expect(summary(result.endpoints)).toEqual([
      'GET /docs/api/posts',
      'POST /docs/api/posts [auth]',
      'GET /docs/api/posts/:id',
      'DELETE /docs/api/posts/:id'
    ])
    const create = find(result.endpoints, 'POST', '/docs/api/posts')
    expect(create.requestBody?.example).toEqual({ title: '', content: '' })
    expect(create.parameters).toContainEqual({ name: 'x-idempotency-key', in: 'header', required: false })
    expect(find(result.endpoints, 'GET', '/docs/api/posts').parameters).toContainEqual({ name: 'page', in: 'query', required: false })
  })

  it('reads req.method branches in pages/api handlers', () => {
    const result = analyze({
      'pages/api/users/[id].ts': `
        export default async function handler(req, res) {
          switch (req.method) {
            case 'GET': return res.json({})
            case 'PUT': { const { name } = req.body; return res.json({ name }) }
          }
        }
      `,
      'pages/api/hello.js': `module.exports = (req, res) => res.json({ ok: true })`
    })
    expect(summary(result.endpoints)).toEqual(['GET /api/hello', 'GET /api/users/:id', 'PUT /api/users/:id'])
    expect(find(result.endpoints, 'PUT', '/api/users/:id').requestBody?.example).toEqual({ name: '' })
    expect(find(result.endpoints, 'GET', '/api/users/:id').parameters).toEqual([{ name: 'id', in: 'path', required: true }])
  })
})

describe('Python source reader', () => {
  it('joins bracketed lines, strips comments and keeps indentation', () => {
    const lines = logicalLines(`
@router.get(
    "/items",  # comment
    response_model=Item,
)
async def read(q: str = None):
    return {"a": "# not a comment"}
`)
    expect(lines.map((l) => [l.text, l.line, l.indent])).toEqual([
      ['@router.get(     "/items",       response_model=Item, )', 2, 0],
      ['async def read(q: str = None):', 6, 0],
      ['return {"a": "# not a comment"}', 7, 4]
    ])
  })

  it('parses calls and string expressions', () => {
    const call = parseCall(`include_router(users.router, prefix=f"/api" + "/v1", tags=["users"])`)!
    expect(call.positional).toEqual(['users.router'])
    expect(pyString(call.keywords.get('prefix'))).toBe('/api/v1')
    expect(pyString(`API + "/x"`, new Map([['API', '"/api"']]))).toBe('/api/x')
    expect(pyString(`f"/{version}"`)).toBeNull()
  })

  it('finds defs, classes and methods', () => {
    const module = scanPython(`
class UserView(APIView):
    permission_classes = [IsAuthenticated]
    def get(self, request):
        pass

    class Meta:
        fields = ["a"]

def helper():
    pass
`)
    expect(module.classes.map((c) => [c.name, c.parent ?? null])).toEqual([
      ['UserView', null],
      ['Meta', 'UserView']
    ])
    expect(module.defs.map((d) => [d.name, d.className ?? null])).toEqual([
      ['get', 'UserView'],
      ['helper', null]
    ])
  })

  it('skips Python tests and migrations', () => {
    expect(isCandidateFile('app/api/routes.py')).toBe(true)
    expect(isCandidateFile('app/tests/test_users.py')).toBe(false)
    expect(isCandidateFile('users/migrations/0001_initial.py')).toBe(false)
    expect(isCandidateFile('test_api.py')).toBe(false)
  })
})

describe('FastAPI', () => {
  it('follows include_router prefixes across modules and reads the signature', () => {
    const result = analyze({
      'backend/app/main.py': `
from fastapi import FastAPI
from app.api.api_v1.api import api_router
from app.core.config import settings

app = FastAPI(title="x")
app.include_router(api_router, prefix="/api/v1")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8080)
`,
      'backend/app/api/api_v1/api.py': `
from fastapi import APIRouter
from app.api.api_v1.endpoints import items, login

api_router = APIRouter()
api_router.include_router(login.router, tags=["login"])
api_router.include_router(items.router, prefix="/items", tags=["items"])
`,
      'backend/app/api/api_v1/endpoints/items.py': `
from fastapi import APIRouter, Depends, Header, Query
from app import schemas
from app.api import deps

router = APIRouter(dependencies=[Depends(deps.get_current_active_user)])

@router.get("/", response_model=List[schemas.Item])
def read_items(
    db: Session = Depends(deps.get_db),
    skip: int = 0,
    limit: int = Query(100, alias="max"),
) -> Any:
    ...

@router.post("/")
def create_item(*, item_in: schemas.ItemCreate, x_request_id: str = Header(None)):
    ...

@router.put("/{id}")
async def update_item(id: int, item_in: list[schemas.ItemCreate]):
    ...
`,
      'backend/app/api/api_v1/endpoints/login.py': `
from fastapi import APIRouter
router = APIRouter()

@router.post("/login/access-token", summary="Get a token")
def login_access_token(form_data: OAuth2PasswordRequestForm = Depends()):
    ...
`,
      'backend/app/schemas/item.py': `
from pydantic import BaseModel, EmailStr, Field

class ItemBase(BaseModel):
    title: Optional[str] = None
    description: str | None = Field(None, example="A thing")

class ItemCreate(ItemBase):
    title: str
    owner_email: EmailStr
    tags: List[str] = []
    kind: Kind = Kind.basic

class Kind(str, Enum):
    basic = "basic"
    pro = "pro"
`
    })
    expect(summary(result.endpoints)).toEqual([
      'GET /api/v1/items/ [auth]',
      'POST /api/v1/items/ [auth]',
      'PUT /api/v1/items/{id} [auth]',
      'POST /api/v1/login/access-token'
    ])
    expect(result.baseUrl).toBe('http://localhost:8080')

    const list = find(result.endpoints, 'GET', '/api/v1/items/')
    expect(list.parameters.map((p) => `${p.in}:${p.name}`)).toEqual(['query:skip', 'query:max'])
    const create = find(result.endpoints, 'POST', '/api/v1/items/')
    expect(create.requestBody?.example).toEqual({
      title: '',
      description: 'A thing',
      owner_email: 'user@example.com',
      tags: [],
      kind: 'basic'
    })
    expect(create.parameters).toContainEqual({ name: 'x-request-id', in: 'header', required: false })
    expect(find(result.endpoints, 'PUT', '/api/v1/items/{id}').requestBody?.example).toEqual([
      expect.objectContaining({ owner_email: 'user@example.com' })
    ])
    expect(find(result.endpoints, 'POST', '/api/v1/login/access-token').summary).toBe('Get a token')
  })
})

describe('Flask', () => {
  it('reads blueprints, url prefixes, methods, auth decorators and request usage', () => {
    const result = analyze({
      'app/__init__.py': `
from flask import Flask
from .auth import bp as auth_bp
from . import blog

def create_app():
    app = Flask(__name__)
    app.register_blueprint(auth_bp)
    app.register_blueprint(blog.bp, url_prefix="/blog")
    return app
`,
      'app/auth.py': `
from flask import Blueprint, request
bp = Blueprint("auth", __name__, url_prefix="/auth")

@bp.route("/register", methods=("GET", "POST"))
def register():
    username = request.form["username"]
    password = request.form.get("password")
`,
      'app/blog.py': `
bp = Blueprint("blog", __name__, url_prefix="/ignored")

@bp.get("/<int:id>")
def show(id):
    return {}

@bp.post("/create")
@login_required
def create():
    data = request.get_json()
    title = data["title"]
    q = request.args.get("draft")
    token = request.headers.get("X-Token")
`
    })
    expect(summary(result.endpoints)).toEqual([
      'GET /auth/register',
      'POST /auth/register',
      'GET /blog/:id',
      'POST /blog/create [auth]'
    ])
    expect(result.baseUrl).toBe('http://localhost:5000')
    expect(find(result.endpoints, 'POST', '/auth/register').requestBody?.example).toEqual({ username: '', password: '' })
    const create = find(result.endpoints, 'POST', '/blog/create')
    expect(create.requestBody?.example).toEqual({ title: '' })
    expect(create.parameters.map((p) => `${p.in}:${p.name}`)).toEqual(['query:draft', 'header:x-token'])
  })
})

describe('patterns found in real projects', () => {
  it('FastAPI: Annotated dependency aliases and a prefix from pydantic settings', () => {
    const result = analyze({
      'app/core/config.py': `
class Settings(BaseSettings):
    API_V1_STR: str = "/api/v1"
settings = Settings()
`,
      'app/api/deps.py': `
SessionDep = Annotated[Session, Depends(get_db)]
CurrentUser = Annotated[User, Depends(get_current_user)]
`,
      'app/main.py': `
from app.core.config import settings
from app.api.routes import items
app = FastAPI()
app.include_router(items.router, prefix=settings.API_V1_STR)
`,
      'app/api/routes/items.py': `
from app.api.deps import CurrentUser, SessionDep
router = APIRouter(prefix="/items")

@router.get("/")
def read_items(session: SessionDep, current_user: CurrentUser, skip: int = 0):
    ...
`
    })
    expect(summary(result.endpoints)).toEqual(['GET /api/v1/items/ [auth]'])
    expect(result.endpoints[0].parameters).toEqual([{ name: 'skip', in: 'query', required: false }])
    expect(result.warnings).toEqual([])
  })

  it('Flask: blueprints referenced as package.module.blueprint and webargs schemas', () => {
    const result = analyze({
      'requirements/prod.txt': 'Flask==2.0\nwebargs',
      'conduit/app.py': `
from conduit import user
def register_blueprints(app):
    app.register_blueprint(user.views.blueprint)
app = Flask(__name__)
`,
      'conduit/user/__init__.py': `from . import views`,
      'conduit/user/views.py': `
from .serializers import user_schema
blueprint = Blueprint('user', __name__)

@blueprint.route('/api/users', methods=('POST',))
@use_kwargs(user_schema)
def register_user(username, password, email, **kwargs):
    pass
`,
      'conduit/user/serializers.py': `
class UserSchema(Schema):
    username = fields.Str()
    email = fields.Email()
    password = fields.Str(load_only=True)
    token = fields.Str(dump_only=True)
    profile = fields.Nested(ProfileSchema)

class ProfileSchema(Schema):
    bio = fields.Str()

user_schema = UserSchema()
`
    })
    expect(result.frameworks.map((f) => f.id)).toEqual(['flask'])
    const register = find(result.endpoints, 'POST', '/api/users')
    expect(register.confidence).toBe('high')
    expect(register.requestBody?.example).toEqual({
      username: '',
      email: 'user@example.com',
      password: '',
      profile: { bio: '' }
    })
  })

  it('Django: optional-slash regex routes, read-only permissions and annotated permission_classes', () => {
    const result = analyze({
      'site/settings.py': `
ROOT_URLCONF = "site.urls"
REST_FRAMEWORK = {"DEFAULT_PERMISSION_CLASSES": ("rest_framework.permissions.IsAuthenticatedOrReadOnly",)}
`,
      'site/urls.py': `
urlpatterns = [
    url(r'^api/', include('blog.urls')),
]
`,
      'blog/urls.py': `
from .views import PostList, MeApi
urlpatterns = [
    url(r'^posts/?$', PostList.as_view()),
    path('me/', MeApi.as_view()),
]
`,
      'blog/mixins.py': `
class ApiAuthMixin:
    permission_classes: Sequence[Type[BasePermission]] = (IsAuthenticated,)
`,
      'blog/views.py': `
from .mixins import ApiAuthMixin
class PostList(generics.ListCreateAPIView):
    pass

class MeApi(ApiAuthMixin, APIView):
    def get(self, request):
        pass
`
    })
    expect(summary(result.endpoints)).toEqual(['GET /api/me/ [auth]', 'GET /api/posts', 'POST /api/posts [auth]'])
  })
})

describe('Django', () => {
  const files = {
    'mysite/settings.py': `
ROOT_URLCONF = "mysite.urls"
REST_FRAMEWORK = {
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
}
`,
    'mysite/urls.py': `
from django.urls import include, path, re_path
from django.contrib import admin
urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include("api.urls")),
    re_path(r"^legacy/(?P<slug>[-\\w]+)/$", views.legacy),
]
`,
    'api/urls.py': `
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register(r"articles", views.ArticleViewSet, basename="article")
router.register("tags", views.TagViewSet)

urlpatterns = [
    path("", include(router.urls)),
    path("users/<int:pk>/", views.UserDetail.as_view(), name="user-detail"),
    path("login/", views.login_view),
    path("health/", views.health),
]
`,
    'api/views.py': `
from rest_framework import viewsets, generics, mixins
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.permissions import AllowAny

class ArticleViewSet(viewsets.ModelViewSet):
    serializer_class = ArticleSerializer
    lookup_field = "slug"

    @action(detail=True, methods=["post"], url_path="favorite")
    def favorite(self, request, slug=None):
        pass

class TagViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    permission_classes = [AllowAny]

class UserDetail(generics.RetrieveUpdateAPIView):
    serializer_class = UserSerializer

@api_view(["POST"])
@permission_classes([AllowAny])
def login_view(request):
    email = request.data.get("email")
    password = request.data["password"]

def health(request):
    if request.method == "POST":
        pass
`,
    'api/serializers.py': `
from rest_framework import serializers

class ArticleSerializer(serializers.ModelSerializer):
    author = serializers.ReadOnlyField(source="author.username")
    tags = serializers.ListField(child=serializers.CharField())

    class Meta:
        model = Article
        fields = ["id", "title", "body", "author", "published", "tags"]

class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = "__all__"
        read_only_fields = ["joined"]
`,
    'api/models.py': `
from django.db import models

class Article(models.Model):
    title = models.CharField(max_length=200)
    body = models.TextField()
    published = models.BooleanField(default=False)
    created = models.DateTimeField(auto_now_add=True)

class User(models.Model):
    email = models.EmailField(unique=True)
    age = models.PositiveIntegerField()
    joined = models.DateField()
`
  }

  it('walks the root URLconf through include() and DRF routers', () => {
    const result = analyze(files)
    expect(summary(result.endpoints)).toEqual([
      'GET /api/articles/ [auth]',
      'POST /api/articles/ [auth]',
      'GET /api/articles/:slug/ [auth]',
      'PUT /api/articles/:slug/ [auth]',
      'PATCH /api/articles/:slug/ [auth]',
      'DELETE /api/articles/:slug/ [auth]',
      'POST /api/articles/:slug/favorite/ [auth]',
      'GET /api/health/',
      'POST /api/health/',
      'POST /api/login/',
      'GET /api/tags/',
      'GET /api/users/:pk/ [auth]',
      'PUT /api/users/:pk/ [auth]',
      'PATCH /api/users/:pk/ [auth]',
      'GET /legacy/:slug/'
    ])
    expect(result.baseUrl).toBe('http://localhost:8000')
  })

  it('builds bodies from serializers and models', () => {
    const { endpoints } = analyze(files)
    expect(find(endpoints, 'POST', '/api/articles/').requestBody?.example).toEqual({
      title: '',
      body: '',
      published: false,
      tags: []
    })
    expect(find(endpoints, 'PUT', '/api/users/:pk/').requestBody?.example).toEqual({ email: 'user@example.com', age: 0 })
    expect(find(endpoints, 'POST', '/api/login/').requestBody?.example).toEqual({ email: '', password: '' })
    expect(find(endpoints, 'GET', '/legacy/:slug/').confidence).toBe('low')
  })
})
