/**
 * MCP tool catalog for the Claude integration.
 *
 * The main process registers these with the MCP server (zod schemas become the
 * JSON Schema Claude sees); the renderer implements them against the live
 * Shurikly store and only imports the inferred argument types.
 */
import { z } from 'zod'

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const
const BODY_TYPES = ['none', 'json', 'text', 'form-data', 'x-www-form-urlencoded'] as const
const AUTH_TYPES = [
  'inherit',
  'none',
  'apiKey',
  'bearer',
  'jwt',
  'basic',
  'digest',
  'oauth1',
  'oauth2',
  'aws',
  'hawk'
] as const

/** Placeholder Claude sees instead of secret values; sending it back keeps the stored value. */
export const MCP_REDACTED = '[REDACTED]'

const id = (what: string) => z.string().min(1).describe(`${what} id`)

const keyValue = z.object({
  key: z.string(),
  value: z.string(),
  enabled: z.boolean().optional().describe('Defaults to true'),
  description: z.string().optional()
})

const keyValueList = (what: string) =>
  z.array(keyValue).max(1_000).describe(`${what}. Replaces the whole list when provided.`)

const body = z
  .object({
    type: z.enum(BODY_TYPES),
    content: z
      .string()
      .optional()
      .describe('Raw body for json/text. For x-www-form-urlencoded use one key=value pair per line.'),
    formData: z
      .array(z.object({ key: z.string(), value: z.string(), enabled: z.boolean().optional() }))
      .optional()
      .describe('Text fields for form-data bodies')
  })
  .describe('Request body')

const auth = z
  .object({
    type: z
      .enum(AUTH_TYPES)
      .describe("'inherit' uses the parent folder/collection auth; 'none' sends no auth"),
    bearerToken: z.string().optional(),
    basicUsername: z.string().optional(),
    basicPassword: z.string().optional(),
    apiKeyName: z.string().optional(),
    apiKeyValue: z.string().optional(),
    apiKeyLocation: z.enum(['header', 'query']).optional(),
    jwtAlgorithm: z.enum(['HS256', 'HS384', 'HS512']).optional(),
    jwtSecret: z.string().optional(),
    jwtPayload: z.string().optional().describe('JSON payload'),
    jwtHeader: z.string().optional().describe('JSON header overrides'),
    jwtAddTo: z.enum(['header', 'query']).optional(),
    jwtQueryParam: z.string().optional(),
    digestUsername: z.string().optional(),
    digestPassword: z.string().optional(),
    digestRealm: z.string().optional(),
    oauth1ConsumerKey: z.string().optional(),
    oauth1ConsumerSecret: z.string().optional(),
    oauth1Token: z.string().optional(),
    oauth1TokenSecret: z.string().optional(),
    oauth1SignatureMethod: z.enum(['HMAC-SHA1', 'HMAC-SHA256', 'PLAINTEXT']).optional(),
    oauth1Realm: z.string().optional(),
    oauth1Version: z.string().optional(),
    oauth2GrantType: z.enum(['authorization_code', 'client_credentials', 'password']).optional(),
    oauth2AuthUrl: z.string().optional(),
    oauth2TokenUrl: z.string().optional(),
    oauth2ClientId: z.string().optional(),
    oauth2ClientSecret: z.string().optional(),
    oauth2Scope: z.string().optional(),
    oauth2RedirectUri: z.string().optional(),
    oauth2Username: z.string().optional(),
    oauth2Password: z.string().optional(),
    oauth2AccessToken: z.string().optional(),
    oauth2RefreshToken: z.string().optional(),
    awsAccessKey: z.string().optional(),
    awsSecretKey: z.string().optional(),
    awsRegion: z.string().optional(),
    awsService: z.string().optional(),
    awsSessionToken: z.string().optional(),
    hawkId: z.string().optional(),
    hawkKey: z.string().optional(),
    hawkAlgorithm: z.enum(['sha256', 'sha1']).optional(),
    hawkUser: z.string().optional(),
    hawkNonce: z.string().optional(),
    hawkExt: z.string().optional(),
    hawkApp: z.string().optional()
  })
  .describe(
    `Authorization. Values may use {{variables}}. Fields shown as "${MCP_REDACTED}" keep their stored value when sent back unchanged.`
  )

