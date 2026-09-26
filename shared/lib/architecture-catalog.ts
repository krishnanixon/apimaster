/**
 * Architecture Designer — static catalog of component kinds, connection kinds,
 * views and workspace sections.
 *
 * Lives in `shared/` because both the renderer (palette, properties panel) and
 * the main process (AI prompt construction, validation) need the same
 * vocabulary. Icons are stored as Lucide *names* rather than components so this
 * module stays free of React imports.
 */

import type {
  ArchComponentCategory,
  ArchComponentKind,
  ArchConnectionKind,
  ArchSectionId,
  ArchViewId
} from '@shared/types/architecture'

export interface ArchComponentKindMeta {
  kind: ArchComponentKind
  label: string
  category: ArchComponentCategory
  /** Lucide icon name, resolved at render time. */
  icon: string
  color: string
  description: string
  /** Sensible default for the `technology` field. */
  defaultTechnology?: string
  /** Views this kind naturally belongs to. */
  views: ArchViewId[]
}

export interface ArchCategoryMeta {
  id: ArchComponentCategory
  label: string
  description: string
  color: string
}

export const ARCH_CATEGORIES: ArchCategoryMeta[] = [
  {
    id: 'application',
    label: 'Applications',
    description: 'User-facing clients',
    color: '#6366f1'
  },
  { id: 'backend', label: 'Backend', description: 'Services and APIs', color: '#0ea5e9' },
  { id: 'database', label: 'Data', description: 'Stores and caches', color: '#10b981' },
  {
    id: 'infrastructure',
    label: 'Infrastructure',
    description: 'Hosting and networking',
    color: '#f59e0b'
  },
  {
    id: 'integration',
    label: 'Integrations',
    description: 'Third-party services',
    color: '#ec4899'
  },
  { id: 'ai', label: 'AI', description: 'Models and pipelines', color: '#a855f7' }
]

const ALL_VIEWS: ArchViewId[] = ['system-context', 'container', 'component']

function kind(
  k: ArchComponentKind,
  label: string,
  category: ArchComponentCategory,
  icon: string,
  color: string,
  description: string,
  views: ArchViewId[],
  defaultTechnology?: string
): ArchComponentKindMeta {
  return { kind: k, label, category, icon, color, description, views, defaultTechnology }
}

