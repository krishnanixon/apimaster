import type { DetectedFramework } from '../../types/code-scanner'

interface FrameworkRule {
  id: string
  label: string
  supported: boolean
  /** Dependency names (package.json) or tokens (other manifests) that indicate it. */
  match: string[]
}

const PACKAGE_JSON_RULES: FrameworkRule[] = [
  { id: 'express', label: 'Express', supported: true, match: ['express'] },
  { id: 'fastify', label: 'Fastify', supported: true, match: ['fastify'] },
  { id: 'nestjs', label: 'NestJS', supported: true, match: ['@nestjs/core'] },
  { id: 'nextjs', label: 'Next.js', supported: true, match: ['next'] },
  { id: 'koa', label: 'Koa', supported: false, match: ['koa'] },
  { id: 'hapi', label: 'hapi', supported: false, match: ['@hapi/hapi'] },
  { id: 'hono', label: 'Hono', supported: false, match: ['hono'] },
  { id: 'trpc', label: 'tRPC', supported: false, match: ['@trpc/server'] },
  { id: 'axios', label: 'Axios (frontend calls)', supported: false, match: ['axios'] },
  { id: 'react', label: 'React', supported: false, match: ['react'] },
  { id: 'vue', label: 'Vue', supported: false, match: ['vue'] },
  { id: 'angular', label: 'Angular', supported: false, match: ['@angular/core'] }
]

/** Manifest file name → rules matched as case-insensitive tokens in its text. */
const TEXT_MANIFEST_RULES: Record<string, FrameworkRule[]> = {
  'requirements.txt': [
    { id: 'fastapi', label: 'FastAPI', supported: true, match: ['fastapi'] },
    { id: 'flask', label: 'Flask', supported: true, match: ['flask'] },
    { id: 'django', label: 'Django', supported: true, match: ['django'] }
  ],
  'pyproject.toml': [
    { id: 'fastapi', label: 'FastAPI', supported: true, match: ['fastapi'] },
    { id: 'flask', label: 'Flask', supported: true, match: ['flask'] },
    { id: 'django', label: 'Django', supported: true, match: ['django'] }
  ],
  'go.mod': [
    { id: 'gin', label: 'Gin', supported: false, match: ['gin-gonic/gin'] },
    { id: 'echo', label: 'Echo', supported: false, match: ['labstack/echo'] },
    { id: 'chi', label: 'chi', supported: false, match: ['go-chi/chi'] },
    { id: 'fiber', label: 'Fiber', supported: false, match: ['gofiber/fiber'] }
  ],
  'pom.xml': [{ id: 'spring', label: 'Spring', supported: false, match: ['spring-boot', 'spring-web'] }],
  'build.gradle': [{ id: 'spring', label: 'Spring', supported: false, match: ['spring-boot', 'spring-web'] }],
  'build.gradle.kts': [{ id: 'spring', label: 'Spring', supported: false, match: ['spring-boot', 'spring-web'] }],
  'composer.json': [{ id: 'laravel', label: 'Laravel', supported: false, match: ['laravel/framework'] }],
  Gemfile: [{ id: 'rails', label: 'Rails', supported: false, match: ['rails'] }]
}

const MANIFEST_NAMES = new Set(['package.json', ...Object.keys(TEXT_MANIFEST_RULES)])

function baseName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1)
}

/** `requirements-dev.txt`, `requirements/base.txt` → `requirements.txt` rules. */
function manifestKey(path: string): string {
  if (/(^|\/)requirements[^/]*\.txt$|(^|\/)requirements\/[^/]+\.txt$/.test(path)) return 'requirements.txt'
  return baseName(path)
}

export function isManifestFile(path: string): boolean {
  return MANIFEST_NAMES.has(manifestKey(path))
}

function packageJsonDependencies(content: string): Set<string> {
  try {
    const pkg = JSON.parse(content) as Record<string, unknown>
    const names = new Set<string>()
    for (const field of ['dependencies', 'devDependencies', 'peerDependencies']) {
      const deps = pkg[field]
      if (deps && typeof deps === 'object') Object.keys(deps).forEach((n) => names.add(n))
    }
    return names
  } catch {
    return new Set()
  }
}

/** Frameworks indicated by one manifest file. */
export function detectFrameworksInManifest(path: string, content: string): DetectedFramework[] {
  const name = manifestKey(path)
  const found: DetectedFramework[] = []
  const add = (rule: FrameworkRule) =>
    found.push({ id: rule.id, label: rule.label, supported: rule.supported, evidence: path })

  if (name === 'package.json') {
    const deps = packageJsonDependencies(content)
    for (const rule of PACKAGE_JSON_RULES) if (rule.match.some((m) => deps.has(m))) add(rule)
    return found
  }

  const text = content.toLowerCase()
  for (const rule of TEXT_MANIFEST_RULES[name] ?? []) {
    if (rule.match.some((m) => new RegExp(`(^|[^a-z0-9_-])${m.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}([^a-z0-9_-]|$)`).test(text))) {
      add(rule)
    }
  }
  return found
}

/** Keeps the first occurrence of each framework id. */
export function dedupeFrameworks(frameworks: DetectedFramework[]): DetectedFramework[] {
  const seen = new Map<string, DetectedFramework>()
  for (const fw of frameworks) if (!seen.has(fw.id)) seen.set(fw.id, fw)
  return [...seen.values()]
}