/** Editable request fields shared by create_request, update_request and ad-hoc send_request. */
const requestFields = {
  name: z.string().min(1).max(500),
  method: z.enum(HTTP_METHODS),
  url: z
    .string()
    .max(32_768)
    .describe(
      'Request URL. May contain {{variables}} and path params like :id or {id}. A ?query string is moved into queryParams.'
    ),
  headers: keyValueList('Request headers'),
  queryParams: keyValueList('Query parameters'),
  pathParams: keyValueList('Values for :id / {id} tokens in the URL path'),
  body,
  auth,
  tests: z
    .string()
    .max(200_000)
    .describe(
      'Test script run after the response. API: pm.test(name, fn), pm.expect(x).to.equal(y), pm.expect(x).to.be.ok(), pm.response.status/ok/headers/responseTime/text()/json(), pm.request.method/url.'
    ),
  preRequestScript: z
    .string()
    .max(200_000)
    .describe('Script run before sending. API: pm.environment.get/set/unset(key[, value]).'),
  description: z.string().max(200_000).describe('Markdown notes for the request'),
  requestType: z.enum(['http', 'websocket', 'graphql']),
  graphql: z
    .object({
      query: z.string().max(500_000),
      variables: z.string().max(500_000).optional().describe('JSON object text'),
      operationName: z.string().max(500).optional()
    })
    .optional()
    .describe('Required fields when requestType is graphql. Execution sends a JSON POST body.'),
  timeoutMs: z.number().int().min(100).max(3_600_000)
}

const parentSettings = {
  auth: auth.optional(),
  headers: keyValueList('Headers merged into every child request (child keys win)').optional(),
  preRequestScript: z
    .string()
    .max(200_000)
    .optional()
    .describe('Runs before every child request, before folder/request scripts')
}

const environmentVariable = z.object({
  key: z.string().min(1),
  value: z.string(),
  enabled: z.boolean().optional().describe('Defaults to true')
})

const maxBodyChars = z
  .number()
  .int()
  .min(0)
  .max(500_000)
  .optional()
  .describe('Truncate the response body to this many characters (default 20000)')

interface ToolAnnotations {
  readOnlyHint?: boolean
  destructiveHint?: boolean
  idempotentHint?: boolean
  openWorldHint?: boolean
}

export interface McpToolSpec<S extends z.ZodRawShape = z.ZodRawShape> {
  title: string
  description: string
  input: S
  annotations: ToolAnnotations
}

function tool<S extends z.ZodRawShape>(spec: McpToolSpec<S>): McpToolSpec<S> {
  return spec
}

const READ: ToolAnnotations = { readOnlyHint: true, openWorldHint: false }
const WRITE: ToolAnnotations = { readOnlyHint: false, destructiveHint: false, openWorldHint: false }
const DELETE: ToolAnnotations = { readOnlyHint: false, destructiveHint: true, openWorldHint: false }

