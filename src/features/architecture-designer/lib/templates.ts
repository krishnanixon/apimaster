/**
 * Starter architectures. Each template is expressed as actions rather than a
 * literal model so it flows through the same reducer as everything else —
 * ids are generated fresh on every use and a template is undoable like any
 * other change.
 */

import type { ArchComponentKind, ArchConnectionKind, ArchitectureModel } from '@shared/types/architecture'
import { applyActions, createEmptyModel } from '@shared/lib/architecture-model'
import type { ArchitectureAction } from '@shared/types/architecture'

export interface ArchTemplate {
  id: string
  title: string
  description: string
  systemType: string
  /** Component names in creation order, used to resolve connection endpoints. */
  build: () => ArchitectureModel
}

interface Spec {
  name: string
  kind: ArchComponentKind
  technology?: string
  responsibilities?: string[]
}

type Link = [from: number, to: number, kind: ArchConnectionKind, label?: string]

/**
 * Builds a model from a flat component list plus index-based links, which keeps
 * template definitions readable.
 */
function assemble(name: string, systemType: string, specs: Spec[], links: Link[]): ArchitectureModel {
  const base = createEmptyModel(name, systemType)
  const addActions: ArchitectureAction[] = specs.map((spec) => ({
    type: 'ADD_COMPONENT',
    component: {
      name: spec.name,
      kind: spec.kind,
      technology: spec.technology,
      responsibilities: spec.responsibilities ?? []
    }
  }))

  const withComponents = applyActions(base, addActions)
  const ids = withComponents.components.map((component) => component.id)

  const linkActions: ArchitectureAction[] = links
    .filter(([from, to]) => ids[from] && ids[to])
    .map(([from, to, kind, label]) => ({
      type: 'CONNECT_COMPONENTS',
      connection: { from: ids[from], to: ids[to], kind, label: label ?? '' }
    }))

  return applyActions(withComponents, linkActions)
}