export const ARCH_COMPONENT_KINDS: ArchComponentKindMeta[] = [
  // Applications
  kind('web-app', 'Web App', 'application', 'Globe', '#6366f1', 'Browser client', [...ALL_VIEWS, 'application'], 'React'),
  kind('mobile-app', 'Mobile App', 'application', 'Smartphone', '#6366f1', 'iOS / Android client', [...ALL_VIEWS, 'application'], 'React Native'),
  kind('desktop-app', 'Desktop App', 'application', 'Monitor', '#6366f1', 'Installed desktop client', [...ALL_VIEWS, 'application'], 'Electron'),
  kind('admin-panel', 'Admin Panel', 'application', 'LayoutDashboard', '#6366f1', 'Internal back-office UI', [...ALL_VIEWS, 'application'], 'React'),
  kind('client-app', 'Client App', 'application', 'AppWindow', '#6366f1', 'Generic consumer', [...ALL_VIEWS, 'application']),

  // Backend
  kind('api-gateway', 'API Gateway', 'backend', 'DoorOpen', '#0ea5e9', 'Single entry point, routing and rate limits', [...ALL_VIEWS, 'backend', 'api'], 'Kong'),
  kind('backend-service', 'Backend Service', 'backend', 'Server', '#0ea5e9', 'Application server', [...ALL_VIEWS, 'backend'], 'Node.js'),
  kind('microservice', 'Microservice', 'backend', 'Boxes', '#0ea5e9', 'Independently deployable service', [...ALL_VIEWS, 'backend'], 'Node.js'),
  kind('monolith', 'Monolith', 'backend', 'Package', '#0ea5e9', 'Single deployable application', [...ALL_VIEWS, 'backend'], 'Node.js'),
  kind('worker', 'Worker', 'backend', 'Cog', '#0ea5e9', 'Async job processor', [...ALL_VIEWS, 'backend']),
  kind('background-job', 'Background Job', 'backend', 'Timer', '#0ea5e9', 'Deferred task', [...ALL_VIEWS, 'backend']),
  kind('scheduler', 'Scheduler', 'backend', 'CalendarClock', '#0ea5e9', 'Cron / periodic trigger', [...ALL_VIEWS, 'backend']),
  kind('serverless-function', 'Serverless Function', 'backend', 'Zap', '#0ea5e9', 'On-demand compute', [...ALL_VIEWS, 'backend', 'cloud'], 'AWS Lambda'),

  // Data
  kind('postgresql', 'PostgreSQL', 'database', 'Database', '#10b981', 'Relational database', [...ALL_VIEWS, 'database', 'er'], 'PostgreSQL'),
  kind('mysql', 'MySQL', 'database', 'Database', '#10b981', 'Relational database', [...ALL_VIEWS, 'database', 'er'], 'MySQL'),
  kind('mongodb', 'MongoDB', 'database', 'Leaf', '#10b981', 'Document database', [...ALL_VIEWS, 'database', 'er'], 'MongoDB'),
  kind('redis', 'Redis', 'database', 'Gauge', '#10b981', 'In-memory cache', [...ALL_VIEWS, 'database'], 'Redis'),
  kind('elasticsearch', 'Elasticsearch', 'database', 'Search', '#10b981', 'Search index', [...ALL_VIEWS, 'database'], 'Elasticsearch'),
  kind('vector-db', 'Vector Database', 'database', 'Braces', '#10b981', 'Embedding store', [...ALL_VIEWS, 'database'], 'pgvector'),
  kind('object-storage', 'Object Storage', 'database', 'HardDrive', '#10b981', 'Blob / file storage', [...ALL_VIEWS, 'database'], 'AWS S3'),

  // Infrastructure
  kind('server', 'Server', 'infrastructure', 'Server', '#f59e0b', 'Physical or virtual host', ['infrastructure', 'deployment']),
  kind('vps', 'VPS', 'infrastructure', 'HardDrive', '#f59e0b', 'Virtual private server', ['infrastructure', 'deployment']),
  kind('aws', 'AWS', 'infrastructure', 'Cloud', '#f59e0b', 'Amazon Web Services', ['infrastructure', 'deployment', 'cloud']),
  kind('cloudflare', 'Cloudflare', 'infrastructure', 'CloudLightning', '#f59e0b', 'Edge network and WAF', ['infrastructure', 'cloud']),
  kind('cdn', 'CDN', 'infrastructure', 'Network', '#f59e0b', 'Content delivery', ['infrastructure', 'deployment']),
  kind('load-balancer', 'Load Balancer', 'infrastructure', 'Split', '#f59e0b', 'Traffic distribution', ['infrastructure', 'deployment']),
  kind('kubernetes', 'Kubernetes', 'infrastructure', 'Hexagon', '#f59e0b', 'Container orchestration', ['infrastructure', 'deployment']),
  kind('docker', 'Docker', 'infrastructure', 'Container', '#f59e0b', 'Container runtime', ['infrastructure', 'deployment']),
  kind('container', 'Container', 'infrastructure', 'Box', '#f59e0b', 'Running container', ['infrastructure', 'deployment']),
  kind('queue', 'Queue', 'infrastructure', 'ListOrdered', '#f59e0b', 'Message broker', [...ALL_VIEWS, 'infrastructure', 'data-flow'], 'RabbitMQ'),

  // Integrations
  kind('payment-gateway', 'Payment Gateway', 'integration', 'CreditCard', '#ec4899', 'Payment processing', [...ALL_VIEWS, 'integration'], 'Stripe'),
  kind('email-service', 'Email Service', 'integration', 'Mail', '#ec4899', 'Transactional email', [...ALL_VIEWS, 'integration'], 'SendGrid'),
  kind('sms-service', 'SMS', 'integration', 'MessageSquare', '#ec4899', 'Text messaging', [...ALL_VIEWS, 'integration'], 'Twilio'),
  kind('notification-service', 'Notifications', 'integration', 'Bell', '#ec4899', 'Push notifications', [...ALL_VIEWS, 'integration'], 'Firebase'),
  kind('auth-provider', 'Auth Provider', 'integration', 'KeyRound', '#ec4899', 'Identity provider', [...ALL_VIEWS, 'integration', 'security'], 'Auth0'),
  kind('third-party-api', 'Third-party API', 'integration', 'Plug', '#ec4899', 'External service', [...ALL_VIEWS, 'integration']),
  kind('sap', 'SAP', 'integration', 'Building2', '#ec4899', 'Enterprise system', [...ALL_VIEWS, 'integration']),
  kind('crm', 'CRM', 'integration', 'Users', '#ec4899', 'Customer relationship system', [...ALL_VIEWS, 'integration']),
  kind('erp', 'ERP', 'integration', 'Factory', '#ec4899', 'Resource planning system', [...ALL_VIEWS, 'integration']),
  kind('ai-provider', 'AI Provider', 'integration', 'Sparkles', '#ec4899', 'Hosted model API', [...ALL_VIEWS, 'integration', 'cloud'], 'OpenAI'),

  // AI
  kind('llm', 'LLM', 'ai', 'Brain', '#a855f7', 'Large language model', [...ALL_VIEWS, 'cloud'], 'GPT-4o'),
  kind('ai-agent', 'AI Agent', 'ai', 'Bot', '#a855f7', 'Autonomous task runner', [...ALL_VIEWS]),
  kind('embedding-model', 'Embedding Model', 'ai', 'Binary', '#a855f7', 'Text to vector', [...ALL_VIEWS]),
  kind('vector-store', 'Vector Store', 'ai', 'Layers', '#a855f7', 'Similarity search', [...ALL_VIEWS, 'database']),
  kind('rag-pipeline', 'RAG Pipeline', 'ai', 'Workflow', '#a855f7', 'Retrieval augmented generation', [...ALL_VIEWS, 'data-flow']),
  kind('ai-gateway', 'AI Gateway', 'ai', 'Router', '#a855f7', 'Model routing and quotas', [...ALL_VIEWS])
]