export const MCP_TOOLS = {
  // ── Read ──────────────────────────────────────────────────────────────────
  list_collections: tool({
    title: 'List collections',
    description:
      'List every API collection with its id, description and request/folder counts, plus the active environment. Start here to discover ids.',
    input: {},
    annotations: READ
  }),
  get_collection: tool({
    title: 'Get collection',
    description:
      'Get one collection as a folder tree with request summaries (id, name, method, url) and the collection-level auth, headers and pre-request script.',
    input: { collectionId: id('Collection') },
    annotations: READ
  }),
  get_request: tool({
    title: 'Get request',
    description:
      'Get the full definition of a saved request: headers, params, body, auth (with where inherited auth comes from), scripts and notes.',
    input: { collectionId: id('Collection'), requestId: id('Request') },
    annotations: READ
  }),
  get_request_source: tool({
    title: 'Get request source code',
    description:
      'For a request the Code Scanner created: the server code that handles it (route definition and handler, with credentials redacted). Use it to explain a failing response or to fill in a body the handler expects. Only works when the user enabled "Share scanned source code" in Settings → MCP.',
    input: { collectionId: id('Collection'), requestId: id('Request') },
    annotations: READ
  }),
  search_requests: tool({
    title: 'Search requests',
    description: 'Find saved requests across all collections whose name, URL or notes contain the query.',
    input: {
      query: z.string().describe('Case-insensitive text to match; empty matches everything'),
      method: z.enum(HTTP_METHODS).optional(),
      limit: z.number().int().min(1).max(500).optional().describe('Default 50')
    },
    annotations: READ
  }),
  list_environments: tool({
    title: 'List environments',
    description:
      'List environments and their {{variables}}. The active environment is used when sending requests unless another is chosen.',
    input: {},
    annotations: READ
  }),
  list_history: tool({
    title: 'List request history',
    description: 'Recently sent requests (newest first) with status, timing and errors.',
    input: {
      limit: z.number().int().min(1).max(200).optional().describe('Default 20'),
      method: z.enum(HTTP_METHODS).optional(),
      failedOnly: z.boolean().optional().describe('Only errors and HTTP status >= 400')
    },
    annotations: READ
  }),
  get_active_tab: tool({
    title: 'Get active tab',
    description:
      'What the user is looking at in Shurikly right now: the active request draft (including unsaved edits), its last response and test results, and a list of other open tabs.',
    input: { maxBodyChars },
    annotations: READ
  }),
  export_collection: tool({
    title: 'Export collection',
    description: 'Export a collection as Postman v2.1 JSON or OpenAPI 3 YAML/JSON text.',
    input: {
      collectionId: id('Collection'),
      format: z.enum(['postman', 'openapi']).optional().describe("Default 'postman'")
    },
    annotations: READ
  }),
  generate_code_snippet: tool({
    title: 'Generate code snippet',
    description: 'Generate client code for a saved request (inherited auth and headers applied).',
    input: {
      collectionId: id('Collection'),
      requestId: id('Request'),
      language: z.enum(['curl', 'javascript', 'nodejs', 'python'])
    },
    annotations: READ
  }),

  // ── Write: collections & folders ──────────────────────────────────────────
  create_collection: tool({
    title: 'Create collection',
    description: 'Create a new collection. Optionally set auth/headers/pre-request script inherited by its requests.',
    input: {
      name: z.string().min(1).max(500),
      description: z.string().max(200_000).optional(),
      ...parentSettings
    },
    annotations: WRITE
  }),
  update_collection: tool({
    title: 'Update collection',
    description: 'Rename a collection or change its description, auth, headers or pre-request script. Omitted fields are unchanged.',
    input: {
      collectionId: id('Collection'),
      name: z.string().min(1).max(500).optional(),
      description: z.string().max(200_000).optional(),
      ...parentSettings
    },
    annotations: WRITE
  }),
  delete_collection: tool({
    title: 'Delete collection',
    description: 'Permanently delete a collection with all of its folders and requests.',
    input: { collectionId: id('Collection') },
    annotations: DELETE
  }),
  create_folder: tool({
    title: 'Create folder',
    description: 'Create a folder in a collection, optionally nested under another folder.',
    input: {
      collectionId: id('Collection'),
      name: z.string().min(1).max(500),
      parentFolderId: id('Parent folder').nullable().optional().describe('Omit or null for the collection root'),
      ...parentSettings
    },
    annotations: WRITE
  }),
  update_folder: tool({
    title: 'Update folder',
    description: 'Rename or move a folder, or change its auth, headers or pre-request script. Omitted fields are unchanged.',
    input: {
      collectionId: id('Collection'),
      folderId: id('Folder'),
      name: z.string().min(1).max(500).optional(),
      parentFolderId: id('Parent folder')
        .nullable()
        .optional()
        .describe('Move under this folder; null moves to the collection root'),
      ...parentSettings
    },
    annotations: WRITE
  }),
  delete_folder: tool({
    title: 'Delete folder',
    description:
      'Delete a folder and its sub-folders. Requests inside are kept and moved to the collection root.',
    input: { collectionId: id('Collection'), folderId: id('Folder') },
    annotations: DELETE
  }),

  // ── Write: requests ───────────────────────────────────────────────────────
  create_request: tool({
    title: 'Create request',
    description:
      'Save a new request in a collection. Auth defaults to inherit (from folder/collection). Returns the new request.',
    input: {
      collectionId: id('Collection'),
      folderId: id('Folder').nullable().optional().describe('Omit or null for the collection root'),
      ...requestFields,
      method: requestFields.method.optional().describe('Default GET'),
      headers: requestFields.headers.optional(),
      queryParams: requestFields.queryParams.optional(),
      pathParams: requestFields.pathParams.optional(),
      body: requestFields.body.optional(),
      auth: requestFields.auth.optional(),
      tests: requestFields.tests.optional(),
      preRequestScript: requestFields.preRequestScript.optional(),
      description: requestFields.description.optional(),
      requestType: requestFields.requestType.optional(),
      timeoutMs: requestFields.timeoutMs.optional(),
      openInApp: z.boolean().optional().describe('Also open the request in a tab so the user sees it')
    },
    annotations: WRITE
  }),
  update_request: tool({
    title: 'Update request',
    description:
      'Edit a saved request. Only the provided fields change; list fields (headers, queryParams, pathParams) are replaced as a whole. Set folderId to move it within the collection.',
    input: {
      collectionId: id('Collection'),
      requestId: id('Request'),
      folderId: id('Folder').nullable().optional().describe('Move to this folder; null moves to the collection root'),
      name: requestFields.name.optional(),
      method: requestFields.method.optional(),
      url: requestFields.url.optional(),
      headers: requestFields.headers.optional(),
      queryParams: requestFields.queryParams.optional(),
      pathParams: requestFields.pathParams.optional(),
      body: requestFields.body.optional(),
      auth: requestFields.auth.optional(),
      tests: requestFields.tests.optional(),
      preRequestScript: requestFields.preRequestScript.optional(),
      description: requestFields.description.optional(),
      requestType: requestFields.requestType.optional(),
      graphql: requestFields.graphql,
      timeoutMs: requestFields.timeoutMs.optional()
    },
    annotations: WRITE
  }),
  delete_request: tool({
    title: 'Delete request',
    description: 'Permanently delete a saved request.',
    input: { collectionId: id('Collection'), requestId: id('Request') },
    annotations: DELETE
  }),

  // ── Write: environments ───────────────────────────────────────────────────
  create_environment: tool({
    title: 'Create environment',
    description: 'Create an environment (e.g. Local, Staging) with {{variables}}.',
    input: {
      name: z.string().min(1).max(500),
      variables: z.array(environmentVariable).max(1_000).optional(),
      activate: z.boolean().optional().describe('Make it the active environment')
    },
    annotations: WRITE
  }),
  update_environment: tool({
    title: 'Update environment',
    description:
      'Rename an environment, upsert variables by key, or remove variables. Variables not mentioned are left unchanged.',
    input: {
      environmentId: id('Environment'),
      name: z.string().min(1).max(500).optional(),
      set: z.array(environmentVariable).max(1_000).optional().describe('Add or update these variables (matched by key)'),
      remove: z.array(z.string()).max(1_000).optional().describe('Variable keys to delete')
    },
    annotations: WRITE
  }),
  delete_environment: tool({
    title: 'Delete environment',
    description: 'Permanently delete an environment and its variables.',
    input: { environmentId: id('Environment') },
    annotations: DELETE
  }),
  set_active_environment: tool({
    title: 'Set active environment',
    description: 'Choose which environment supplies {{variables}} in the app, or null for none.',
    input: { environmentId: id('Environment').nullable() },
    annotations: { ...WRITE, idempotentHint: true }
  }),

  // ── Import ────────────────────────────────────────────────────────────────
  import_collection: tool({
    title: 'Import collection',
    description: 'Import a Postman v2.0/v2.1 collection from its JSON text as a new collection.',
    input: { json: z.string().min(2).max(20_000_000).describe('Postman collection JSON') },
    annotations: WRITE
  }),
  import_curl: tool({
    title: 'Import cURL',
    description:
      'Turn a cURL command into a request. With collectionId it is saved into the collection; otherwise it opens as an unsaved tab.',
    input: {
      curl: z.string().min(4).max(1_000_000),
      collectionId: id('Collection').optional(),
      folderId: id('Folder').nullable().optional(),
      name: z.string().min(1).max(500).optional()
    },
    annotations: WRITE
  }),

  // ── Execute ───────────────────────────────────────────────────────────────
  send_request: tool({
    title: 'Send request',
    description:
      'Send an HTTP request through Shurikly and return the response. Either pass collectionId + requestId to send a saved request, or pass `request` for an ad-hoc call (add collectionId to inherit that collection\'s auth/headers). Environment variables, pre-request scripts and tests run exactly as in the app, and the call is added to history.',
    input: {
      collectionId: id('Collection').optional(),
      requestId: id('Request').optional().describe('Saved request to send (requires collectionId)'),
      request: z
        .object({
          ...requestFields,
          name: requestFields.name.optional(),
          method: requestFields.method.optional().describe('Default GET'),
          headers: requestFields.headers.optional(),
          queryParams: requestFields.queryParams.optional(),
          pathParams: requestFields.pathParams.optional(),
          body: requestFields.body.optional(),
          auth: requestFields.auth.optional(),
          tests: requestFields.tests.optional(),
          preRequestScript: requestFields.preRequestScript.optional(),
          description: requestFields.description.optional(),
          requestType: requestFields.requestType.optional(),
          timeoutMs: requestFields.timeoutMs.optional()
        })
        .optional()
        .describe('Ad-hoc request definition (instead of requestId)'),
      environmentId: id('Environment')
        .nullable()
        .optional()
        .describe('Environment for {{variables}}. Omit to use the active one, null for none.'),
      variables: z
        .record(z.string(), z.string())
        .optional()
        .describe('Extra one-off variables that override the environment'),
      maxBodyChars
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true }
  }),
  run_collection: tool({
    title: 'Run collection',
    description:
      'Run every request in a collection (or one folder, including sub-folders) in order, with tests, and return a pass/fail report.',
    input: {
      collectionId: id('Collection'),
      folderId: id('Folder').optional(),
      environmentId: id('Environment')
        .nullable()
        .optional()
        .describe('Omit to use the active environment, null for none'),
      stopOnFail: z.boolean().optional(),
      delayMs: z.number().int().min(0).max(60_000).optional().describe('Pause between requests')
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true }
  }),

  // ── UI ────────────────────────────────────────────────────────────────────
  open_request: tool({
    title: 'Open request in app',
    description: 'Open a saved request in a Shurikly tab and bring it into view for the user.',
    input: { collectionId: id('Collection'), requestId: id('Request') },
    annotations: { ...WRITE, idempotentHint: true }
  })
} as const

