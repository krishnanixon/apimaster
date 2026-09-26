import type { DbAiRequest, DbAiSchemaSnapshot } from '@shared/types/database-workspace'
import { dbWorkspaceService } from './db-workspace.service'
import { aiRouter } from '../ai'
import { dbWorkspaceRepository } from '../repositories/db-workspace.repository'
import { logger } from '../infra/logger.service'

const ACTION_PROMPTS: Record<string, string> = {
  explain_schema: 'Explain this database schema in clear business and technical terms.',
  explain_table: 'Explain this table, its columns, relationships, and typical usage.',
  explain_relationships: 'Explain the relationships between tables in this schema.',
  generate_documentation: 'Generate comprehensive database documentation in Markdown.',
  generate_er_diagram: 'Describe an ER diagram layout for this schema (tables and relationships).',
  generate_prisma: 'Generate a Prisma schema for this database.',
  generate_sequelize: 'Generate Sequelize model definitions.',
  generate_drizzle: 'Generate Drizzle ORM schema.',
  generate_typeorm: 'Generate TypeORM entity classes.',
  generate_dtos: 'Generate TypeScript DTOs for the main tables.',
  generate_crud: 'Generate CRUD service code for the primary tables.',
  generate_rest_api: 'Generate REST API endpoints for this schema.',
  generate_graphql: 'Generate GraphQL types and resolvers.',
  generate_openapi: 'Generate OpenAPI 3 specification.',
  generate_test_data: 'Generate realistic test data INSERT statements.',
  generate_seed: 'Generate seed scripts for development.',
  generate_migration: 'Suggest migration SQL for schema improvements.',
  suggest_normalization: 'Analyze normalization and suggest improvements.',
  find_duplicate_columns: 'Find duplicate or redundant columns across tables.',
  find_missing_indexes: 'Suggest missing indexes for query performance.',
  find_orphan_tables: 'Identify orphan or unused tables.',
  suggest_constraints: 'Suggest missing constraints (FK, unique, check).',
  explain_query: 'Explain what this SQL query does step by step.',
  optimize_query: 'Suggest optimizations for this SQL query.',
  explain_plan: 'Explain the execution plan implications.',
  business_description: 'Describe the business domain modeled by this database.',
  detect_security: 'Identify potential security issues in schema and access patterns.',
  detect_performance: 'Identify performance bottlenecks in schema design.',
  suggest_caching: 'Suggest caching strategies for this schema.',
  generate_markdown: 'Generate Markdown documentation for tables and columns.',
  natural_language: 'Answer the user question about this database, including any selected rows or live query results provided.'
}

const META_KEYS = new Set(['__localInsert', '__tempId'])
const MAX_CONTEXT_CHARS = 14_000
const MAX_SCHEMA_CHARS = 48_000
const MAX_QUERY_ROUNDS = 2
const LIVE_QUERY_ROW_LIMIT = 50

function sanitizeRows(rows: Record<string, unknown>[] | undefined, limit: number): Record<string, unknown>[] {
  if (!rows?.length) return []
  return rows.slice(0, limit).map((row) => {
    const out: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(row)) {
      if (META_KEYS.has(key)) continue
      if (typeof value === 'string' && value.length > 400) {
        out[key] = `${value.slice(0, 400)}…`
      } else if (value instanceof Date) {
        out[key] = value.toISOString()
      } else {
        out[key] = value
      }
    }
    return out
  })
}

function stringifyContext(value: unknown, max = MAX_CONTEXT_CHARS): string {
  const text = JSON.stringify(value, null, 2)
  if (text.length <= max) return text
  return `${text.slice(0, max)}\n…truncated`
}

function isReadOnlySql(sql: string): boolean {
  const cleaned = sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n]*/g, ' ')
    .trim()
  if (!cleaned) return false
  if (cleaned.includes(';') && cleaned.replace(/;\s*$/, '').includes(';')) return false
  return /^(SELECT|WITH|SHOW|DESCRIBE|DESC|EXPLAIN|PRAGMA)\b/i.test(cleaned)
}

function extractLiveQuery(text: string): string | null {
  const trimmed = text.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  const candidate = (fenced?.[1] ?? trimmed).trim()
  try {
    const parsed = JSON.parse(candidate) as { query?: unknown; sql?: unknown }
    const sql = typeof parsed.query === 'string' ? parsed.query : typeof parsed.sql === 'string' ? parsed.sql : null
    if (!sql) return null
    return sql.trim()
  } catch {
    return null
  }
}