const KIND_INDEX = new Map<ArchComponentKind, ArchComponentKindMeta>(
  ARCH_COMPONENT_KINDS.map((meta) => [meta.kind, meta])
)

export function getComponentKindMeta(kindId: ArchComponentKind): ArchComponentKindMeta | undefined {
  return KIND_INDEX.get(kindId)
}

export function getKindsByCategory(category: ArchComponentCategory): ArchComponentKindMeta[] {
  return ARCH_COMPONENT_KINDS.filter((meta) => meta.category === category)
}

/* -------------------------------------------------------------- connections */

export interface ArchConnectionKindMeta {
  kind: ArchConnectionKind
  label: string
  color: string
  /** Dashed lines read as asynchronous / indirect. */
  dashed: boolean
  async: boolean
  description: string
}

export const ARCH_CONNECTION_KINDS: ArchConnectionKindMeta[] = [
  { kind: 'https', label: 'HTTPS', color: '#10b981', dashed: false, async: false, description: 'Encrypted web request' },
  { kind: 'http', label: 'HTTP', color: '#f59e0b', dashed: false, async: false, description: 'Unencrypted web request' },
  { kind: 'rest', label: 'REST', color: '#0ea5e9', dashed: false, async: false, description: 'RESTful API call' },
  { kind: 'graphql', label: 'GraphQL', color: '#ec4899', dashed: false, async: false, description: 'GraphQL query' },
  { kind: 'grpc', label: 'gRPC', color: '#6366f1', dashed: false, async: false, description: 'Binary RPC' },
  { kind: 'websocket', label: 'WebSocket', color: '#a855f7', dashed: false, async: true, description: 'Persistent duplex channel' },
  { kind: 'tcp', label: 'TCP', color: '#64748b', dashed: false, async: false, description: 'Raw socket' },
  { kind: 'database', label: 'Database', color: '#10b981', dashed: false, async: false, description: 'Query connection' },
  { kind: 'event', label: 'Event', color: '#f97316', dashed: true, async: true, description: 'Published event' },
  { kind: 'message-queue', label: 'Message Queue', color: '#f97316', dashed: true, async: true, description: 'Queued message' },
  { kind: 'auth', label: 'Auth', color: '#ef4444', dashed: true, async: false, description: 'Identity / token exchange' },
  { kind: 'data-flow', label: 'Data Flow', color: '#0891b2', dashed: true, async: true, description: 'Bulk or streaming data' },
  { kind: 'dependency', label: 'Dependency', color: '#94a3b8', dashed: true, async: false, description: 'Build or runtime dependency' }
]