export type McpToolName = keyof typeof MCP_TOOLS

export type McpToolArgs<N extends McpToolName> = z.infer<z.ZodObject<(typeof MCP_TOOLS)[N]['input']>>

export const MCP_TOOL_NAMES = Object.keys(MCP_TOOLS) as McpToolName[]

export function isMcpToolName(value: unknown): value is McpToolName {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(MCP_TOOLS, value)
}

export const MCP_SERVER_INSTRUCTIONS = `Shurikly is a local API client (like Postman). These tools read and edit the user's live workspace; changes appear in the app immediately.

- Workspace model: collections contain folders (nestable) and saved requests. Environments hold {{variables}} used in URLs, headers, bodies and auth.
- Auth and headers inherit: a request with auth.type "inherit" uses its nearest folder's auth, then the collection's. Collection/folder headers merge into every child request.
- Discover ids with list_collections, get_collection or search_requests before editing. Use get_active_tab to see what the user has open.
- Prefer {{variables}} over hard-coded hosts and secrets; put shared values in an environment.
- Secret values may be shown as "${MCP_REDACTED}". Sending that placeholder back keeps the stored secret. send_request always uses the real values.
- Requests created by the Code Scanner know where their route is defined: get_request_source returns that code (if the user allowed it), which helps explain errors.
- send_request and run_collection make real network calls to the target API. Be careful with non-GET requests against production.`
