import { autocompletion, type Completion, type CompletionContext } from '@codemirror/autocomplete'
import type { DbExplorerNode } from '@shared/types/database-workspace'

const SQL_KEYWORDS = [
  'SELECT', 'FROM', 'WHERE', 'JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'INNER JOIN', 'OUTER JOIN',
  'ON', 'GROUP BY', 'ORDER BY', 'HAVING', 'LIMIT', 'OFFSET', 'INSERT INTO', 'UPDATE', 'DELETE',
  'CREATE TABLE', 'ALTER TABLE', 'DROP TABLE', 'TRUNCATE', 'DISTINCT', 'AS', 'AND', 'OR', 'NOT',
  'IN', 'EXISTS', 'BETWEEN', 'LIKE', 'IS NULL', 'IS NOT NULL', 'COUNT', 'SUM', 'AVG', 'MIN', 'MAX'
]

function collectObjects(tree: DbExplorerNode[]): { tables: string[]; views: string[] } {
  const tables: string[] = []
  const views: string[] = []

  const walk = (nodes: DbExplorerNode[]) => {
    for (const node of nodes) {
      if (node.type === 'table' && node.table) tables.push(node.table)
      if (node.type === 'view' && node.table) views.push(node.table)
      if (node.children?.length) walk(node.children)
    }
  }
  walk(tree)
  return { tables: [...new Set(tables)], views: [...new Set(views)] }
}

function wordBefore(context: CompletionContext): { from: number; text: string } | null {
  const word = context.matchBefore(/[\w`.]+/)
  if (!word || (word.from === word.to && !context.explicit)) return null
  return { from: word.from, text: word.text.replace(/`/g, '') }
}

export function buildSqlCompletionExtension(explorerTree: DbExplorerNode[], databases: string[]) {
  const { tables, views } = collectObjects(explorerTree)

  return autocompletion({
    activateOnTyping: true,
    override: [
      (context: CompletionContext) => {
        const word = wordBefore(context)
        if (!word) return null

        const prefix = word.text.toLowerCase()
        const options: Completion[] = []

        for (const kw of SQL_KEYWORDS) {
          if (kw.toLowerCase().startsWith(prefix)) {
            options.push({ label: kw, type: 'keyword', boost: 1 })
          }
        }
        for (const db of databases) {
          if (db.toLowerCase().startsWith(prefix)) {
            options.push({ label: db, type: 'namespace', detail: 'database' })
          }
        }
        for (const t of tables) {
          if (t.toLowerCase().startsWith(prefix)) {
            options.push({ label: t, type: 'variable', detail: 'table' })
          }
        }
        for (const v of views) {
          if (v.toLowerCase().startsWith(prefix)) {
            options.push({ label: v, type: 'interface', detail: 'view' })
          }
        }

        if (options.length === 0) return null
        return { from: word.from, options, validFor: /^[\w`.]*$/ }
      }
    ]
  })
}