export const ARCH_TEMPLATES: ArchTemplate[] = [
  {
    id: 'mern',
    title: 'MERN Application',
    description: 'React client, Express API and MongoDB',
    systemType: 'web',
    build: () =>
      assemble(
        'MERN Application',
        'web',
        [
          { name: 'React Client', kind: 'web-app', technology: 'React' },
          { name: 'Express API', kind: 'backend-service', technology: 'Node.js / Express' },
          { name: 'MongoDB', kind: 'mongodb', technology: 'MongoDB' }
        ],
        [
          [0, 1, 'https', 'REST'],
          [1, 2, 'database', 'Queries']
        ]
      )
  },
  {
    id: 'nextjs',
    title: 'Next.js Application',
    description: 'Full-stack Next.js with PostgreSQL and edge caching',
    systemType: 'web',
    build: () =>
      assemble(
        'Next.js Application',
        'web',
        [
          { name: 'Next.js App', kind: 'web-app', technology: 'Next.js' },
          { name: 'CDN', kind: 'cdn', technology: 'Vercel Edge' },
          { name: 'Route Handlers', kind: 'backend-service', technology: 'Next.js API' },
          { name: 'PostgreSQL', kind: 'postgresql', technology: 'PostgreSQL' },
          { name: 'Auth Provider', kind: 'auth-provider', technology: 'NextAuth' }
        ],
        [
          [1, 0, 'https', 'Static assets'],
          [0, 2, 'https', 'Server actions'],
          [2, 3, 'database', 'Queries'],
          [0, 4, 'auth', 'Sign in']
        ]
      )
  },
  {
    id: 'saas',
    title: 'SaaS Platform',
    description: 'Multi-tenant SaaS with billing, cache and background work',
    systemType: 'saas',
    build: () =>
      assemble(
        'SaaS Platform',
        'saas',
        [
          { name: 'Web App', kind: 'web-app', technology: 'React' },
          { name: 'Admin Panel', kind: 'admin-panel', technology: 'React' },
          { name: 'API Gateway', kind: 'api-gateway', technology: 'Kong' },
          { name: 'Core Service', kind: 'backend-service', technology: 'Node.js' },
          { name: 'Billing Service', kind: 'microservice', technology: 'Node.js' },
          { name: 'Worker', kind: 'worker', technology: 'BullMQ' },
          { name: 'PostgreSQL', kind: 'postgresql', technology: 'PostgreSQL' },
          { name: 'Redis', kind: 'redis', technology: 'Redis' },
          { name: 'Stripe', kind: 'payment-gateway', technology: 'Stripe' },
          { name: 'Email Service', kind: 'email-service', technology: 'SendGrid' }
        ],
        [
          [0, 2, 'https', 'API calls'],
          [1, 2, 'https', 'Admin API'],
          [2, 3, 'rest', 'Route'],
          [2, 4, 'rest', 'Route'],
          [3, 6, 'database', 'Queries'],
          [4, 6, 'database', 'Queries'],
          [3, 7, 'tcp', 'Cache'],
          [3, 5, 'message-queue', 'Enqueue'],
          [4, 8, 'https', 'Charges'],
          [5, 9, 'https', 'Send mail']
        ]
      )
  },
  {
    id: 'microservices',
    title: 'Microservices',
    description: 'Gateway, independent services and an event bus',
    systemType: 'microservices',
    build: () =>
      assemble(
        'Microservices Platform',
        'microservices',
        [
          { name: 'Client App', kind: 'web-app', technology: 'React' },
          { name: 'API Gateway', kind: 'api-gateway', technology: 'Kong' },
          { name: 'Auth Service', kind: 'microservice', technology: 'Node.js' },
          { name: 'User Service', kind: 'microservice', technology: 'Node.js' },
          { name: 'Order Service', kind: 'microservice', technology: 'Go' },
          { name: 'Event Bus', kind: 'queue', technology: 'Kafka' },
          { name: 'PostgreSQL', kind: 'postgresql', technology: 'PostgreSQL' },
          { name: 'Redis', kind: 'redis', technology: 'Redis' }
        ],
        [
          [0, 1, 'https', 'Requests'],
          [1, 2, 'grpc', 'Verify token'],
          [1, 3, 'grpc', 'Route'],
          [1, 4, 'grpc', 'Route'],
          [3, 6, 'database', 'Queries'],
          [4, 6, 'database', 'Queries'],
          [2, 7, 'tcp', 'Sessions'],
          [4, 5, 'event', 'OrderPlaced'],
          [3, 5, 'event', 'Subscribe']
        ]
      )
  },
  {
    id: 'rag',
    title: 'RAG Application',
    description: 'Retrieval augmented generation over a vector store',
    systemType: 'ai',
    build: () =>
      assemble(
        'RAG Application',
        'ai',
        [
          { name: 'Chat UI', kind: 'web-app', technology: 'React' },
          { name: 'RAG API', kind: 'backend-service', technology: 'FastAPI' },
          { name: 'Ingestion Worker', kind: 'worker', technology: 'Python' },
          { name: 'Embedding Model', kind: 'embedding-model', technology: 'text-embedding-3' },
          { name: 'Vector Store', kind: 'vector-db', technology: 'pgvector' },
          { name: 'LLM', kind: 'llm', technology: 'GPT-4o' },
          { name: 'Object Storage', kind: 'object-storage', technology: 'AWS S3' }
        ],
        [
          [0, 1, 'https', 'Ask'],
          [1, 4, 'database', 'Similarity search'],
          [1, 5, 'https', 'Completion'],
          [2, 6, 'https', 'Read documents'],
          [2, 3, 'https', 'Embed'],
          [3, 4, 'data-flow', 'Upsert vectors']
        ]
      )
  },
  {
    id: 'mobile-backend',
    title: 'Mobile Backend',
    description: 'Mobile clients with push notifications and object storage',
    systemType: 'mobile',
    build: () =>
      assemble(
        'Mobile Backend',
        'mobile',
        [
          { name: 'iOS / Android App', kind: 'mobile-app', technology: 'React Native' },
          { name: 'API Gateway', kind: 'api-gateway', technology: 'AWS API Gateway' },
          { name: 'Backend Service', kind: 'backend-service', technology: 'Node.js' },
          { name: 'PostgreSQL', kind: 'postgresql', technology: 'PostgreSQL' },
          { name: 'Object Storage', kind: 'object-storage', technology: 'AWS S3' },
          { name: 'Push Notifications', kind: 'notification-service', technology: 'Firebase' },
          { name: 'Auth Provider', kind: 'auth-provider', technology: 'Cognito' }
        ],
        [
          [0, 1, 'https', 'API calls'],
          [1, 2, 'rest', 'Route'],
          [2, 3, 'database', 'Queries'],
          [2, 4, 'https', 'Uploads'],
          [2, 5, 'event', 'Notify'],
          [0, 6, 'auth', 'Sign in']
        ]
      )
  },
  {
    id: 'serverless',
    title: 'Serverless Application',
    description: 'Function-based compute with managed data services',
    systemType: 'serverless',
    build: () =>
      assemble(
        'Serverless Application',
        'serverless',
        [
          { name: 'Web Client', kind: 'web-app', technology: 'React' },
          { name: 'CDN', kind: 'cdn', technology: 'CloudFront' },
          { name: 'API Gateway', kind: 'api-gateway', technology: 'AWS API Gateway' },
          { name: 'Handler Functions', kind: 'serverless-function', technology: 'AWS Lambda' },
          { name: 'Queue', kind: 'queue', technology: 'SQS' },
          { name: 'Async Worker', kind: 'serverless-function', technology: 'AWS Lambda' },
          { name: 'PostgreSQL', kind: 'postgresql', technology: 'Aurora Serverless' }
        ],
        [
          [1, 0, 'https', 'Assets'],
          [0, 2, 'https', 'API calls'],
          [2, 3, 'rest', 'Invoke'],
          [3, 6, 'database', 'Queries'],
          [3, 4, 'message-queue', 'Enqueue'],
          [4, 5, 'message-queue', 'Consume'],
          [5, 6, 'database', 'Queries']
        ]
      )
  },
  {
    id: 'ecommerce',
    title: 'E-commerce',
    description: 'Storefront, catalog, checkout and search',
    systemType: 'saas',
    build: () =>
      assemble(
        'E-commerce Platform',
        'saas',
        [
          { name: 'Storefront', kind: 'web-app', technology: 'Next.js' },
          { name: 'Admin Panel', kind: 'admin-panel', technology: 'React' },
          { name: 'API Gateway', kind: 'api-gateway', technology: 'Kong' },
          { name: 'Catalog Service', kind: 'microservice', technology: 'Node.js' },
          { name: 'Order Service', kind: 'microservice', technology: 'Node.js' },
          { name: 'Search', kind: 'elasticsearch', technology: 'Elasticsearch' },
          { name: 'PostgreSQL', kind: 'postgresql', technology: 'PostgreSQL' },
          { name: 'Redis', kind: 'redis', technology: 'Redis' },
          { name: 'Payment Gateway', kind: 'payment-gateway', technology: 'Stripe' }
        ],
        [
          [0, 2, 'https', 'Browse'],
          [1, 2, 'https', 'Manage'],
          [2, 3, 'rest', 'Catalog'],
          [2, 4, 'rest', 'Orders'],
          [3, 5, 'https', 'Index'],
          [3, 6, 'database', 'Queries'],
          [4, 6, 'database', 'Queries'],
          [3, 7, 'tcp', 'Cache'],
          [4, 8, 'https', 'Charge']
        ]
      )
  },
  {
    id: 'healthcare',
    title: 'Healthcare Platform',
    description: 'Admin web, patient and care partner apps with video calling',
    systemType: 'saas',
    build: () =>
      assemble(
        'Healthcare Platform',
        'saas',
        [
          { name: 'Super Admin Web', kind: 'admin-panel', technology: 'React' },
          { name: 'Care Partner App', kind: 'mobile-app', technology: 'React Native' },
          { name: 'Patient App', kind: 'mobile-app', technology: 'React Native' },
          { name: 'API Gateway', kind: 'api-gateway', technology: 'Kong' },
          { name: 'Backend API', kind: 'backend-service', technology: 'Node.js' },
          { name: 'PostgreSQL', kind: 'postgresql', technology: 'PostgreSQL' },
          { name: 'Auth Provider', kind: 'auth-provider', technology: 'Auth0' },
          { name: 'Payment Gateway', kind: 'payment-gateway', technology: 'Razorpay' },
          { name: 'Notifications', kind: 'notification-service', technology: 'Firebase' },
          { name: 'Video Calling', kind: 'third-party-api', technology: 'LiveKit' }
        ],
        [
          [0, 3, 'https', 'Admin API'],
          [1, 3, 'https', 'Mobile API'],
          [2, 3, 'https', 'Mobile API'],
          [3, 4, 'rest', 'Route'],
          [4, 5, 'database', 'Queries'],
          [3, 6, 'auth', 'Verify token'],
          [4, 7, 'https', 'Payments'],
          [4, 8, 'event', 'Push'],
          [1, 9, 'websocket', 'Video session'],
          [2, 9, 'websocket', 'Video session']
        ]
      )
  },
  {
    id: 'realtime',
    title: 'Real-time Application',
    description: 'WebSocket fan-out with presence and pub/sub',
    systemType: 'event-driven',
    build: () =>
      assemble(
        'Real-time Application',
        'event-driven',
        [
          { name: 'Web Client', kind: 'web-app', technology: 'React' },
          { name: 'Load Balancer', kind: 'load-balancer', technology: 'NGINX' },
          { name: 'Realtime Gateway', kind: 'backend-service', technology: 'Socket.IO' },
          { name: 'Pub/Sub', kind: 'redis', technology: 'Redis Pub/Sub' },
          { name: 'API Service', kind: 'backend-service', technology: 'Node.js' },
          { name: 'PostgreSQL', kind: 'postgresql', technology: 'PostgreSQL' }
        ],
        [
          [0, 1, 'https', 'Connect'],
          [1, 2, 'websocket', 'Upgrade'],
          [2, 3, 'event', 'Publish'],
          [3, 2, 'event', 'Fan-out'],
          [0, 4, 'https', 'REST'],
          [4, 5, 'database', 'Queries']
        ]
      )
  }
]