function formatSavedSchema(snapshot: DbAiSchemaSnapshot, focusTable?: string): string {
  const header = {
    database: snapshot.database,
    schema: snapshot.schema,
    capturedAt: snapshot.capturedAt,
    tableCount: snapshot.tableCount
  }
  const full = stringifyContext({ ...header, tables: snapshot.tables }, MAX_SCHEMA_CHARS)
  if (full.length <= MAX_SCHEMA_CHARS) return full

  const related = new Set<string>()
  if (focusTable) {
    related.add(focusTable)
    const focus = snapshot.tables.find((t) => t.table === focusTable)
    for (const fk of focus?.foreignKeys ?? []) related.add(fk.referencedTable)
    for (const t of snapshot.tables) {
      if (t.foreignKeys.some((fk) => fk.referencedTable === focusTable)) related.add(t.table)
    }
  }

  const detailed = related.size
    ? snapshot.tables.filter((t) => related.has(t.table))
    : snapshot.tables.slice(0, 40)
  const summary = snapshot.tables
    .filter((t) => !detailed.some((d) => d.table === t.table))
    .map((t) => `${t.table}(${t.columns.map((c) => c.name).join(', ')})`)

  return stringifyContext(
    {
      ...header,
      note: 'Full schema was saved on connect. Detailed tables are shown first; remaining tables are summarized.',
      tables: detailed,
      otherTables: summary
    },
    MAX_SCHEMA_CHARS
  )
}