const CONNECTION_INDEX = new Map<ArchConnectionKind, ArchConnectionKindMeta>(
  ARCH_CONNECTION_KINDS.map((meta) => [meta.kind, meta])
)

export function getConnectionKindMeta(
  kindId: ArchConnectionKind
): ArchConnectionKindMeta | undefined {
  return CONNECTION_INDEX.get(kindId)
}

/* ------------------------------------------------------------------- views */

export interface ArchViewMeta {
  id: ArchViewId
  label: string
  description: string
  /** Categories included in this projection; empty means everything. */
  categories: ArchComponentCategory[]
}

export const ARCH_VIEWS: ArchViewMeta[] = [
  { id: 'system-context', label: 'System Context', description: 'The system and everything it talks to', categories: [] },
  { id: 'container', label: 'Container', description: 'Deployable units and stores', categories: [] },
  { id: 'component', label: 'Component', description: 'Internal building blocks', categories: [] },
  { id: 'application', label: 'Application', description: 'Client applications and their entry points', categories: ['application', 'backend'] },
  { id: 'backend', label: 'Backend', description: 'Services, workers and gateways', categories: ['backend', 'database'] },
  { id: 'database', label: 'Database', description: 'Stores, caches and indexes', categories: ['database', 'backend'] },
  { id: 'api', label: 'API', description: 'Endpoints exposed by each service', categories: ['backend', 'application'] },
  { id: 'data-flow', label: 'Data Flow', description: 'How data moves through the system', categories: [] },
  { id: 'infrastructure', label: 'Infrastructure', description: 'Hosts, networks and orchestration', categories: ['infrastructure', 'backend'] },
  { id: 'deployment', label: 'Deployment', description: 'What runs where', categories: ['infrastructure', 'backend', 'application'] },
  { id: 'security', label: 'Security', description: 'Trust boundaries and identity', categories: [] },
  { id: 'cloud', label: 'Cloud', description: 'Managed cloud services', categories: ['infrastructure', 'ai', 'integration'] },
  { id: 'integration', label: 'Integration', description: 'Third-party connections', categories: ['integration', 'backend'] },
  { id: 'sequence', label: 'Sequence', description: 'Ordered interactions for a scenario', categories: [] },
  { id: 'er', label: 'Entity Relationship', description: 'Data entities and relations', categories: ['database'] }
]

/* ---------------------------------------------------------------- sections */

export interface ArchSectionMeta {
  id: ArchSectionId
  label: string
  icon: string
  description: string
  /** Sections that render the diagram canvas rather than a structured editor. */
  canvas: boolean
}

export const ARCH_SECTIONS: ArchSectionMeta[] = [
  { id: 'overview', label: 'Overview', icon: 'LayoutDashboard', description: 'Summary and health', canvas: false },
  { id: 'requirements', label: 'Requirements', icon: 'FileText', description: 'What the system must do', canvas: false },
  { id: 'ai-architect', label: 'AI Architect', icon: 'Sparkles', description: 'Design from linked documents', canvas: false },
  { id: 'architecture', label: 'Diagram', icon: 'Network', description: 'Main diagram canvas', canvas: true },
  { id: 'components', label: 'Components', icon: 'Boxes', description: 'Every building block', canvas: false },
  { id: 'services', label: 'Services', icon: 'Server', description: 'Backend services and workers', canvas: false },
  { id: 'data-flow', label: 'Data Flow', icon: 'GitBranch', description: 'How data moves', canvas: true },
  { id: 'api', label: 'API', icon: 'Braces', description: 'Endpoints by service', canvas: false },
  { id: 'database', label: 'Database', icon: 'Database', description: 'Stores and caches', canvas: false },
  { id: 'integrations', label: 'Integrations', icon: 'Plug', description: 'Third-party services', canvas: false },
  { id: 'security', label: 'Security', icon: 'ShieldCheck', description: 'Auth and trust boundaries', canvas: false },
  { id: 'infrastructure', label: 'Infrastructure', icon: 'Cloud', description: 'Hosting and networking', canvas: true },
  { id: 'deployment', label: 'Deployment', icon: 'Rocket', description: 'What runs where', canvas: true },
  { id: 'environments', label: 'Environments', icon: 'Layers', description: 'Dev, staging, production', canvas: false },
  { id: 'validation', label: 'Validation', icon: 'ShieldAlert', description: 'Issues and health score', canvas: false },
  { id: 'documentation', label: 'Docs', icon: 'BookOpen', description: 'Generated architecture docs', canvas: false },
  { id: 'versions', label: 'Versions', icon: 'History', description: 'History and diff', canvas: false }
]

/** Grouped left-rail navigation — keeps the full section catalog but shows a calmer primary path. */
export interface ArchNavGroup {
  id: string
  label: string
  sections: ArchSectionId[]
  /** Collapsed by default; used for advanced / upcoming sections. */
  collapsible?: boolean
}

export const ARCH_NAV_GROUPS: ArchNavGroup[] = [
  {
    id: 'design',
    label: 'Design',
    sections: ['overview', 'architecture', 'components', 'data-flow']
  },
  {
    id: 'details',
    label: 'Details',
    sections: ['api', 'security', 'environments']
  },
  {
    id: 'tools',
    label: 'Tools',
    sections: ['ai-architect', 'requirements', 'documentation']
  },
  {
    id: 'more',
    label: 'More',
    collapsible: true,
    sections: [
      'services',
      'database',
      'integrations',
      'infrastructure',
      'deployment',
      'validation',
      'versions'
    ]
  }
]

/** Views shown in the toolbar; the rest remain available via the full list. */
export const PRIMARY_ARCH_VIEWS: ArchViewId[] = [
  'system-context',
  'container',
  'component',
  'application',
  'backend',
  'database',
  'infrastructure',
  'integration'
]

/** Common system types for the create menu; the rest live under "More types". */
export const PRIMARY_ARCH_SYSTEM_TYPES = [
  'web',
  'saas',
  'microservices',
  'mobile',
  'ai',
  'hybrid'
] as const

/** System types offered when creating an architecture. */
export const ARCH_SYSTEM_TYPES = [
  { id: 'web', label: 'Web Application', description: 'Browser-first product' },
  { id: 'mobile', label: 'Mobile Application', description: 'iOS and Android clients' },
  { id: 'desktop', label: 'Desktop Application', description: 'Installed desktop software' },
  { id: 'saas', label: 'SaaS Platform', description: 'Multi-tenant subscription product' },
  { id: 'microservices', label: 'Microservices', description: 'Independently deployable services' },
  { id: 'monolith', label: 'Monolithic Application', description: 'Single deployable unit' },
  { id: 'serverless', label: 'Serverless System', description: 'Function-based compute' },
  { id: 'rest-api', label: 'REST API', description: 'HTTP API product' },
  { id: 'graphql', label: 'GraphQL System', description: 'Schema-first API' },
  { id: 'event-driven', label: 'Event-driven System', description: 'Message and event based' },
  { id: 'cloud', label: 'Cloud Infrastructure', description: 'Infrastructure-centric design' },
  { id: 'ai', label: 'AI Application', description: 'Model and pipeline centric' },
  { id: 'hybrid', label: 'Hybrid System', description: 'Mix of the above' }
] as const