class DbWorkspaceAiService {
  async run(request: DbAiRequest): Promise<string> {
    const connection = await dbWorkspaceRepository.getConnection(request.connectionId)
    if (!connection) throw new Error('Connection not found')

    const db = request.database ?? connection.config.database ?? 'main'
    const schema = request.schema ?? connection.config.schema ?? connection.config.defaultSchema ?? 'public'

    let schemaContext = ''
    try {
      let snapshot = await dbWorkspaceService.getSavedAiSchema(request.connectionId, db, schema)
      if (!snapshot || snapshot.tableCount === 0) {
        snapshot = await dbWorkspaceService.captureAiSchema(request.connectionId, db, schema, true)
      }
      if (snapshot && snapshot.tables.length > 0) {
        schemaContext = formatSavedSchema(snapshot, request.table)
      } else {
        schemaContext = 'Schema snapshot is empty. Connect or select a database so tables can be saved for AI.'
      }
    } catch (e) {
      logger.warn(`AI schema context failed: ${e}`, 'DbWorkspaceAI')
      schemaContext = 'Schema metadata unavailable.'
    }

    const selectedRows = sanitizeRows(request.selectedRows, 40)
    let rowSample = sanitizeRows(request.rowSample, 20)
    if (!selectedRows.length && !rowSample.length && request.table) {
      try {
        const page = await dbWorkspaceService.fetchDataPage({
          connectionId: request.connectionId,
          database: db,
          schema,
          table: request.table,
          offset: 0,
          limit: 20
        })
        rowSample = sanitizeRows(page.rows, 20)
      } catch (e) {
        logger.warn(`AI row sample failed: ${e}`, 'DbWorkspaceAI')
      }
    }

    const queryResult = request.queryResult
      ? {
          sql: request.queryResult.sql,
          columns: request.queryResult.columns,
          rowCount: request.queryResult.rowCount,
          rows: sanitizeRows(request.queryResult.rows, 30)
        }
      : null

    const isMongo = connection.provider === 'mongodb'
    const queryRules = isMongo
      ? `- This is a MongoDB (document) database. "Tables" in the snapshot are collections and "columns" are fields inferred from sampled documents (types may be unions).
- You may run a read-only MongoDB shell query against the live database if the answer needs data that is not already in context.
- To run a query, respond with ONLY this JSON (no other text): {"query":"db.<collection>.find({...}).limit(${LIVE_QUERY_ROW_LIMIT})"}
- Allowed: find, findOne, aggregate (no $out/$merge), countDocuments, distinct. Never insert, update, delete, drop, or createIndex.
- When writing example code, use MongoDB shell / Node driver syntax (not SQL) and Mongoose for schemas instead of SQL ORMs.`
      : `- You may run a read-only SQL query against the live database if the answer needs data that is not already in context.
- To run a query, respond with ONLY this JSON (no other text): {"query":"SELECT ... LIMIT ${LIVE_QUERY_ROW_LIMIT}"}
- Allowed SQL: SELECT, WITH, SHOW, DESCRIBE, EXPLAIN, PRAGMA. Never INSERT, UPDATE, DELETE, DROP, ALTER, TRUNCATE, or GRANT.
- Always include LIMIT ${LIVE_QUERY_ROW_LIMIT} (or smaller) on SELECT queries.`

    const systemPrompt = `You are an expert database architect and DBA assistant for Database Workbench.
You are connected to the user's live database. A full schema snapshot (all tables, columns, indexes, and foreign keys) is saved when they connect or select a database. Use that snapshot as the schema source of truth.
Rules:
- Prefer answering from selected rows when they are provided — those are the rows the user highlighted.
- If selected rows and a broader sample are both present, treat selected rows as the primary subject.
- Be precise. Use Markdown. Quote actual cell values when discussing data.
- Never invent tables or columns that are not in the saved schema snapshot.
- Never invent rows that were not provided or returned by a query.
${queryRules}
- If the provided context is enough, answer directly — do not request a query.`

    const actionPrompt = ACTION_PROMPTS[request.action] ?? ACTION_PROMPTS.natural_language
    const conversation = (request.conversation ?? []).slice(-8)

    const userContent = [
      `Action: ${request.action}`,
      actionPrompt,
      `Live connection: ${connection.name} (${connection.provider}) · database ${db} · schema ${schema}`,
      request.table ? `Focus table: ${request.table}` : '',
      request.sql
        ? `Current ${isMongo ? 'MongoDB query' : 'SQL'} editor contents:\n\`\`\`${isMongo ? 'javascript' : 'sql'}\n${request.sql}\n\`\`\``
        : '',
      request.prompt ? `User question: ${request.prompt}` : '',
      selectedRows.length
        ? `Selected rows (${selectedRows.length} shown, answer about these first):\n\`\`\`json\n${stringifyContext(selectedRows, 6000)}\n\`\`\``
        : '',
      rowSample.length
        ? `Visible/sample rows from ${request.table ?? 'current table'} (${rowSample.length}):\n\`\`\`json\n${stringifyContext(rowSample, 4000)}\n\`\`\``
        : '',
      queryResult
        ? `Latest query result (${queryResult.rowCount} rows):\nSQL: ${queryResult.sql ?? '(unknown)'}\n\`\`\`json\n${stringifyContext(queryResult, 4000)}\n\`\`\``
        : '',
      `\nSaved schema snapshot (all tables from connect/select database):\n\`\`\`json\n${schemaContext}\n\`\`\``
    ]
      .filter(Boolean)
      .join('\n\n')

    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: systemPrompt },
      ...conversation.map((turn) => ({
        role: turn.role as 'user' | 'assistant',
        content: turn.content
      })),
      { role: 'user', content: userContent }
    ]

    let result = await aiRouter.chat(messages, {
      temperature: 0.3,
      maxTokens: 4096,
      requestType: 'DB_DESIGN',
      model: request.model
    })

    let answer = result.text.trim()
    let rounds = 0

    while (rounds < MAX_QUERY_ROUNDS) {
      const liveSql = extractLiveQuery(answer)
      if (!liveSql) break
      rounds += 1

      // MongoDB read-only enforcement happens in the provider (readonly: true below)
      if (!isMongo && !isReadOnlySql(liveSql)) {
        messages.push({ role: 'assistant', content: answer })
        messages.push({
          role: 'user',
          content: `Rejected query (only read-only SELECT/SHOW/DESCRIBE/EXPLAIN/PRAGMA is allowed):\n${liveSql}\nAnswer without mutating data, or request a valid read-only query.`
        })
      } else {
        try {
          const query = await dbWorkspaceService.executeQuery({
            connectionId: request.connectionId,
            sql: liveSql,
            database: db,
            maxRows: LIVE_QUERY_ROW_LIMIT,
            timeoutMs: 15_000,
            readonly: true
          })
          messages.push({ role: 'assistant', content: answer })
          messages.push({
            role: 'user',
            content: `Live query results for:\n\`\`\`sql\n${liveSql}\n\`\`\`\n${query.rowCount} rows (showing up to ${LIVE_QUERY_ROW_LIMIT}). Use these to answer the original question. Do not request another query unless still missing data.\n\`\`\`json\n${stringifyContext(
              {
                columns: query.columns.map((c) => c.name),
                rows: sanitizeRows(query.rows, LIVE_QUERY_ROW_LIMIT)
              },
              8000
            )}\n\`\`\``
          })
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          messages.push({ role: 'assistant', content: answer })
          messages.push({
            role: 'user',
            content: `The live query failed:\n${liveSql}\nError: ${msg}\nExplain the error or try a simpler read-only query.`
          })
        }
      }

      result = await aiRouter.chat(messages, {
        temperature: 0.3,
        maxTokens: 4096,
        requestType: 'DB_DESIGN',
        model: request.model
      })
      answer = result.text.trim()
    }

    return answer
  }
}

export const dbWorkspaceAiService = new DbWorkspaceAiService()
